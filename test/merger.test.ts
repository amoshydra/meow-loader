import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { escapeConcatPath, mergeToMp4 } from '../src/merger';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
const fixtures = join(import.meta.dirname, 'fixtures', 'segments');

describe('escapeConcatPath', () => {
  it('escapes apostrophes using ffmpeg concat syntax', () => {
    expect(escapeConcatPath("/tmp/John's Videos/segment.ts")).toBe(
      "/tmp/John'\\''s Videos/segment.ts",
    );
  });

  it('leaves backslashes untouched inside single-quoted paths', () => {
    expect(escapeConcatPath('/tmp/back\\slash/segment.ts')).toBe('/tmp/back\\slash/segment.ts');
  });
});

describe.skipIf(!hasFfmpeg)('mergeToMp4 paths', () => {
  let tempRoot: string | undefined;

  afterEach(async () => {
    if (tempRoot) {
      await rm(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('merges from a directory containing an apostrophe', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'meow-loader-merge-'));
    const quotedDir = join(tempRoot, "quote's dir");
    await mkdir(quotedDir, { recursive: true });
    const first = join(quotedDir, 'one.ts');
    const second = join(quotedDir, 'two.ts');
    await copyFile(join(fixtures, 'segment_000_red.ts'), first);
    await copyFile(join(fixtures, 'segment_001_blue.ts'), second);

    const output = join(tempRoot, 'quoted.mp4');
    await mergeToMp4([first, second], output);

    expect((await stat(output)).size).toBeGreaterThan(0);
  });

  it.skipIf(process.platform === 'win32')('merges from a directory containing a backslash', async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'meow-loader-merge-'));
    const backslashDir = join(tempRoot, 'back\\slash dir');
    await mkdir(backslashDir, { recursive: true });
    const first = join(backslashDir, 'one.ts');
    const second = join(backslashDir, 'two.ts');
    await copyFile(join(fixtures, 'segment_000_red.ts'), first);
    await copyFile(join(fixtures, 'segment_001_blue.ts'), second);

    const output = join(tempRoot, 'backslash.mp4');
    await mergeToMp4([first, second], output);

    expect((await stat(output)).size).toBeGreaterThan(0);
  });
});
