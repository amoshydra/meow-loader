import { describe, it, expect } from 'vitest';
import { resolveUrl } from '../src/downloader';

describe('downloader', () => {
  describe('resolveUrl', () => {
    it('should resolve relative URLs against base URL', () => {
      const result = resolveUrl('segments/segment.ts', 'https://example.com/video/playlist.m3u8');

      expect(result).toBe('https://example.com/video/segments/segment.ts');
    });

    it('should resolve parent directory relative URLs', () => {
      const result = resolveUrl('../segments/segment.ts', 'https://example.com/video/subdir/playlist.m3u8');

      expect(result).toBe('https://example.com/video/segments/segment.ts');
    });

    it('should keep absolute http URLs unchanged', () => {
      const result = resolveUrl('http://cdn.example.com/segment.ts', 'https://example.com/video/playlist.m3u8');

      expect(result).toBe('http://cdn.example.com/segment.ts');
    });

    it('should keep absolute https URLs unchanged', () => {
      const result = resolveUrl('https://cdn.example.com/segment.ts', 'https://example.com/video/playlist.m3u8');

      expect(result).toBe('https://cdn.example.com/segment.ts');
    });

    it('should handle protocol-relative URLs', () => {
      const result = resolveUrl('//cdn.example.com/segment.ts', 'https://example.com/video/playlist.m3u8');

      expect(result).toBe('https://cdn.example.com/segment.ts');
    });

    it('should resolve simple filename against base URL', () => {
      const result = resolveUrl('key.key', 'https://example.com/video/playlist.m3u8');

      expect(result).toBe('https://example.com/video/key.key');
    });
  });
});
