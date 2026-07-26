#!/usr/bin/env node
import { parseM3U8 } from './src/m3u8-parser';
import { downloadSegment } from './src/downloader';
import { mergeToMp4 } from './src/merger';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { getUniqueFilePath } from './src/output-path';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';

const execAsync = promisify(exec);

const DEFAULT_HEADERS: Record<string, string> = {
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

function showHelp() {
  console.log(`Usage: meow-loader <m3u8-url> [output.mp4] [variant-index] [options]

Options:
  -H, --header <"Key: Value">    Add a custom HTTP header (repeatable)
  --resume <dir>                  Resume a partial download from a saved working dir
  -h, --help                      Show this help message

Examples:
  meow-loader https://example.com/video.m3u8
  meow-loader https://example.com/video.m3u8 output.mp4 0
  meow-loader https://example.com/video.m3u8 --header "Authorization: Bearer token"
  meow-loader https://example.com/video.m3u8 -H "Referer: https://example.com"
  meow-loader https://example.com/video.m3u8 --resume /tmp/meow-abc123`);
}

function parseArgs(argv: string[]): {
  headers: Record<string, string>;
  positionals: string[];
  resumeDir: string | undefined;
} {
  const headers: Record<string, string> = {};
  const positionals: string[] = [];
  let resumeDir: string | undefined;
  let i = 2;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (arg === '--header' || arg === '-H') {
      i++;
      const header = argv[i];
      if (!header) {
        console.error('Error: --header/-H requires an argument in "Key: Value" format');
        process.exit(1);
      }
      const colonIdx = header.indexOf(':');
      if (colonIdx === -1) {
        console.error(`Error: Invalid header format "${header}". Use "Key: Value"`);
        process.exit(1);
      }
      const key = header.slice(0, colonIdx).trim();
      const value = header.slice(colonIdx + 1).trim();
      if (!key) {
        console.error(`Error: Header key cannot be empty in "${header}"`);
        process.exit(1);
      }
      headers[key] = value;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--resume') {
      i++;
      const dir = argv[i];
      if (!dir) {
        console.error('Error: --resume requires a directory path');
        process.exit(1);
      }
      resumeDir = dir;
      i++;
    } else {
      positionals.push(arg);
      i++;
    }
  }
  return { headers, positionals, resumeDir };
}

async function promptRetry(attempts: number): Promise<'retry' | 'save'> {
  const maxAttempts = 3;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const remaining = maxAttempts - attempts;
    const hint = remaining > 0 ? ` (${remaining} attempt${remaining > 1 ? 's' : ''} left)` : '';
    const input = await rl.question(`\n[R]etry${hint}, [S]ave & exit: `);
    const trimmed = input.trim().toLowerCase();
    if (trimmed === 'r' || trimmed === 'retry') return 'retry';
    return 'save';
  } finally {
    rl.close();
  }
}

async function checkFfmpeg() {
  try {
    await execAsync('ffmpeg -version');
  } catch {
    console.error('Error: ffmpeg is required but not found. Please install ffmpeg and ensure it is in your PATH.');
    process.exit(1);
  }
}

function padIndex(i: number, total: number): string {
  return String(i).padStart(String(total).length, '0');
}

const { headers, positionals, resumeDir } = parseArgs(process.argv);

