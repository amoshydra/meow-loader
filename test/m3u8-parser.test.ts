import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseM3U8, sortVariantsByBandwidth } from '../src/m3u8-parser';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesDir = join(__dirname, 'fixtures');

describe('m3u8-parser', () => {
  describe('media playlist parsing', () => {
    it('should parse a valid media playlist', () => {
      const content = readFileSync(join(fixturesDir, 'playlist.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      expect(playlist.isMaster).toBe(false);
      expect(playlist.targetDuration).toBe(10);
      expect(playlist.segments).toHaveLength(3);
      expect(playlist.hasEndList).toBe(true);
      expect(playlist.mediaSequence).toBe(0);
    });

    it('should parse segments correctly', () => {
      const content = readFileSync(join(fixturesDir, 'playlist.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      expect(playlist.segments?.[0]).toEqual({
        uri: 'segments/segment_000_red.ts',
        duration: 10,
        title: '',
        sequence: 0,
      });
      expect(playlist.segments?.[1]).toEqual({
        uri: 'segments/segment_001_blue.ts',
        duration: 10,
        title: '',
        sequence: 1,
      });
      expect(playlist.segments?.[2]).toEqual({
        uri: 'segments/segment_002_green.ts',
        duration: 10,
        title: '',
        sequence: 2,
      });
    });

    it('should parse segments with various colors', () => {
      const content = readFileSync(join(fixturesDir, 'playlist.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      const segmentColors = playlist.segments?.map((s) => {
        if (s.uri.includes('red')) return 'red';
        if (s.uri.includes('blue')) return 'blue';
        if (s.uri.includes('green')) return 'green';
        return 'unknown';
      });

      expect(segmentColors).toEqual(['red', 'blue', 'green']);
    });

    it('should strip a UTF-8 BOM from the first line', () => {
      const content = `\uFEFF${readFileSync(join(fixturesDir, 'playlist.m3u8'), 'utf-8')}`;
      const playlist = parseM3U8(content);

      expect(playlist.segments).toHaveLength(3);
    });

    it('should track encryption per segment and the media sequence', () => {
      const content = `#EXTM3U
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:42
#EXT-X-KEY:METHOD=AES-128,URI="key-1.bin"
#EXTINF:10,
segment-0.ts
#EXT-X-KEY:METHOD=AES-128,URI="key-2.bin",IV=0x000102030405060708090a0b0c0d0e0f
#EXTINF:10,
segment-1.ts
#EXT-X-KEY:METHOD=NONE
#EXTINF:10,
segment-2.ts
#EXT-X-ENDLIST
`;
      const playlist = parseM3U8(content);

      expect(playlist.segments).toHaveLength(3);
      expect(playlist.segments?.[0]).toMatchObject({
        uri: 'segment-0.ts',
        sequence: 42,
        encryption: { method: 'AES-128', uri: 'key-1.bin' },
      });
      expect(playlist.segments?.[1]).toMatchObject({
        uri: 'segment-1.ts',
        sequence: 43,
        encryption: {
          method: 'AES-128',
          uri: 'key-2.bin',
          iv: '0x000102030405060708090a0b0c0d0e0f',
        },
      });
      expect(playlist.segments?.[2]).toMatchObject({
        uri: 'segment-2.ts',
        sequence: 44,
      });
      expect(playlist.segments?.[2]?.encryption).toBeUndefined();
    });
  });

  describe('master playlist parsing', () => {
    it('should identify master playlist', () => {
      const content = readFileSync(join(fixturesDir, 'master.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      expect(playlist.isMaster).toBe(true);
      expect(playlist.segments).toBeUndefined();
      expect(playlist.variants).toBeDefined();
    });

    it('should parse variants correctly', () => {
      const content = readFileSync(join(fixturesDir, 'master.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      expect(playlist.variants).toHaveLength(3);
      expect(playlist.variants?.[0]).toEqual({
        bandwidth: 500000,
        resolution: '480x360',
        uri: 'playlist_480.m3u8',
      });
      expect(playlist.variants?.[1]).toEqual({
        bandwidth: 1000000,
        resolution: '720x480',
        uri: 'playlist_720.m3u8',
      });
      expect(playlist.variants?.[2]).toEqual({
        bandwidth: 2000000,
        resolution: '1280x720',
        uri: 'playlist_1080.m3u8',
      });
    });

    it('should sort variants from highest to lowest bandwidth', () => {
      const content = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=480x360
low.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
high.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=720x480
medium.m3u8
`;
      const playlist = parseM3U8(content);
      const sorted = sortVariantsByBandwidth(playlist.variants!);

      expect(sorted.map(variant => variant.uri)).toEqual(['high.m3u8', 'medium.m3u8', 'low.m3u8']);
    });

    it('should keep variant attributes when comments appear before the URI', () => {
      const content = `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720
# a comment
high.m3u8
`;
      const playlist = parseM3U8(content);

      expect(playlist.variants?.[0]).toEqual({
        bandwidth: 1000000,
        resolution: '1280x720',
        uri: 'high.m3u8',
      });
    });

    it('should flag separate audio renditions', () => {
      const content = `#EXTM3U
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="English",URI="audio.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO="audio"
video.m3u8
`;
      const playlist = parseM3U8(content);

      expect(playlist.separateAudioGroups).toEqual(['audio']);
      expect(playlist.variants?.[0]?.audioGroup).toBe('audio');
    });
  });

  describe('unsupported features', () => {
    it('should throw for unsupported encryption methods', () => {
      const content = `#EXTM3U
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key.bin"
#EXTINF:10,
segment.ts
#EXT-X-ENDLIST
`;

      expect(() => parseM3U8(content)).toThrow('Unsupported encryption method');
    });

    it('should throw for AES-128 keys without a URI', () => {
      const content = `#EXTM3U
#EXT-X-KEY:METHOD=AES-128
#EXTINF:10,
segment.ts
#EXT-X-ENDLIST
`;

      expect(() => parseM3U8(content)).toThrow('AES-128 key is missing the URI attribute');
    });

    it('should flag fragmented MP4 playlists', () => {
      const content = `#EXTM3U
#EXT-X-MAP:URI="init.mp4"
#EXTINF:10,
segment.m4s
#EXT-X-ENDLIST
`;
      const playlist = parseM3U8(content);

      expect(playlist.hasMap).toBe(true);
    });

    it('should flag byte-range playlists', () => {
      const content = `#EXTM3U
#EXTINF:10,
#EXT-X-BYTERANGE:1000@0
segment.ts
#EXT-X-ENDLIST
`;
      const playlist = parseM3U8(content);

      expect(playlist.hasByteRange).toBe(true);
    });

    it('should flag live playlists without an end list', () => {
      const content = `#EXTM3U
#EXTINF:10,
segment.ts
`;
      const playlist = parseM3U8(content);

      expect(playlist.hasEndList).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should throw error for invalid M3U8 header', () => {
      const invalidContent = 'INVALID_HEADER\n#EXTINF:10.0\nvideo.ts';

      expect(() => parseM3U8(invalidContent)).toThrow('Invalid M3U8 file: missing #EXTM3U header');
    });

    it('should handle empty segments gracefully', () => {
      const emptyContent = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-ENDLIST';
      const playlist = parseM3U8(emptyContent);

      expect(playlist.segments).toHaveLength(0);
      expect(playlist.targetDuration).toBe(10);
    });
  });
});
