import { writeFile, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';

export async function mergeToMp4(segments: Uint8Array[], outputPath: string): Promise<void> {
  const tempDir = process.env.TMPDIR || '/tmp';
  const inputTs = `${tempDir}/input_${Date.now()}.ts`;

  const combined = new Uint8Array(segments.reduce((acc, s) => acc + s.length, 0));
  let offset = 0;
  for (const segment of segments) {
    combined.set(segment, offset);
    offset += segment.length;
  }

  await writeFile(inputTs, combined);

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
    await runFfmpeg(['-y', '-i', inputTs, '-c', 'copy', '-bsf:a', 'aac_adtstoasc', outputPath]);
  } catch {
    await runFfmpeg(['-y', '-i', inputTs, '-c', 'copy', outputPath]);
  } finally {
    try {
      await unlink(inputTs);
    } catch {}
  }
}
