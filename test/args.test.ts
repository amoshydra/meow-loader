import { describe, it, expect } from 'vitest';
import { parseArgs, parseByteSize, DEFAULT_MAX_DOWNLOAD, DEFAULT_MAX_SEGMENT_SIZE } from '../src/args';

describe('parseArgs', () => {
  it('parses positionals', () => {
    const args = parseArgs(['node', 'meow-loader', 'https://example.com/video.m3u8', 'out.mp4', '1']);

    expect(args.positionals).toEqual(['https://example.com/video.m3u8', 'out.mp4', '1']);
    expect(args.force).toBe(false);
    expect(args.cleanup).toBe(false);
  });

  it('parses repeated headers', () => {
    const args = parseArgs([
      'node',
      'meow-loader',
      'https://example.com/video.m3u8',
      '-H',
      'Authorization: Bearer token',
      '--header',
      'Referer: https://example.com',
    ]);

    expect(args.headers).toEqual({
      Authorization: 'Bearer token',
      Referer: 'https://example.com',
    });
  });

  it('parses --resume, --cleanup, and --force', () => {
    const args = parseArgs([
      'node',
      'meow-loader',
      'https://example.com/video.m3u8',
      '--resume',
      '/tmp/meow',
      '--cleanup',
      '--force',
    ]);

    expect(args.resumeDir).toBe('/tmp/meow');
    expect(args.cleanup).toBe(true);
    expect(args.force).toBe(true);
  });

  it('parses security and large-file options', () => {
    const args = parseArgs([
      'node',
      'meow-loader',
      'https://example.com/video.m3u8',
      '--header-origin',
      'https://cdn.example.com',
      '--allow-private-network',
      '--allow-insecure',
      '--dry-run',
      '--max-download',
      '10GB',
      '--max-segment-size',
      '500MB',
    ]);

    expect(args.headerOrigins).toEqual(['https://cdn.example.com']);
    expect(args.allowPrivateNetwork).toBe(true);
    expect(args.allowInsecure).toBe(true);
    expect(args.dryRun).toBe(true);
    expect(args.maxDownload).toBe(10 * 1000 ** 3);
    expect(args.maxSegmentSize).toBe(500 * 1000 ** 2);
  });

  it('uses safe default limits', () => {
    const args = parseArgs(['node', 'meow-loader', 'https://example.com/video.m3u8']);

    expect(args.maxDownload).toBe(DEFAULT_MAX_DOWNLOAD);
    expect(args.maxSegmentSize).toBe(DEFAULT_MAX_SEGMENT_SIZE);
    expect(args.allowPrivateNetwork).toBe(false);
    expect(args.allowInsecure).toBe(false);
  });

  it('parses byte sizes', () => {
    expect(parseByteSize('1GB')).toBe(1000 ** 3);
    expect(parseByteSize('1GiB')).toBe(1024 ** 3);
    expect(parseByteSize('1.5MB')).toBe(1.5 * 1000 ** 2);
    expect(parseByteSize('0')).toBe(0);
    expect(() => parseByteSize('huge')).toThrow('Invalid size');
  });

  it('parses help and version flags', () => {
    expect(parseArgs(['node', 'meow-loader', '--help']).help).toBe(true);
    expect(parseArgs(['node', 'meow-loader', '--version']).version).toBe(true);
  });

  it('rejects unknown options', () => {
    expect(() => parseArgs(['node', 'meow-loader', '--unknown'])).toThrow('Unknown option: --unknown');
  });

  it('rejects headers without a colon', () => {
    expect(() => parseArgs(['node', 'meow-loader', '-H', 'Authorization'])).toThrow(
      'Invalid header format "Authorization"',
    );
  });

  it('rejects missing option values', () => {
    expect(() => parseArgs(['node', 'meow-loader', '--resume'])).toThrow('--resume requires a directory path');
    expect(() => parseArgs(['node', 'meow-loader', '-H'])).toThrow('--header/-H requires an argument');
  });

  it('supports the option terminator', () => {
    const args = parseArgs(['node', 'meow-loader', '--', '--not-an-option']);

    expect(args.positionals).toEqual(['--not-an-option']);
  });
});
