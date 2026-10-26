import { copyFile, link, mkdir, writeFile, unlink, rm, mkdtemp } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';

let activeFfmpeg: ChildProcess | undefined;
let activeMergeTempDir: string | undefined;

export function abortActiveMerge(): void {
  activeFfmpeg?.kill('SIGTERM');
  activeFfmpeg = undefined;

  if (activeMergeTempDir) {
    rmSync(activeMergeTempDir, { recursive: true, force: true });
    activeMergeTempDir = undefined;
  }
}

export async function mergeToMp4(segmentPaths: string[], outputPath: string): Promise<void> {
  if (segmentPaths.length === 0) {
    throw new Error('No segments to merge');
  }

  const inputRoot = dirname(segmentPaths[0]!);
  const tmpDir = await mkdtemp(join(inputRoot, '.meow-merge-'));
  activeMergeTempDir = tmpDir;

  const inputDir = join(tmpDir, 'input');
  const concatList = join(inputDir, 'concat.txt');

  try {
    await mkdir(inputDir, { recursive: true });
    // Use generated names and relative paths so no user/manifest-controlled
    // path ever reaches the ffmpeg concat list.
    const lines: string[] = [];
    for (let index = 0; index < segmentPaths.length; index++) {
      const target = join(inputDir, `${index}.ts`);
      try {
        await link(segmentPaths[index]!, target);
      } catch {
        await copyFile(segmentPaths[index]!, target);
      }
      lines.push(`file '${escapeConcatPath(`${index}.ts`)}'`);
    }

    await writeFile(concatList, lines.join('\n') + '\n');

    try {
      await runFfmpeg(['-i', concatList, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', outputPath]);
    } catch (firstError) {
      try {
        await runFfmpeg(['-i', concatList, '-c', 'copy', outputPath]);
      } catch (secondError) {
        throw new Error(
          `ffmpeg failed.\nFirst attempt: ${errorMessage(firstError)}\nSecond attempt: ${errorMessage(secondError)}`,
        );
      }
    }
  } finally {
    try {
      await unlink(concatList);
    } catch {}
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {}
    if (activeMergeTempDir === tmpDir) {
      activeMergeTempDir = undefined;
    }
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const proc = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-nostdin',
        '-y',
        '-f',
        'concat',
        '-safe',
        '1',
        '-protocol_whitelist',
        'file,pipe',
        ...args,
      ],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );

    activeFfmpeg = proc;

    proc.stderr?.setEncoding('utf8');
    proc.stderr?.on('data', (chunk: string) => {
      // Consume stderr so ffmpeg cannot block on a full pipe. Keep only the
      // tail for the error message.
      stderr = (stderr + chunk).slice(-16_000);
    });

    proc.on('close', (code) => {
      if (activeFfmpeg === proc) {
        activeFfmpeg = undefined;
      }
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}${stderr.trim() ? `\n${stderr.trim()}` : ''}`));
      }
    });

    proc.on('error', (err: NodeJS.ErrnoException) => {
      if (activeFfmpeg === proc) {
        activeFfmpeg = undefined;
      }
      if (err.code === 'ENOENT') {
        reject(new Error('ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.'));
      } else {
        reject(err);
      }
    });
  });
}

export function escapeConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
