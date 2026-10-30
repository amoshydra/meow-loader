#!/usr/bin/env node
import { parseM3U8, sortVariantsByBandwidth } from './src/m3u8-parser';
import type { M3U8Playlist, M3U8Segment, M3U8Variant } from './src/m3u8-parser';
import { downloadSegmentToFile } from './src/downloader';
import { abortActiveMerge, mergeToMp4 } from './src/merger';
import {
  DEFAULT_MAX_SEGMENTS,
  DEFAULT_PLAYLIST_MAX_BYTES,
  parseArgs,
  USAGE,
} from './src/args';
import { formatBytes, formatDuration, sanitizeForDisplay, sanitizeMultiline } from './src/display';
import { DiskSpaceError, DownloadLimitError, SegmentLimitError } from './src/errors';
import { NetworkClient, readResponseText, UrlPolicyError } from './src/network';
import { getUniqueFilePath, pickAvailableOutputPath } from './src/output-path';
import { DownloadProgress } from './src/progress';
import { validateMp4Output } from './src/output-validation';
import {
  cleanupResumeState,
  initializeResumeState,
  recordSegment,
  saveResumeMetadata,
} from './src/resume';
import type { ResumeState } from './src/resume';
import { redactUrl } from './src/url';
import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, lstat, realpath, rename, rm, stat, statfs, access } from 'node:fs/promises';
import { constants, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const execFileAsync = promisify(execFile);
const MAX_ATTEMPTS = 3;
const MAX_VARIANTS = 1_000;
const MAX_EXPECTED_DURATION = 366 * 24 * 60 * 60;
const FREE_SPACE_MARGIN = 512 * 1024 ** 2;

function showHelp() {
  console.log(USAGE);
}

function getVersion(): string {
  try {
    const require = createRequire(import.meta.url);
    return (require('../package.json') as { version: string }).version;
  } catch {
    return process.env.npm_package_version ?? '0.0.0-dev';
  }
}

async function checkFfmpeg() {
  try {
    await execFileAsync('ffmpeg', ['-version']);
    await execFileAsync('ffprobe', ['-version']);
  } catch {
    throw new Error(
      'ffmpeg and ffprobe are required but not found. Please install ffmpeg and ensure both are in your PATH.',
    );
  }
}

function parseVariantIndex(value: string, count: number): number {
  if (!/^\d+$/.test(value)) {
    throw new Error(`Invalid variant index "${sanitizeForDisplay(value, 40)}". Choose 0-${count - 1}`);
  }

  const index = Number(value);
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    throw new Error(`Invalid variant index. Choose 0-${count - 1}`);
  }

  return index;
}

async function selectVariant(variants: M3U8Variant[], variantArg: string | undefined): Promise<M3U8Variant> {
  const sorted = sortVariantsByBandwidth(variants);

  console.log('Master playlist detected. Available variants (highest first):');
  sorted.forEach((variant, index) => {
    const resolution = variant.resolution
      ? ` (${sanitizeForDisplay(variant.resolution, 80)})`
      : '';
    const audio = variant.audioGroup
      ? ` [audio: ${sanitizeForDisplay(variant.audioGroup, 80)}]`
      : '';
    console.log(`  [${index}] ${variant.bandwidth / 1000} kbps${resolution}${audio}`);
  });

  if (variantArg !== undefined) {
    return sorted[parseVariantIndex(variantArg, sorted.length)]!;
  }

  if (!stdin.isTTY) {
    console.log('No TTY detected; selecting the highest quality variant.');
    return sorted[0]!;
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const input = await rl.question(`Select variant (0-${sorted.length - 1}, default: 0 highest): `);
    const trimmed = input.trim();
    return trimmed ? sorted[parseVariantIndex(trimmed, sorted.length)]! : sorted[0]!;
  } finally {
    rl.close();
  }
}

