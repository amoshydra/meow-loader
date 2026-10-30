import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args';

// Captured from a browser "Copy as cURL" command.
const copiedCommand = [
  'curl',
  '--url',
  'http://127.0.0.1:8080/',
  '-H',
  'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  '-H',
  'Accept-Language: en-US,en;q=0.9',
  '-H',
  'Cache-Control: max-age=0',
  '-H',
  'Connection: keep-alive',
  '-b',
  'vscode-secret-key-path=/_vscode-cli/mint-key; vscode-cli-secret-half=qekfON1W9wXugc6P7Lh98nYnj0hMmngEkwqXeeF5Zls=',
  '-H',
  'Referer: http://127.0.0.1:8080/',
  '-H',
  'Sec-Fetch-Dest: document',
  '-H',
  'Upgrade-Insecure-Requests: 1',
  '-H',
  'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36',
  '-H',
  'sec-ch-ua: "Chromium";v="158", "Not.A/Brand";v="24", "Google Chrome";v="158"',
  '-H',
  'sec-ch-ua-mobile: ?0',
  '-H',
  'sec-ch-ua-platform: "Linux"',
];

function run(args: string[]) {
  return parseArgs(['node', 'meow-loader', ...args]);
}

describe('curl mode', () => {
  it('parses a pasted Copy as cURL command', () => {
    const args = run(copiedCommand);

    expect(args.positionals).toEqual(['http://127.0.0.1:8080/']);
    expect(args.headers).toMatchObject({
      Accept: expect.stringContaining('text/html'),
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'max-age=0',
      Referer: 'http://127.0.0.1:8080/',
      'Sec-Fetch-Dest': 'document',
      'Upgrade-Insecure-Requests': '1',
      'sec-ch-ua': '"Chromium";v="158", "Not.A/Brand";v="24", "Google Chrome";v="158"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Linux"',
    });
    expect(args.headers.Cookie).toBe(
      'vscode-secret-key-path=/_vscode-cli/mint-key; vscode-cli-secret-half=qekfON1W9wXugc6P7Lh98nYnj0hMmngEkwqXeeF5Zls=',
    );
    // Hop-by-hop headers are dropped rather than forwarded.
    expect(args.headers.Connection).toBeUndefined();
    expect(args.force).toBe(false);
    expect(args.allowInsecure).toBe(false);
  });

  it('accepts a bare URL after the curl token', () => {
    const args = run(['curl', 'https://example.com/video.m3u8', '--compressed']);

    expect(args.positionals).toEqual(['https://example.com/video.m3u8']);
  });

  it('supports output and variant positionals', () => {
    const args = run(['curl', 'https://example.com/master.m3u8', 'video.mp4', '1', '-H', 'A: b']);

    expect(args.positionals).toEqual(['https://example.com/master.m3u8', 'video.mp4', '1']);
  });

  it('maps curl -o/--output to the output file', () => {
    expect(run(['curl', 'https://example.com/a.m3u8', '-o', 'out.mp4']).positionals).toEqual([
      'https://example.com/a.m3u8',
      'out.mp4',
    ]);
    expect(run(['curl', 'https://example.com/a.m3u8', '--output=out.mp4']).positionals).toEqual([
      'https://example.com/a.m3u8',
      'out.mp4',
    ]);
  });

  it('allows a variant index after -o', () => {
    const args = run(['curl', 'https://example.com/a.m3u8', '-o', 'out.mp4', '2']);

    expect(args.positionals).toEqual(['https://example.com/a.m3u8', 'out.mp4', '2']);
  });

  it('maps -A and -e to headers', () => {
    const args = run(['curl', 'https://example.com/a.m3u8', '-A', 'agent', '-e', 'https://ref.example']);

    expect(args.headers['User-Agent']).toBe('agent');
    expect(args.headers.Referer).toBe('https://ref.example');
  });

  it('merges repeated cookies and cookie headers', () => {
    const args = run([
      'curl',
      'https://example.com/a.m3u8',
      '-H',
      'Cookie: a=b',
      '-b',
      'c=d',
      '--cookie',
      'e=f',
    ]);

    expect(args.headers.Cookie).toBe('a=b; c=d; e=f');
  });

  it('maps -k/--insecure to --allow-insecure', () => {
    expect(run(['curl', 'https://example.com/a.m3u8', '-k']).allowInsecure).toBe(true);
    expect(run(['curl', 'https://example.com/a.m3u8', '--insecure']).allowInsecure).toBe(true);
  });

  it('treats curl -f as --fail, not --force', () => {
    expect(run(['curl', 'https://example.com/a.m3u8', '-f']).force).toBe(false);
    expect(run(['curl', 'https://example.com/a.m3u8', '--force']).force).toBe(true);
  });

  it('accepts harmless curl flags', () => {
    const args = run([
      'curl',
      'https://example.com/a.m3u8',
      '--compressed',
      '-L',
      '--http2',
      '-sSL',
      '--no-progress-meter',
    ]);

    expect(args.positionals).toEqual(['https://example.com/a.m3u8']);
  });

  it('supports attached option values', () => {
    const args = run([
      'curl',
      '--url=https://example.com/a.m3u8',
      '-Haccept: */*',
      '-bsession=abc',
      '-Aagent',
      '-ehttps://ref.example',
    ]);

    expect(args.headers).toEqual({
      accept: '*/*',
      Cookie: 'session=abc',
      'User-Agent': 'agent',
      Referer: 'https://ref.example',
    });
  });

  it('still accepts meow-loader options after a pasted command', () => {
    const args = run([
      'curl',
      'https://example.com/a.m3u8',
      '--compressed',
      '--dry-run',
      '--allow-private-network',
      '--max-download',
      '1GB',
      '--header-origin',
      'https://cdn.example.com',
    ]);

    expect(args.dryRun).toBe(true);
    expect(args.allowPrivateNetwork).toBe(true);
    expect(args.maxDownload).toBe(1000 ** 3);
    expect(args.headerOrigins).toEqual(['https://cdn.example.com']);
  });

  it('rejects unsupported curl options with a reason', () => {
    expect(() => run(['curl', 'https://example.com/a.m3u8', '--data-raw', 'x'])).toThrow(
      'Unsupported curl option "--data-raw": request bodies are not supported',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-X', 'POST'])).toThrow(
      'Unsupported curl option "-X": meow-loader only sends GET requests',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-u', 'user:pass'])).toThrow(
      'Basic authentication is not supported',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '--resolve', 'host:443:1.2.3.4'])).toThrow(
      'custom DNS resolution',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '--proxy', 'http://proxy'])).toThrow(
      'proxies are not supported',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-O'])).toThrow(
      'writing to a generated filename is not supported',
    );
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-I'])).toThrow('HEAD requests are not supported');
  });

  it('rejects unknown curl options', () => {
    expect(() => run(['curl', 'https://example.com/a.m3u8', '--max-time', '10'])).toThrow(
      'Unsupported curl option "--max-time"',
    );
  });

  it('rejects cookie files', () => {
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-b', 'cookies.txt'])).toThrow(
      'Cookie files are not supported',
    );
  });

  it('rejects writing to stdout', () => {
    expect(() => run(['curl', 'https://example.com/a.m3u8', '-o', '-'])).toThrow(
      'Writing to stdout is not supported',
    );
  });

  it('rejects multiple URLs', () => {
    expect(() =>
      run(['curl', '--url', 'https://example.com/a.m3u8', 'https://example.com/b.m3u8']),
    ).toThrow('Only one URL is supported');
    expect(() =>
      run(['curl', '--url', 'https://example.com/a.m3u8', '--url', 'https://example.com/b.m3u8']),
    ).toThrow('Only one URL is supported');
  });

  it('rejects extra positionals', () => {
    expect(() => run(['curl', 'https://example.com/a.m3u8', 'out.mp4', '0', 'extra'])).toThrow(
      'Unexpected argument: extra',
    );
  });

  it('points at the misplaced curl token', () => {
    expect(() => run(['--force', 'curl', '--url', 'https://example.com/a.m3u8'])).toThrow(
      'The "curl" command must be the first argument',
    );
  });

  it('keeps ordinary invocations unchanged', () => {
    const args = run(['https://example.com/a.m3u8', 'out.mp4', '-H', 'A: b']);

    expect(args.positionals).toEqual(['https://example.com/a.m3u8', 'out.mp4']);
    expect(args.headers).toEqual({ A: 'b' });
  });
});

