import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { initializeResumeState, saveResumeMetadata } from '../src/resume';
import type { ResumeTrackInput } from '../src/resume';

function token(nonce: string): string {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${nonce}.${encode({ typ: 'JWT', alg: 'HS256' })}.${encode({ exp: 2000000000, paths: ['/'] })}.signature`;
}

const oldUrl = `https://example.cloudfront.net/${token('old')}/event_123/index_4.m3u8`;
const newUrl = `https://example.cloudfront.net/${token('new')}/event_123/index_4.m3u8`;
const segments = [{ uri: 'segment_0.ts', duration: 2, sequence: 0 }];

describe('resume with refreshed CloudFront path tokens', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'meow-resume-token-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  function initialize(url: string, video: Partial<ResumeTrackInput> = {}, audio = false) {
    return initializeResumeState({
      dir, sourceUrl: url, persist: true,
      video: { mediaPlaylistUrl: url, segments, container: 'mpegts', ...video },
      ...(audio ? {
        audio: {
          mediaPlaylistUrl: url.replace('index_4', 'audio'),
          segments, container: 'mpegts' as const,
        },
      } : {}),
    });
  }

  it('reuses a validated segment from existing metadata after token rotation', async () => {
    const state = await initialize(oldUrl);
    const fixture = new URL('./fixtures/segments/segment_000_red.ts', import.meta.url);
    const bytes = await readFile(fixture);
    await copyFile(fixture, join(dir, 'segment_0.ts'));
    state.metadata.segments['0'] = {
      fileName: 'segment_0.ts', size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
    await saveResumeMetadata(dir, state.metadata);

    const resumed = await initialize(newUrl);

    expect(resumed.completed).toEqual(new Set([0]));
    expect(resumed.metadata.sourceDisplay).toBe(newUrl);
    expect(resumed.metadata.mediaPlaylistUrlDisplay).toBe(newUrl);
  });

  it('supports separate audio playlists with rotated tokens', async () => {
    await initialize(oldUrl, {}, true);
    const state = await initialize(newUrl, {}, true);
    expect(state.metadata.audio?.mediaPlaylistUrlDisplay).toBe(newUrl.replace('index_4', 'audio'));
  });

  it.each([
    ['event', newUrl.replace('event_123', 'event_456')],
    ['variant', newUrl.replace('index_4', 'index_5')],
    ['host', newUrl.replace('example.cloudfront.net', 'other.cloudfront.net')],
    ['query', `${newUrl}?variant=5`],
    ['malformed token', newUrl.replace(token('new'), 'not-a-token')],
  ])('rejects a changed %s', async (_label, url) => {
    await initialize(oldUrl);
    await expect(initialize(url)).rejects.toThrow('different');
  });

  it('retains query identity when both token URLs include a query', async () => {
    await initialize(`${oldUrl}?variant=4`);
    await expect(initialize(`${newUrl}?variant=5`)).rejects.toThrow('different media playlist');
    await expect(initialize(`${newUrl}?variant=4`)).resolves.toBeDefined();
  });

  it('rejects a different segment list after token rotation', async () => {
    await initialize(oldUrl);
    await expect(initialize(newUrl, {
      segments: [{ ...segments[0]!, uri: 'other.ts' }],
    })).rejects.toThrow('different version');
  });

  it('rejects ordinary changed path components on other hosts', async () => {
    await initialize(oldUrl.replace('example.cloudfront.net', 'example.com'));
    await expect(initialize(newUrl.replace('example.cloudfront.net', 'example.com')))
      .rejects.toThrow('different playlist');
  });
});
