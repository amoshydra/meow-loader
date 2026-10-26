import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { downloadSegmentToFile } from '../src/downloader';
import { NetworkClient } from '../src/network';
import type { M3U8Segment } from '../src/m3u8-parser';

let plaintext: Uint8Array;

describe('AES-128 segment download', () => {
  let server: Server;
  let baseUrl: string;
  let tempRoot: string;
  let keyRequests = 0;

  const key1 = new Uint8Array(16).fill(1);
  const key2 = new Uint8Array(16).fill(2);
  const explicitIv = Uint8Array.from({ length: 16 }, (_, index) => index + 1);

  beforeAll(async () => {
    plaintext = await readFile(join(import.meta.dirname, 'fixtures', 'segments', 'segment_000_red.ts'));
    tempRoot = await mkdtemp(join(tmpdir(), 'meow-loader-aes-'));
    server = createServer(async (request, response) => {
      const pathname = new URL(request.url || '/', 'http://localhost').pathname;

      if (pathname === '/key-1.bin') {
        keyRequests++;
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(Buffer.from(key1));
        return;
      }

      if (pathname === '/key-2.bin') {
        response.writeHead(200, { 'content-type': 'application/octet-stream' });
        response.end(Buffer.from(key2));
        return;
      }

      if (pathname === '/segment-default-iv.ts') {
        const iv = new Uint8Array(16);
        iv[15] = 10;
        response.end(Buffer.from(await encrypt(key1, iv)));
        return;
      }

      if (pathname === '/segment-explicit-iv.ts') {
        response.end(Buffer.from(await encrypt(key2, explicitIv)));
        return;
      }

      if (pathname === '/segment-reused-key.ts') {
        response.end(Buffer.from(await encrypt(key1, new Uint8Array(16))));
        return;
      }

      response.writeHead(404);
      response.end('not found');
    });

    await new Promise<void>((resolveListening) => {
      server.listen(0, '127.0.0.1', () => resolveListening());
    });

    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Failed to start AES test server');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolveClose, reject) => {
      server.close(error => (error ? reject(error) : resolveClose()));
    });
    await rm(tempRoot, { recursive: true, force: true });
  });

  function network(): NetworkClient {
    return new NetworkClient({
      playlistUrl: `${baseUrl}/playlist.m3u8`,
      allowPrivateNetwork: true,
    });
  }

  async function download(segment: M3U8Segment, name: string, keyCache: Map<string, Buffer>) {
    const destination = join(tempRoot, name);
    await downloadSegmentToFile(segment, `${baseUrl}/playlist.m3u8`, destination, {
      network: network(),
      keyCache,
      maxBytes: 1024 * 1024,
    });
    return readFile(destination);
  }

  it('uses the media sequence as the default IV', async () => {
    const segment: M3U8Segment = {
      uri: 'segment-default-iv.ts',
      duration: 10,
      sequence: 10,
      encryption: { method: 'AES-128', uri: 'key-1.bin' },
    };

    const result = await download(segment, 'default-iv.ts', new Map());

    expect(Array.from(result)).toEqual(Array.from(plaintext));
  });

  it('uses an explicit IV when present', async () => {
    const segment: M3U8Segment = {
      uri: 'segment-explicit-iv.ts',
      duration: 10,
      sequence: 0,
      encryption: {
        method: 'AES-128',
        uri: 'key-2.bin',
        iv: '0x0102030405060708090a0b0c0d0e0f10',
      },
    };

    const result = await download(segment, 'explicit-iv.ts', new Map());

    expect(Array.from(result)).toEqual(Array.from(plaintext));
  });

  it('caches keys by URL across segments', async () => {
    keyRequests = 0;
    const keyCache = new Map<string, Buffer>();
    const segment: M3U8Segment = {
      uri: 'segment-reused-key.ts',
      duration: 10,
      sequence: 0,
      encryption: { method: 'AES-128', uri: 'key-1.bin' },
    };

    await download(segment, 'reused-key-1.ts', keyCache);
    await download(segment, 'reused-key-2.ts', keyCache);

    expect(keyRequests).toBe(1);
  });
});

async function encrypt(keyBytes: Uint8Array, iv: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC' }, false, ['encrypt']);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext);
  return new Uint8Array(encrypted);
}