function validateMediaPlaylist(playlist: M3U8Playlist): number {
  if (playlist.isMaster) {
    throw new Error('Expected a media playlist but received another master playlist');
  }
  if (!playlist.hasEndList) {
    throw new Error('Live or incomplete playlists are not supported (missing #EXT-X-ENDLIST)');
  }
  if (playlist.hasMap) {
    throw new Error('Fragmented MP4 playlists (#EXT-X-MAP) are not supported');
  }
  if (playlist.hasByteRange) {
    throw new Error('Byte-range playlists (#EXT-X-BYTERANGE) are not supported');
  }
  if (!playlist.segments || playlist.segments.length === 0) {
    throw new Error('No segments found in playlist');
  }
  if (playlist.segments.length > DEFAULT_MAX_SEGMENTS) {
    throw new Error(
      `Playlist has ${playlist.segments.length} segments, above the ${DEFAULT_MAX_SEGMENTS} limit`,
    );
  }

  const expectedDuration = playlist.segments.reduce((sum, segment) => sum + segment.duration, 0);
  if (!Number.isFinite(expectedDuration) || expectedDuration < 0) {
    throw new Error('Playlist duration is invalid or too large');
  }
  if (expectedDuration > MAX_EXPECTED_DURATION) {
    throw new Error(`Playlist duration ${formatDuration(expectedDuration)} is unreasonably large`);
  }

  return expectedDuration;
}

async function resolveOutputPath(requested: string | undefined, force: boolean): Promise<string> {
  const output = requested
    ? resolve(requested)
    : force
      ? resolve('output.mp4')
      : getUniqueFilePath(resolve('output.mp4'));

  if (!/\.mp4$/i.test(output)) {
    throw new Error('Output filename must end with .mp4');
  }

  const existing = await stat(output).catch(() => undefined);
  if (existing?.isDirectory()) {
    throw new Error(`Output path is a directory: ${output}`);
  }
  if (existing && !force) {
    throw new Error(`Output file already exists: ${output}\nUse --force to overwrite it.`);
  }

  const parent = await stat(dirname(output)).catch(() => undefined);
  if (!parent?.isDirectory()) {
    throw new Error(`Output directory does not exist: ${dirname(output)}`);
  }

  return output;
}

async function assertOutputAvailable(output: string, force: boolean): Promise<void> {
  if (force) return;
  const existing = await stat(output).catch(() => undefined);
  if (existing) {
    throw new Error(`Output file already exists: ${output}`);
  }
}

async function prepareWorkingDirectory(
  resumeDir: string | undefined,
): Promise<{ tmpDir: string; ownsTempDir: boolean; workDir: string }> {
  if (!resumeDir) {
    const tmpDir = await mkdtemp(join(tmpdir(), 'meow-'));
    const workDir = await mkdtemp(join(tmpDir, '.meow-loader-'));
    registerWorkDirCleanup(workDir);
    return { tmpDir, ownsTempDir: true, workDir };
  }

  const tmpDir = await realpath(resolve(resumeDir)).catch(() => undefined);
  if (!tmpDir) {
    throw new Error(`Resume directory does not exist: ${resumeDir}`);
  }

  const info = await lstat(tmpDir).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`Resume path is not a directory: ${tmpDir}`);
  }

  await access(tmpDir, constants.W_OK).catch(() => {
    throw new Error(`Resume directory is not writable: ${tmpDir}`);
  });

  if ((info.mode & 0o002) !== 0) {
    console.warn(`Warning: resume directory is world-writable: ${tmpDir}`);
  }

  const workDir = await mkdtemp(join(tmpDir, '.meow-loader-'));
  registerWorkDirCleanup(workDir);
  return { tmpDir, ownsTempDir: false, workDir };
}

function registerWorkDirCleanup(workDir: string): void {
  process.once('exit', () => {
    rmSync(workDir, { recursive: true, force: true });
  });
}

async function getFreeBytes(dir: string): Promise<number | undefined> {
  try {
    const info = await statfs(dir);
    return Number(info.bavail) * Number(info.bsize);
  } catch {
    return undefined;
  }
}

