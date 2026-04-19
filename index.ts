import { parseM3U8 } from './src/m3u8-parser';
import { downloadSegment } from './src/downloader';
import { mergeToMp4 } from './src/merger';

const url = Bun.argv[2];

if (!url) {
  console.error('Usage: bun run index.ts <m3u8-url> [output.mp4]');
  process.exit(1);
}

const output = Bun.argv[3] || 'output.mp4';

console.log(`Fetching playlist: ${url}`);
const response = await fetch(url);

if (!response.ok) {
  console.error(`Failed to fetch playlist: ${response.status}`);
  process.exit(1);
}

const content = await response.text();
const playlist = parseM3U8(content);

let playlistUrl = url;

if (playlist.isMaster && playlist.variants) {
  console.log('Master playlist detected. Available variants:');
  playlist.variants.forEach((v, i) => {
    const res = v.resolution ? ` (${v.resolution})` : '';
    console.log(`  [${i}] ${v.bandwidth / 1000} kbps${res}`);
  });

  let choice: number;
  if (Bun.argv[4]) {
    choice = parseInt(Bun.argv[4]);
    if (isNaN(choice) || choice < 0 || choice >= playlist.variants.length) {
      console.error(`Invalid variant index. Choose 0-${playlist.variants.length - 1}`);
      process.exit(1);
    }
  } else {
    const readline = Bun.stdin.stream().getReader();
    const decoder = new TextDecoder();
    process.stdout.write(`Select variant (0-${playlist.variants.length - 1}, default: ${playlist.variants.length - 1} highest): `);
    const { value } = await readline.read();
    const input = decoder.decode(value).trim();
    choice = input ? parseInt(input) : playlist.variants.length - 1;
    if (isNaN(choice) || choice < 0 || choice >= playlist.variants.length) {
      console.error(`Invalid choice. Defaulting to highest bandwidth.`);
      choice = playlist.variants.length - 1;
    }
  }

  const selected = playlist.variants[choice]!;
  console.log(`Selected variant [${choice}]: ${selected.resolution || 'unknown'} @ ${selected.bandwidth / 1000} kbps`);
  playlistUrl = new URL(selected.uri, url).href;

  console.log(`Fetching variant playlist: ${playlistUrl}`);
  const variantResponse = await fetch(playlistUrl);

  if (!variantResponse.ok) {
    console.error(`Failed to fetch variant playlist: ${variantResponse.status}`);
    process.exit(1);
  }

  const variantContent = await variantResponse.text();
  Object.assign(playlist, parseM3U8(variantContent));
}

if (!playlist.segments || playlist.segments.length === 0) {
  console.error('No segments found in playlist');
  process.exit(1);
}

console.log(`Downloading ${playlist.segments.length} segments...`);

const segments: Uint8Array[] = [];

for (let i = 0; i < playlist.segments.length; i++) {
  const segment = playlist.segments[i]!;
  process.stdout.write(`\rSegment ${i + 1}/${playlist.segments.length}`);

  try {
    const data = await downloadSegment(segment.uri, playlistUrl, playlist.encryption);
    segments.push(data);
  } catch (error) {
    console.error(`\nFailed to download segment ${i + 1}: ${segment.uri}`);
    console.error(error);
    process.exit(1);
  }
}

console.log('\nMerging segments into MP4...');
await mergeToMp4(segments, output);

console.log(`Done! Saved to: ${output}`);
