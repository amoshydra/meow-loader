import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadSegmentToFile } from '../src/downloader';
import { NetworkClient } from '../src/network';

const fixture = join(fileURLToPath(new URL('.', import.meta.url)), 'fixtures', 'segments', 'segment_000_red.ts');

describe('downloader security', () => {
  let server: Server;
  let baseUrl: string;
  let tempRoot: string;

  beforeAll(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'meow-loader-security-'));
    server = createServer(async (_request, response) => {
      const content = await readFile(fixture);
      response.writeHead(200, {
        'content-type': 'video/mp2t',
        'content-length': content.byteLength,
      });
      response.end(content);
    });

    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start server');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(error => (error ? reject(error) : resolve()));
    });
    await rm(tempRoot, { recursive: true, force: true });
  });

  function client() {
    return new NetworkClient({
      playlistUrl: `${baseUrl}/playlist.m3u8`,
      allowPrivateNetwork: true,
    });
  }

  it('does not write through a pre-created symlink', async () => {
    const victim = join(tempRoot, 'victim.txt');
    const destination = join(tempRoot, 'segment.ts.part');
    await writeFile(victim, 'ORIGINAL');
    await symlink(victim, destination);

    await expect(
      downloadSegmentToFile(
        { uri: 'segment.ts', duration: 10, sequence: 0 },
        `${baseUrl}/playlist.m3u8`,
        destination,
        { network: client(), keyCache: new Map(), maxBytes: 1024 * 1024 },
      ),
    ).rejects.toThrow();

    expect(await readFile(victim, 'utf8')).toBe('ORIGINAL');
  });

  it('rejects segments above the configured size limit', async () => {
    const destination = join(tempRoot, 'too-large.ts.part');

    await expect(
      downloadSegmentToFile(
        { uri: 'segment.ts', duration: 10, sequence: 0 },
        `${baseUrl}/playlist.m3u8`,
        destination,
        { network: client(), keyCache: new Map(), maxBytes: 1000 },
      ),
    ).rejects.toThrow('above the');
  });
});