async function ensureFreeSpace(dir: string, requiredBytes: number, label: string): Promise<void> {
  if (!Number.isFinite(requiredBytes) || requiredBytes <= 0) return;
  const free = await getFreeBytes(dir);
  if (free === undefined) return;
  if (free < requiredBytes) {
    throw new DiskSpaceError(
      `Not enough free space for ${label}: need about ${formatBytes(requiredBytes)}, ${formatBytes(free)} available in ${dir}. Free space or use --resume on another disk.`,
    );
  }
}

async function promptRetry(attempts: number): Promise<'retry' | 'save'> {
  const remaining = Math.max(0, MAX_ATTEMPTS - attempts);
  if (remaining === 0) {
    return 'save';
  }

  const hint = ` (${remaining} attempt${remaining > 1 ? 's' : ''} left)`;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const input = await rl.question(`\n[R]etry${hint}, [S]ave & exit: `);
    const trimmed = input.trim().toLowerCase();
    return trimmed === 'r' || trimmed === 'retry' ? 'retry' : 'save';
  } finally {
    rl.close();
  }
}

async function promptLargeDownload(estimatedBytes: number, limitBytes: number): Promise<boolean> {
  if (!stdin.isTTY) return false;

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const input = await rl.question(
      `Estimated download is ${formatBytes(estimatedBytes)}, above the ${formatBytes(limitBytes)} limit. Continue? [y/N] `,
    );
    return /^y(es)?$/i.test(input.trim());
  } finally {
    rl.close();
  }
}

async function replaceSegmentFile(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
  } catch (error) {
    if (!isReplaceError(error)) throw error;
    await rm(target, { force: true });
    await rename(source, target);
  }
}

