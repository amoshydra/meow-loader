import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getUniqueFilePath } from '../src/output-path';

describe('getUniqueFilePath', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'meow-loader-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the original path when no file exists', () => {
    const path = join(tmpDir, 'output.mp4');
    expect(getUniqueFilePath(path)).toBe(path);
  });

  it('appends -1 when the original file exists', () => {
    const path = join(tmpDir, 'output.mp4');
    writeFileSync(path, '');
    expect(getUniqueFilePath(path)).toBe(join(tmpDir, 'output-1.mp4'));
  });

  it('appends -2 when output-1.mp4 also exists', () => {
    const path = join(tmpDir, 'output.mp4');
    writeFileSync(path, '');
    writeFileSync(join(tmpDir, 'output-1.mp4'), '');
    expect(getUniqueFilePath(path)).toBe(join(tmpDir, 'output-2.mp4'));
  });

  it('increments until it finds a free name', () => {
    const path = join(tmpDir, 'output.mp4');
    writeFileSync(join(tmpDir, 'output.mp4'), '');
    writeFileSync(join(tmpDir, 'output-1.mp4'), '');
    writeFileSync(join(tmpDir, 'output-2.mp4'), '');
    writeFileSync(join(tmpDir, 'output-3.mp4'), '');
    expect(getUniqueFilePath(path)).toBe(join(tmpDir, 'output-4.mp4'));
  });

  it('handles different file extensions', () => {
    const path = join(tmpDir, 'video.ts');
    writeFileSync(path, '');
    expect(getUniqueFilePath(path)).toBe(join(tmpDir, 'video-1.ts'));
  });

  it('handles files with dots in the name', () => {
    const path = join(tmpDir, 'my.video.final.mp4');
    writeFileSync(path, '');
    expect(getUniqueFilePath(path)).toBe(join(tmpDir, 'my.video.final-1.mp4'));
  });

  it('handles files without extension', () => {
    const path = join(tmpDir, 'output');
    writeFileSync(path, '');
    const result = getUniqueFilePath(path);
    expect(result).toBe(join(tmpDir, 'output-1'));
  });

  it('works with files in subdirectories', () => {
    const dir = join(tmpDir, 'sub', 'dir');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'output.mp4');
    writeFileSync(path, '');
    expect(getUniqueFilePath(path)).toBe(join(dir, 'output-1.mp4'));
  });
});
