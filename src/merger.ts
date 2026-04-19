import { $ } from 'bun';

export async function mergeToMp4(segments: Uint8Array[], outputPath: string): Promise<void> {
  const tempDir = process.env.TMPDIR || '/tmp';
  const inputTs = `${tempDir}/input_${Date.now()}.ts`;

  const combined = new Uint8Array(segments.reduce((acc, s) => acc + s.length, 0));
  let offset = 0;
  for (const segment of segments) {
    combined.set(segment, offset);
    offset += segment.length;
  }

  await Bun.write(inputTs, combined);

  try {
    await $`ffmpeg -y -i ${inputTs} -c copy -bsf:a aac_adtstoasc ${outputPath}`.quiet();
  } catch {
    await $`ffmpeg -y -i ${inputTs} -c copy ${outputPath}`.quiet();
  } finally {
    try {
      await Bun.$`rm -f ${inputTs}`.quiet();
    } catch {}
  }
}
