import { describe, expect, it } from 'vitest';
import { parseM3U8 } from '../src/m3u8-parser';

describe('m3u8-parser strictness', () => {
  it('throws for a dangling #EXTINF', () => {
    expect(() => parseM3U8('#EXTM3U\n#EXTINF:10,\n')).toThrow('#EXTINF without a segment URI');
  });

  it('throws for a dangling #EXT-X-STREAM-INF', () => {
    expect(() => parseM3U8('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\n')).toThrow(
      '#EXT-X-STREAM-INF without a URI',
    );
  });

  it('throws for a segment URI without #EXTINF', () => {
    expect(() => parseM3U8('#EXTM3U\nsegment.ts\n')).toThrow('segment URI without #EXTINF');
  });

  it('throws for duplicate #EXTINF before a segment URI', () => {
    expect(() => parseM3U8('#EXTM3U\n#EXTINF:10,\n#EXTINF:10,\nsegment.ts\n')).toThrow(
      'duplicate #EXTINF',
    );
  });

  it('throws for an invalid media sequence', () => {
    expect(() => parseM3U8('#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1e3\n#EXTINF:10,\nsegment.ts\n')).toThrow(
      'Invalid #EXT-X-MEDIA-SEQUENCE',
    );
  });

  it('throws for a negative duration', () => {
    expect(() => parseM3U8('#EXTM3U\n#EXTINF:-1,\nsegment.ts\n')).toThrow('Invalid #EXTINF duration');
  });

  it('throws for non-identity AES-128 key formats', () => {
    expect(() =>
      parseM3U8(
        '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key",KEYFORMAT="com.apple.streamingkeydelivery"\n#EXTINF:10,\nsegment.ts\n',
      ),
    ).toThrow('Unsupported AES-128 key format');
  });

  it('throws for non-HTTP AES-128 key URIs', () => {
    expect(() =>
      parseM3U8('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="skd://key"\n#EXTINF:10,\nsegment.ts\n'),
    ).toThrow('Unsupported AES-128 key URI');
  });

  it('does not treat an empty media URI as a separate audio group', () => {
    const playlist = parseM3U8(
      '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI=""\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvideo.m3u8\n',
    );

    expect(playlist.separateAudioGroups).toEqual([]);
    expect(playlist.variants?.[0]?.audioGroup).toBeUndefined();
  });

  it('keeps the audio group on the variants that reference it', () => {
    const playlist = parseM3U8(`#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000,AUDIO="audio"
with-audio.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000
muxed.m3u8
`);

    expect(playlist.separateAudioGroups).toEqual(['audio']);
    expect(playlist.variants?.[0]?.audioGroup).toBe('audio');
    expect(playlist.variants?.[1]?.audioGroup).toBeUndefined();
  });
});