describe('header validation', () => {
  it('rejects headers without a colon without echoing the value', () => {
    expect(() => run(['https://example.com/a.m3u8', '-H', 'Authorization Bearer secret'])).toThrow(
      'Invalid header format',
    );
    try {
      run(['https://example.com/a.m3u8', '-H', 'Authorization Bearer secret']);
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });

  it('rejects line breaks in header values without echoing them', () => {
    try {
      run(['https://example.com/a.m3u8', '-H', 'X-Test: a\r\nX-Injected: 1']);
      throw new Error('expected parseArgs to throw');
    } catch (error) {
      expect(String(error)).toContain('Invalid value for header "X-Test"');
      expect(String(error)).not.toContain('X-Injected');
    }
  });

  it('rejects invalid header names', () => {
    expect(() => run(['https://example.com/a.m3u8', '-H', 'Bad Header: value'])).toThrow(
      'Invalid header name',
    );
  });

  it('rejects Range and Host headers', () => {
    expect(() => run(['https://example.com/a.m3u8', '-H', 'Range: bytes=0-'])).toThrow(
      'The "Range" header is not supported',
    );
    expect(() => run(['https://example.com/a.m3u8', '-H', 'Host: example.com'])).toThrow(
      'The "Host" header is not supported',
    );
  });

  it('drops hop-by-hop headers', () => {
    const args = run([
      'https://example.com/a.m3u8',
      '-H',
      'Connection: keep-alive',
      '-H',
      'Transfer-Encoding: chunked',
      '-H',
      'X-Keep: yes',
    ]);

    expect(args.headers).toEqual({ 'X-Keep': 'yes' });
  });
});