const cleanedHeaders = { ...headers };
if (!headers['User-Agent']) {
  cleanedHeaders['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
}
for (const [k, v] of Object.entries(DEFAULT_HEADERS)) {
  if (!(k in cleanedHeaders)) {
    cleanedHeaders[k] = v;
  }
}
const hasHeaders = Object.keys(cleanedHeaders).length > 0;

const url = positionals[0];

if (!url) {
  console.error('Usage: meow-loader <m3u8-url> [output.mp4] [variant-index] [--header/-H "Key: Value" ...] [--resume <dir>]');
  process.exit(1);
}

await checkFfmpeg();

const output = positionals[1] ? resolve(positionals[1]) : getUniqueFilePath(resolve('output.mp4'));

console.log(`Fetching playlist: ${url}`);
const response = await fetch(url, hasHeaders ? { headers: cleanedHeaders } : undefined);

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
  const variantArg = positionals[2];
  if (variantArg) {
    choice = parseInt(variantArg);
    if (isNaN(choice) || choice < 0 || choice >= playlist.variants.length) {
      console.error(`Invalid variant index. Choose 0-${playlist.variants.length - 1}`);
      process.exit(1);
    }
  } else {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    const input = await rl.question(`Select variant (0-${playlist.variants.length - 1}, default: 0 highest): `);
    rl.close();
    const trimmed = input.trim();
    choice = trimmed ? parseInt(trimmed) : 0;
    if (isNaN(choice) || choice < 0 || choice >= playlist.variants.length) {
      console.error(`Invalid choice. Defaulting to highest bandwidth.`);
      choice = 0;
    }
  }

  const selected = playlist.variants[choice]!;
  console.log(`Selected variant [${choice}]: ${selected.resolution || 'unknown'} @ ${selected.bandwidth / 1000} kbps`);
  playlistUrl = new URL(selected.uri, url).href;

  console.log(`Fetching variant playlist: ${playlistUrl}`);
  const variantResponse = await fetch(playlistUrl, hasHeaders ? { headers: cleanedHeaders } : undefined);

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

let tmpDir: string;
let completedIndices = new Set<number>();

if (resumeDir) {
  tmpDir = resolve(process.cwd(), resumeDir);
  try {
    const files = await readdir(tmpDir);
    for (const f of files) {
      if (f.startsWith('segment_') && f.endsWith('.ts')) {
        const idx = parseInt(f.slice(8, -3), 10);
        if (!isNaN(idx)) {
          completedIndices.add(idx);
        }
      }
    }
  } catch {
    console.error(`Error: resume directory does not exist: ${tmpDir}`);
    process.exit(1);
  }
  console.log(`Working dir: ${tmpDir} (resumed, ${completedIndices.size} segments already downloaded)`);
} else {
  tmpDir = await mkdtemp(join(tmpdir(), 'meow-'));
  console.log(`Working dir: ${tmpDir}`);
}

let interrupted = false;
process.on('SIGINT', () => {
  if (!interrupted) {
    interrupted = true;
    console.log(`\nInterrupted. Resume later with: --resume ${tmpDir}`);
    process.exit(0);
  }
});

console.log(`Downloading ${playlist.segments.length} segments...`);

const segmentPaths: string[] = [];

for (let i = 0; i < playlist.segments.length; i++) {
  const segment = playlist.segments[i]!;
  const segmentPath = join(tmpDir, `segment_${padIndex(i, playlist.segments.length)}.ts`);

  if (completedIndices.has(i)) {
    segmentPaths.push(segmentPath);
    continue;
  }

  process.stdout.write(`\rSegment ${i + 1}/${playlist.segments.length}`);

  let attempts = 0;
  const maxAttempts = 3;
  let success = false;

  while (!success) {
    try {
      const data = await downloadSegment(
        segment.uri,
        playlistUrl,
        playlist.encryption,
        hasHeaders ? cleanedHeaders : undefined,
      );
      await writeFile(segmentPath, data);
      segmentPaths.push(segmentPath);
      success = true;
    } catch (error) {
      console.error(`\nFailed to download segment ${i + 1}: ${segment.uri}`);
      console.error(error);
      attempts++;

      const action = await promptRetry(attempts);
      if (action === 'save') {
        console.log(`Resume later with: --resume ${tmpDir}`);
        process.exit(0);
      }

      if (attempts >= maxAttempts) {
        console.error(`Max retries reached for segment ${i + 1}.`);
        console.log(`Resume later with: --resume ${tmpDir}`);
        process.exit(1);
      }
    }
  }
}

console.log('\nMerging segments into MP4...');
try {
  await mergeToMp4(segmentPaths, output);
} catch (error) {
  console.error(`\nFailed to merge segments: ${error instanceof Error ? error.message : error}`);
  console.log(`Segments preserved at: ${tmpDir}`);
  process.exit(1);
}

await rm(tmpDir, { recursive: true });
console.log(`Done! Saved to: ${output}`);
