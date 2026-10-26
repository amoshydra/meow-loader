import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import { NetworkClient, isPrivateAddress } from '../src/network';

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '0.0.0.0',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1',
  ])('blocks %s', address => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
    'allows public %s',
    address => {
      expect(isPrivateAddress(address)).toBe(false);
    },
  );
});

describe('NetworkClient', () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        server =>
          new Promise<void>((resolve, reject) => {
            server.close(error => (error ? reject(error) : resolve()));
          }),
      ),
    );
  });

  async function listen(handler: Parameters<typeof createServer>[1]): Promise<{ server: Server; url: string }> {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Failed to start server');
    return { server, url: `http://127.0.0.1:${address.port}` };
  }

  it('does not send custom headers to a different origin by default', async () => {
    let received: IncomingHttpHeaders = {};
    const segment = await listen((request, response) => {
      received = request.headers;
      response.end('ok');
    });
    const playlist = await listen((_request, response) => response.end('ok'));

    const client = new NetworkClient({
      playlistUrl: `${playlist.url}/playlist.m3u8`,
      userHeaders: { Authorization: 'Bearer secret', 'X-Api-Key': 'secret' },
      allowPrivateNetwork: true,
    });

    await client.fetch(`${segment.url}/segment.ts`);

    expect(received.authorization).toBeUndefined();
    expect(received['x-api-key']).toBeUndefined();
  });

  it('sends custom headers to an explicitly allowed origin', async () => {
    let received: IncomingHttpHeaders = {};
    const segment = await listen((request, response) => {
      received = request.headers;
      response.end('ok');
    });
    const playlist = await listen((_request, response) => response.end('ok'));

    const client = new NetworkClient({
      playlistUrl: `${playlist.url}/playlist.m3u8`,
      userHeaders: { Authorization: 'Bearer secret', 'X-Api-Key': 'secret' },
      headerOrigins: [segment.url],
      allowPrivateNetwork: true,
    });

    await client.fetch(`${segment.url}/segment.ts`);

    expect(received.authorization).toBe('Bearer secret');
    expect(received['x-api-key']).toBe('secret');
  });

  it('does not forward custom headers across a cross-origin redirect', async () => {
    let received: IncomingHttpHeaders = {};
    let targetUrl = '';
    const target = await listen((request, response) => {
      received = request.headers;
      response.end('ok');
    });
    targetUrl = target.url;

    const redirect = await listen((_request, response) => {
      response.writeHead(302, { location: `${targetUrl}/target.ts` });
      response.end();
    });
    const playlist = await listen((_request, response) => response.end('ok'));

    const client = new NetworkClient({
      playlistUrl: `${playlist.url}/playlist.m3u8`,
      userHeaders: { Authorization: 'Bearer secret', 'X-Api-Key': 'secret' },
      allowPrivateNetwork: true,
    });

    await client.fetch(`${redirect.url}/redirect.ts`);

    expect(received.authorization).toBeUndefined();
    expect(received['x-api-key']).toBeUndefined();
  });

  it('blocks private-network manifests unless explicitly allowed', async () => {
    const client = new NetworkClient({ playlistUrl: 'http://example.com/playlist.m3u8' });

    await expect(client.fetch('http://127.0.0.1:9/segment.ts')).rejects.toThrow('private network');
  });

  it('allows private-network manifests when opted in', async () => {
    const server = await listen((_request, response) => response.end('ok'));
    const client = new NetworkClient({
      playlistUrl: `${server.url}/playlist.m3u8`,
      allowPrivateNetwork: true,
    });

    const response = await client.fetch(`${server.url}/segment.ts`);
    expect(response.ok).toBe(true);
  });

  it('rejects unsupported URL schemes and embedded credentials', async () => {
    const client = new NetworkClient({
      playlistUrl: 'https://example.com/playlist.m3u8',
      allowPrivateNetwork: true,
    });

    await expect(client.fetch('data:text/plain,hello')).rejects.toThrow('not supported');
    await expect(client.fetch('https://user:pass@example.com/segment.ts')).rejects.toThrow(
      'embedded credentials',
    );
  });

  it('refuses HTTPS-to-HTTP resource URLs', async () => {
    const client = new NetworkClient({
      playlistUrl: 'https://example.com/playlist.m3u8',
      allowPrivateNetwork: true,
    });

    await expect(client.fetch('http://example.com/segment.ts')).rejects.toThrow(
      'HTTPS-to-HTTP',
    );
  });
});
