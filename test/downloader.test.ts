import { describe, it, expect } from 'vitest';
import { resolveUrl, ivFromSequence } from '../src/downloader';

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

  describe('ivFromSequence', () => {
    it('should use an all-zero IV for sequence zero', () => {
      expect(Array.from(ivFromSequence(0))).toEqual(Array(16).fill(0));
    });

    it('should encode the sequence as a 128-bit big-endian value', () => {
      expect(Array.from(ivFromSequence(1))).toEqual([...Array(15).fill(0), 1]);
      expect(Array.from(ivFromSequence(0x0102))).toEqual([...Array(14).fill(0), 1, 2]);
    });

    it('should reject negative and unsafe sequence numbers', () => {
      expect(() => ivFromSequence(-1)).toThrow('Invalid media sequence number');
      expect(() => ivFromSequence(Number.MAX_SAFE_INTEGER + 1)).toThrow('Invalid media sequence number');
    });
  });
});
