import { writeFile, unlink, rm, mkdtemp } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function mergeToMp4(segmentPaths: string[], outputPath: string): Promise<void> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'meow-merge-'));
  const concatList = join(tmpDir, 'concat.txt');

  const lines = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`);
  await writeFile(concatList, lines.join('\n') + '\n');

  const runFfmpeg = (args: string[]): Promise<void> =>
    new Promise((resolve, reject) => {
      const proc = spawn('ffmpeg', args, { stdio: 'pipe' });
      proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
      proc.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ENOENT') {
          reject(new Error('ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.'));
        } else {
          reject(err);
        }
      });
    });

  try {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', outputPath]);
  } catch {
    await runFfmpeg(['-y', '-f', 'concat', '-safe', '0', '-i', concatList, '-c', 'copy', outputPath]);
  } finally {
    try {
      await unlink(concatList);
    } catch {}
    try {
      await rm(tmpDir, { recursive: true });
    } catch {}
  }
}
