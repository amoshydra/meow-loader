import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseM3U8 } from '../src/m3u8-parser';

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
    });

    it('should parse segments correctly', () => {
      const content = readFileSync(join(fixturesDir, 'playlist.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      expect(playlist.segments?.[0]).toEqual({
        uri: 'segments/segment_000_red.ts',
        duration: 10,
        title: '',
      });
      expect(playlist.segments?.[1]).toEqual({
        uri: 'segments/segment_001_blue.ts',
        duration: 10,
        title: '',
      });
      expect(playlist.segments?.[2]).toEqual({
        uri: 'segments/segment_002_green.ts',
        duration: 10,
        title: '',
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

    it('should have sorted variants by bandwidth', () => {
      const content = readFileSync(join(fixturesDir, 'master.m3u8'), 'utf-8');
      const playlist = parseM3U8(content);

      const bandwidths = playlist.variants?.map((v) => v.bandwidth);
      expect(bandwidths).toEqual([500000, 1000000, 2000000]);
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