async function downloadSegments(
  segments: M3U8Segment[],
  playlistUrl: string,
  tmpDir: string,
  workDir: string,
  resume: ResumeState,
  network: NetworkClient,
  keyCache: Map<string, Buffer>,
  maxDownload: number,
  maxSegmentSize: number,
): Promise<{ segmentPaths: string[]; totalBytes: number } | null> {
  const segmentPaths: string[] = [];
  const initialBytes = Object.values(resume.metadata.segments).reduce((sum, segment) => sum + segment.size, 0);
  let totalBytes = initialBytes;

  if (maxDownload > 0 && initialBytes > maxDownload) {
    throw new DownloadLimitError(
      `Existing segments total ${formatBytes(initialBytes)}, above the ${formatBytes(maxDownload)} limit. Raise it with --max-download.`,
    );
  }
  const progress = new DownloadProgress(
    segments.length,
    initialBytes,
    resume.completed.size,
    Boolean(stdin.isTTY),
  );

  try {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      const fileName = `segment_${String(i).padStart(String(segments.length).length, '0')}.ts`;
      const segmentPath = join(tmpDir, fileName);

      if (resume.completed.has(i)) {
        segmentPaths.push(segmentPath);
        continue;
      }

      if (maxDownload > 0 && totalBytes >= maxDownload) {
        throw new DownloadLimitError(
          `Download limit reached (${formatBytes(maxDownload)}). Resume later with: --resume ${tmpDir} --max-download ${formatBytes(maxDownload * 2)}`,
        );
      }

      const remainingLimit = maxDownload > 0 ? maxDownload - totalBytes : Infinity;
      const maxBytes = Math.min(maxSegmentSize, remainingLimit);

      try {
        if (i === 0 || i % 10 === 0) {
          await ensureFreeSpace(
            tmpDir,
            Math.min(maxSegmentSize, Number.isFinite(maxBytes) ? maxBytes : maxSegmentSize) + FREE_SPACE_MARGIN,
            'download',
          );
        }
      } catch (error) {
        console.error(`\n${errorMessage(error)}`);
        console.log(`Resume later with: --resume ${tmpDir}`);
        process.exitCode = 1;
        return null;
      }

      progress.startSegment(i);
      let attempts = 0;
      let downloaded = false;

      while (!downloaded) {
        try {
          const partialPath = join(workDir, `${fileName}.part`);
          const result = await downloadSegmentToFile(segment, playlistUrl, partialPath, {
            network,
            keyCache,
            maxBytes,
            onProgress: bytes => progress.addBytes(bytes),
          });

          await replaceSegmentFile(partialPath, segmentPath);

          if (resume.persist) {
            recordSegment(resume.metadata, i, fileName, result.size, result.sha256);
            await saveResumeMetadata(tmpDir, resume.metadata, workDir);
          }

          segmentPaths.push(segmentPath);
          totalBytes += result.size;
          progress.completeSegment(result.size);
          downloaded = true;
        } catch (error) {
          if (
            error instanceof SegmentLimitError ||
            error instanceof DownloadLimitError ||
            error instanceof DiskSpaceError ||
            error instanceof UrlPolicyError
          ) {
            console.error(`\n${errorMessage(error)}`);
            console.log(`Resume later with: --resume ${tmpDir}`);
            process.exitCode = 1;
            return null;
          }

          attempts++;
          console.error(`\nFailed to download segment ${i + 1}`);
          console.error(errorMessage(error));

          if (attempts >= MAX_ATTEMPTS) {
            console.error(`Max retries reached for segment ${i + 1}.`);
            console.log(`Resume later with: --resume ${tmpDir}`);
            process.exitCode = 1;
            return null;
          }

          if (stdin.isTTY) {
            const action = await promptRetry(attempts);
            if (action === 'save') {
              console.log(`Partial download saved. Resume later with: --resume ${tmpDir}`);
              process.exitCode = 1;
              return null;
            }
          } else {
            const wait = 500 * 2 ** (attempts - 1);
            console.error(`Retrying in ${wait}ms...`);
            await delay(wait);
          }
        }
      }
    }

    return { segmentPaths, totalBytes };
  } finally {
    progress.finish();
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function replaceFile(source: string, target: string): Promise<void> {
  try {
    await rename(source, target);
    return;
  } catch (error) {
    if (!isReplaceError(error)) {
      throw error;
    }
  }

  const backup = `${target}.meow-loader-backup-${process.pid}-${Date.now()}`;
  await rename(target, backup);

  try {
    await rename(source, target);
  } catch (error) {
    await rename(backup, target).catch(() => {});
    throw error;
  }

  await rm(backup, { force: true }).catch(() => {});
}

function isReplaceError(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException).code;
  return code === 'EEXIST' || code === 'EPERM' || code === 'ENOTEMPTY';
}

