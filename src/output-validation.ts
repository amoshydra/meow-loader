import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

interface FfprobeOutput {
  format?: {
    duration?: string;
  };
  streams?: unknown[];
}

/**
 * Verify the merged file has at least one stream and a duration close to the
 * sum of the playlist segment durations. This catches ffmpeg exiting 0 after
 * silently dropping a corrupt segment.
 */
export async function validateMp4Output(outputPath: string, expectedDuration: number): Promise<void> {
  if (!Number.isFinite(expectedDuration) || expectedDuration < 0) {
    throw new Error(`Invalid expected duration: ${expectedDuration}`);
  }

  let stdout: string;

  try {
    ({ stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-show_entries',
        'stream=index',
        '-of',
        'json',
        outputPath,
      ],
      { maxBuffer: 1024 * 1024, timeout: 5 * 60_000 },
    ));
  } catch (error) {
    throw new Error(`ffprobe failed to inspect the merged output: ${errorMessage(error)}`);
  }

  let info: FfprobeOutput;
  try {
    info = JSON.parse(stdout) as FfprobeOutput;
  } catch {
    throw new Error('ffprobe returned invalid JSON for the merged output');
  }

  if (!info.streams || info.streams.length === 0) {
    throw new Error('Merged output contains no audio or video streams');
  }

  const actualDuration = Number(info.format?.duration);
  if (!Number.isFinite(actualDuration) || actualDuration <= 0) {
    throw new Error('Merged output has no readable duration');
  }

  const tolerance = Math.max(2, expectedDuration * 0.02);
  if (Math.abs(actualDuration - expectedDuration) > tolerance) {
    throw new Error(
      `Merged output duration ${actualDuration.toFixed(2)}s does not match playlist duration ${expectedDuration.toFixed(2)}s`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