async function cleanupWorkingDirectory(
  tmpDir: string,
  ownsTempDir: boolean,
  cleanupResumeDir: boolean,
  resume: ResumeState,
): Promise<void> {
  if (ownsTempDir) {
    await rm(tmpDir, { recursive: true, force: true });
    return;
  }

  if (cleanupResumeDir) {
    await cleanupResumeState(tmpDir, resume.metadata);
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function resolveManifestUrl(uri: string, baseUrl: string): string {
  try {
    return new URL(uri, baseUrl).href;
  } catch {
    throw new Error('Invalid playlist URL in manifest');
  }
}

function assertPlaylistBody(text: string): void {
  const head = text.replace(/^\uFEFF/, '').trimStart();
  if (!head.startsWith('<')) {
    return;
  }
  throw new Error(
    'The URL returned an HTML page instead of an M3U8 playlist. In the browser Network tab, copy the .m3u8 (or media) request instead of the page URL.',
  );
}

function estimateBytes(bandwidth: number, duration: number): number | undefined {
  if (!Number.isFinite(bandwidth) || bandwidth <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return undefined;
  }
  const estimate = (bandwidth / 8) * duration;
  return Number.isFinite(estimate) ? estimate : undefined;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    return;
  }
  if (args.version) {
    console.log(getVersion());
    return;
  }
  if (args.cleanup && !args.resumeDir) {
    throw new Error('--cleanup requires --resume');
  }
  if (args.maxSegmentSize <= 0) {
    throw new Error('--max-segment-size must be greater than 0');
  }

  const [url, outputArg, variantArg, ...extra] = args.positionals;
  if (!url) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  if (extra.length > 0) {
    throw new Error(`Unexpected argument: ${sanitizeForDisplay(extra[0]!, 80)}`);
  }

  const network = new NetworkClient({
    playlistUrl: url,
    userHeaders: args.headers,
    headerOrigins: args.headerOrigins,
    allowPrivateNetwork: args.allowPrivateNetwork,
    allowInsecure: args.allowInsecure,
  });

  console.log(`Fetching playlist: ${redactUrl(url)}`);
  const response = await network.fetch(url, {}, { attempts: 3, label: 'playlist' });
  if (!response.ok) {
    throw new Error(`Failed to fetch playlist: ${response.status}`);
  }

  const masterUrl = response.url || url;
  const playlistBody = await readResponseText(response, DEFAULT_PLAYLIST_MAX_BYTES);
  assertPlaylistBody(playlistBody);
  let playlist = parseM3U8(playlistBody);
  let playlistUrl = masterUrl;
  let selectedVariant: M3U8Variant | undefined;

  if (playlist.isMaster) {
    if (!playlist.variants || playlist.variants.length === 0) {
      throw new Error('Master playlist contains no variants');
    }
    if (playlist.variants.length > MAX_VARIANTS) {
      throw new Error(`Master playlist has too many variants (${playlist.variants.length})`);
    }

    const masterPlaylist = playlist;
    selectedVariant = await selectVariant(masterPlaylist.variants!, variantArg);

    if (
      selectedVariant.audioGroup &&
      masterPlaylist.separateAudioGroups.includes(selectedVariant.audioGroup)
    ) {
      throw new Error(
        `The selected variant uses a separate audio rendition (${sanitizeForDisplay(selectedVariant.audioGroup, 80)}), which is not supported`,
      );
    }

    playlistUrl = resolveManifestUrl(selectedVariant.uri, masterUrl);

    console.log(
      `Selected variant: ${sanitizeForDisplay(selectedVariant.resolution || 'unknown', 80)} @ ${selectedVariant.bandwidth / 1000} kbps`,
    );
    console.log(`Fetching variant playlist: ${redactUrl(playlistUrl)}`);

    const variantResponse = await network.fetch(playlistUrl, {}, { attempts: 3, label: 'variant playlist' });
    if (!variantResponse.ok) {
      throw new Error(`Failed to fetch variant playlist: ${variantResponse.status}`);
    }

    playlistUrl = variantResponse.url || playlistUrl;
    const variantBody = await readResponseText(variantResponse, DEFAULT_PLAYLIST_MAX_BYTES);
    assertPlaylistBody(variantBody);
    playlist = parseM3U8(variantBody);
  } else if (variantArg !== undefined) {
    throw new Error('variant-index can only be used with a master playlist');
  }

  const expectedDuration = validateMediaPlaylist(playlist);
  const segments = playlist.segments!;
  const estimatedBytes = selectedVariant
    ? estimateBytes(selectedVariant.bandwidth, expectedDuration)
    : undefined;

  if (args.dryRun) {
    console.log(`Segments: ${segments.length}`);
    console.log(`Duration: ${formatDuration(expectedDuration)}`);
    if (estimatedBytes !== undefined) {
      console.log(`Estimated size: ~${formatBytes(estimatedBytes)} (bandwidth-based)`);
    }
    if (args.maxDownload > 0) {
      console.log(`Download limit: ${formatBytes(args.maxDownload)}`);
    }
    const free = await getFreeBytes(process.cwd());
    if (free !== undefined) {
      console.log(`Free space: ${formatBytes(free)}`);
    }
    return;
  }

  await checkFfmpeg();
  const output = await resolveOutputPath(outputArg, args.force);

  let maxDownload = args.maxDownload;
  if (estimatedBytes !== undefined && maxDownload > 0 && estimatedBytes > maxDownload) {
    if (await promptLargeDownload(estimatedBytes, maxDownload)) {
      maxDownload = Math.ceil(estimatedBytes * 1.25);
      console.log(`Continuing with a limit of ${formatBytes(maxDownload)} for this run.`);
    } else {
      throw new DownloadLimitError(
        `Estimated download is ${formatBytes(estimatedBytes)}, above the ${formatBytes(maxDownload)} limit. Use --max-download to raise it.`,
      );
    }
  }

  const { tmpDir, ownsTempDir, workDir } = await prepareWorkingDirectory(args.resumeDir);

  if (estimatedBytes !== undefined) {
    await ensureFreeSpace(tmpDir, estimatedBytes + FREE_SPACE_MARGIN, 'download');
  }

  const resume = await initializeResumeState({
    dir: tmpDir,
    sourceUrl: url,
    mediaPlaylistUrl: playlistUrl,
    segments,
    persist: true,
    tempDir: workDir,
  });

  console.log(`Working dir: ${tmpDir}`);
  if (resume.completed.size > 0) {
    console.log(`Resuming with ${resume.completed.size}/${segments.length} segments already downloaded`);
  }
  console.log(`Downloading ${segments.length} segments...`);

  let outputTempDir: string | undefined;

  process.once('SIGINT', () => {
    abortActiveMerge();
    rmSync(workDir, { recursive: true, force: true });
    if (outputTempDir) {
      rmSync(outputTempDir, { recursive: true, force: true });
    }
    console.error(`\nInterrupted. Resume later with: --resume ${tmpDir}`);
    process.exit(130);
  });

  const result = await downloadSegments(
    segments,
    playlistUrl,
    tmpDir,
    workDir,
    resume,
    network,
    new Map(),
    maxDownload,
    args.maxSegmentSize,
  );
  if (!result) {
    return;
  }

  const finalOutput = pickAvailableOutputPath(output, args.force);
  if (finalOutput.renamed) {
    console.log(`Output appeared during the download; saving to: ${finalOutput.path}`);
  }

  await assertOutputAvailable(finalOutput.path, args.force);
  await ensureFreeSpace(
    dirname(finalOutput.path),
    result.totalBytes + Math.max(FREE_SPACE_MARGIN, result.totalBytes * 0.05),
    'merge',
  );

  outputTempDir = await mkdtemp(join(dirname(finalOutput.path), '.meow-loader-'));
  const partialOutput = join(outputTempDir, basename(finalOutput.path));

  console.log(`\nMerging ${formatBytes(result.totalBytes)} into MP4...`);
  try {
    await mergeToMp4(result.segmentPaths, partialOutput);
    console.log('Verifying output...');
    await validateMp4Output(partialOutput, expectedDuration);
    await assertOutputAvailable(finalOutput.path, args.force);
    await replaceFile(partialOutput, finalOutput.path);
  } catch (error) {
    throw new Error(
      `Failed to finalize output: ${errorMessage(error)}\nSegments preserved at: ${tmpDir}\nResume later with: --resume ${tmpDir}`,
    );
  } finally {
    await rm(outputTempDir, { recursive: true, force: true }).catch(() => {});
    outputTempDir = undefined;
  }

  try {
    await cleanupWorkingDirectory(tmpDir, ownsTempDir, args.cleanup, resume);
  } catch (error) {
    console.warn(`Warning: failed to clean up ${tmpDir}: ${errorMessage(error)}`);
  }

  console.log(`Done! Saved to: ${finalOutput.path}`);
  if (!ownsTempDir && !args.cleanup) {
    console.log(`Segments kept at: ${tmpDir}`);
  }
}

function errorMessage(error: unknown): string {
  return sanitizeMultiline(error instanceof Error ? error.message : String(error));
}

main().catch((error) => {
  console.error(errorMessage(error));
  process.exitCode = 1;
});
