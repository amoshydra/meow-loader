import { createHash, randomUUID } from 'node:crypto';
import type { Stats } from 'node:fs';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { M3U8Map, M3U8Segment } from './m3u8-parser';
import { scanSegmentFile } from './segment-validation';
import type { HlsContainer } from './segment-validation';
import { redactUrl } from './url';

export const RESUME_METADATA_FILENAME = 'meow-loader.resume.json';
const RESUME_VERSION = 2;
const MAX_RESUME_SEGMENTS = 100_000;
const MAX_RESUME_METADATA_BYTES = 64 * 1024 * 1024;

export interface ResumeSegment {
  fileName: string;
  size: number;
  sha256: string;
}

export interface ResumeInitSegment {
  fileName: string;
  size: number;
  sha256: string;
}

export interface ResumeTrack {
  mediaPlaylistUrlHash: string;
  mediaPlaylistUrlDisplay: string;
  segmentCount: number;
  segmentFingerprint: string;
  segments: Record<string, ResumeSegment>;
  container?: HlsContainer;
  initSegment?: ResumeInitSegment;
  durationSeconds?: number;
}

export interface ResumeMetadata extends ResumeTrack {
  version: typeof RESUME_VERSION;
  sourceUrlHash: string;
  sourceDisplay: string;
  /** Present when the stream uses a separate audio rendition. */
  audio?: ResumeTrack;
}

export interface ResumeTrackState {
  completed: Set<number>;
  initValid: boolean;
}

export interface ResumeState extends ResumeTrackState {
  metadata: ResumeMetadata;
  audio?: ResumeTrackState;
  persist: boolean;
}

export interface ResumeTrackInput {
  mediaPlaylistUrl: string;
  segments: M3U8Segment[];
  container: HlsContainer;
  map?: M3U8Map;
}

export interface ResumeValidationState {
  checkedFiles: number;
  totalFiles: number;
  checkedBytes: number;
  totalBytes: number;
}

export type ResumeValidationCallback = (state: ResumeValidationState) => void;

export async function initializeResumeState(options: {
  dir: string;
  sourceUrl: string;
  persist: boolean;
  tempDir?: string;
  video: ResumeTrackInput;
  audio?: ResumeTrackInput;
  onValidate?: ResumeValidationCallback;
}): Promise<ResumeState> {
  const expected: ResumeMetadata = {
    version: RESUME_VERSION,
    sourceUrlHash: hashUrlIdentity(options.sourceUrl),
    sourceDisplay: redactUrl(options.sourceUrl),
    ...createTrack(options.video),
  };
  const expectedAudio = options.audio ? createTrack(options.audio) : undefined;

  if (!options.persist) {
    return {
      metadata: expected,
      completed: new Set(),
      initValid: false,
      ...(expectedAudio ? { audio: { completed: new Set(), initValid: false } } : {}),
      persist: false,
    };
  }

  if (expectedAudio) {
    expected.audio = expectedAudio;
  }

  const metadataPath = join(options.dir, RESUME_METADATA_FILENAME);
  const metadataInfo = await lstat(metadataPath).catch(() => undefined);
  if (metadataInfo) {
    const existing = parseMetadata(await readMetadataFile(metadataPath, metadataInfo), metadataPath);

    if (existing.sourceUrlHash !== expected.sourceUrlHash && !matchesRefreshedPathToken(
      existing.sourceUrlHash, existing.sourceDisplay, options.sourceUrl, hashUrlIdentity,
    )) {
      throw new Error(
        `Resume directory belongs to a different playlist: expected ${existing.sourceDisplay}, received ${expected.sourceDisplay}`,
      );
    }

    assertSameTrack(existing, expected, 'video', options.video.mediaPlaylistUrl);
    expected.segments = existing.segments;
    expected.initSegment = existing.initSegment;

    if (expectedAudio) {
      if (existing.audio) {
        assertSameTrack(existing.audio, expectedAudio, 'audio', options.audio!.mediaPlaylistUrl);
        expectedAudio.segments = existing.audio.segments;
        expectedAudio.initSegment = existing.audio.initSegment;
      }
      expected.audio = expectedAudio;
    } else if (existing.audio) {
      throw new Error(
        'Resume directory contains a separate audio track, but this playlist does not',
      );
    }
  }

  await saveResumeMetadata(options.dir, expected, options.tempDir);
  const onFile = createValidationReporter(
    expected.audio ? [expected, expected.audio] : [expected],
    options.onValidate,
  );
  const video = await validateTrack(options.dir, expected, onFile);
  const audio = expected.audio
    ? await validateTrack(options.dir, expected.audio, onFile)
    : undefined;
  await saveResumeMetadata(options.dir, expected, options.tempDir);

  return {
    metadata: expected,
    completed: video.completed,
    initValid: video.initValid,
    ...(audio ? { audio } : {}),
    persist: true,
  };
}

export interface LoadedResumeState extends ResumeTrackState {
  metadata: ResumeMetadata;
  audio?: ResumeTrackState;
}

/**
 * Load and validate a resume directory without a playlist. Used by
 * --merge-only when the original endpoint is no longer available.
 */
export async function loadResumeState(
  dir: string,
  onValidate?: ResumeValidationCallback,
): Promise<LoadedResumeState> {
  const metadataPath = join(dir, RESUME_METADATA_FILENAME);
  const metadataInfo = await lstat(metadataPath).catch(() => undefined);
  if (!metadataInfo) {
    throw new Error(
      `No ${RESUME_METADATA_FILENAME} found in ${dir}. Use --resume <dir> with the original playlist instead.`,
    );
  }
  const raw = await readMetadataFile(metadataPath, metadataInfo);

  const metadata = parseMetadata(raw, metadataPath);
  const onFile = createValidationReporter(
    metadata.audio ? [metadata, metadata.audio] : [metadata],
    onValidate,
  );
  const video = await validateTrack(dir, metadata, onFile);
  const audio = metadata.audio ? await validateTrack(dir, metadata.audio, onFile) : undefined;

  return {
    metadata,
    completed: video.completed,
    initValid: video.initValid,
    ...(audio ? { audio } : {}),
  };
}

export function recordSegment(
  metadata: ResumeMetadata,
  index: number,
  fileName: string,
  size: number,
  sha256: string,
): void {
  metadata.segments[String(index)] = { fileName, size, sha256 };
}

export function recordInitSegment(
  metadata: ResumeMetadata,
  fileName: string,
  size: number,
  sha256: string,
): void {
  metadata.initSegment = { fileName, size, sha256 };
}

export function recordAudioSegment(
  metadata: ResumeMetadata,
  index: number,
  fileName: string,
  size: number,
  sha256: string,
): void {
  if (!metadata.audio) {
    throw new Error('Resume metadata has no audio track');
  }
  metadata.audio.segments[String(index)] = { fileName, size, sha256 };
}

export function recordAudioInitSegment(
  metadata: ResumeMetadata,
  fileName: string,
  size: number,
  sha256: string,
): void {
  if (!metadata.audio) {
    throw new Error('Resume metadata has no audio track');
  }
  metadata.audio.initSegment = { fileName, size, sha256 };
}

export async function saveResumeMetadata(
  dir: string,
  metadata: ResumeMetadata,
  tempDir = dir,
): Promise<void> {
  const metadataPath = join(dir, RESUME_METADATA_FILENAME);
  const temporaryPath = join(tempDir, `${RESUME_METADATA_FILENAME}.${process.pid}.${randomUUID()}.tmp`);

  await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, {
    mode: 0o600,
    flag: 'wx',
  });
  await rename(temporaryPath, metadataPath);
}

export async function cleanupResumeState(dir: string, metadata: ResumeMetadata): Promise<void> {
  await cleanupTrack(dir, metadata);
  if (metadata.audio) {
    await cleanupTrack(dir, metadata.audio);
  }

  await rm(join(dir, RESUME_METADATA_FILENAME), { force: true });
}

async function cleanupTrack(dir: string, track: ResumeTrack): Promise<void> {
  for (const segment of Object.values(track.segments)) {
    await rm(join(dir, segment.fileName), { force: true });
    await rm(join(dir, `${segment.fileName}.part`), { force: true });
  }

  if (track.initSegment) {
    await rm(join(dir, track.initSegment.fileName), { force: true });
    await rm(join(dir, `${track.initSegment.fileName}.part`), { force: true });
  }
}

function createTrack(input: ResumeTrackInput): ResumeTrack {
  return {
    mediaPlaylistUrlHash: hashUrl(input.mediaPlaylistUrl),
    mediaPlaylistUrlDisplay: redactUrl(input.mediaPlaylistUrl),
    segmentCount: input.segments.length,
    segmentFingerprint: fingerprintSegments(input.segments, input.map),
    segments: {},
    container: input.container,
    durationSeconds: input.segments.reduce((sum, segment) => sum + segment.duration, 0),
  };
}

function parseMetadata(raw: string, path: string): ResumeMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    throw invalidMetadataError(path);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw invalidMetadataError(path);
  }

  const candidate = parsed as Partial<ResumeMetadata>;
  const audio = candidate.audio;
  if (
    candidate.version !== RESUME_VERSION ||
    typeof candidate.sourceUrlHash !== 'string' ||
    typeof candidate.sourceDisplay !== 'string' ||
    !isTrack(candidate, '')
  ) {
    throw invalidMetadataError(path);
  }

  if (audio !== undefined && !isTrack(audio, 'audio_')) {
    throw invalidMetadataError(path);
  }

  return candidate as ResumeMetadata;
}

function isTrack(value: unknown, prefix: '' | 'audio_'): value is ResumeTrack {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const track = value as Partial<ResumeTrack>;
  if (
    typeof track.mediaPlaylistUrlHash !== 'string' ||
    typeof track.mediaPlaylistUrlDisplay !== 'string' ||
    !Number.isInteger(track.segmentCount) ||
    (track.segmentCount ?? -1) < 0 ||
    (track.segmentCount ?? -1) > MAX_RESUME_SEGMENTS ||
    typeof track.segmentFingerprint !== 'string' ||
    !track.segments ||
    typeof track.segments !== 'object' ||
    Array.isArray(track.segments)
  ) {
    return false;
  }

  if (
    track.container !== undefined &&
    track.container !== 'mpegts' &&
    track.container !== 'fmp4'
  ) {
    return false;
  }

  if (
    track.durationSeconds !== undefined &&
    (typeof track.durationSeconds !== 'number' ||
      !Number.isFinite(track.durationSeconds) ||
      track.durationSeconds < 0)
  ) {
    return false;
  }

  if (track.initSegment !== undefined && !isInitSegment(track.initSegment, prefix)) {
    return false;
  }

  const segmentPattern =
    prefix === 'audio_' ? /^audio_segment_\d+\.(?:ts|m4s)$/ : /^segment_\d+\.(?:ts|m4s)$/;
  for (const [key, segment] of Object.entries(track.segments)) {
    if (
      !/^\d+$/.test(key) ||
      String(Number(key)) !== key ||
      !segment ||
      typeof segment !== 'object' ||
      typeof segment.fileName !== 'string' ||
      !segmentPattern.test(segment.fileName) ||
      !Number.isInteger(segment.size) ||
      segment.size < 0 ||
      typeof segment.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(segment.sha256)
    ) {
      return false;
    }
  }

  return true;
}

function isInitSegment(value: unknown, prefix: '' | 'audio_'): value is ResumeInitSegment {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const init = value as Partial<ResumeInitSegment>;
  const pattern = prefix === 'audio_' ? /^audio_init\.(?:mp4|m4s)$/ : /^init\.(?:mp4|m4s)$/;

  return (
    typeof init.fileName === 'string' &&
    pattern.test(init.fileName) &&
    Number.isInteger(init.size) &&
    (init.size ?? -1) >= 0 &&
    typeof init.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(init.sha256)
  );
}

async function readMetadataFile(path: string, info: Stats): Promise<string> {
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Resume metadata must be a regular file: ${path}`);
  }
  if (info.size > MAX_RESUME_METADATA_BYTES) {
    throw new Error(
      `Resume metadata is ${info.size} bytes, above the ${MAX_RESUME_METADATA_BYTES} limit: ${path}`,
    );
  }
  return readFile(path, 'utf8');
}

function invalidMetadataError(path: string): Error {
  return new Error(
    `Invalid or outdated resume metadata: ${path}. Delete it or use a new resume directory.`,
  );
}

function assertSameTrack(
  actual: ResumeTrack,
  expected: ResumeTrack,
  kind: 'video' | 'audio',
  mediaPlaylistUrl: string,
): void {
  const playlistLabel = kind === 'audio' ? 'audio playlist' : 'media playlist';

  if (actual.mediaPlaylistUrlHash !== expected.mediaPlaylistUrlHash && !matchesRefreshedPathToken(
    actual.mediaPlaylistUrlHash, actual.mediaPlaylistUrlDisplay, mediaPlaylistUrl, hashUrl,
  )) {
    throw new Error(
      `Resume directory belongs to a different ${playlistLabel} or variant: expected ${actual.mediaPlaylistUrlDisplay}, received ${expected.mediaPlaylistUrlDisplay}`,
    );
  }

  if (actual.segmentCount !== expected.segmentCount) {
    throw new Error(
      kind === 'audio'
        ? `Resume directory audio playlist has ${actual.segmentCount} segments, but this playlist has ${expected.segmentCount}`
        : `Resume directory has ${actual.segmentCount} segments, but this playlist has ${expected.segmentCount}`,
    );
  }

  if (actual.segmentFingerprint !== expected.segmentFingerprint) {
    throw new Error(
      kind === 'audio'
        ? 'Resume directory belongs to a different version of this audio playlist'
        : 'Resume directory belongs to a different version of this playlist',
    );
  }

  if (actual.container && expected.container && actual.container !== expected.container) {
    throw new Error(
      `Resume directory holds ${actual.container} ${kind === 'audio' ? 'audio ' : ''}segments, but this playlist is ${expected.container}`,
    );
  }
}

function trackTotals(track: ResumeTrack): { files: number; bytes: number } {
  let files = track.initSegment ? 1 : 0;
  let bytes = track.initSegment?.size ?? 0;

  for (const segment of Object.values(track.segments)) {
    files++;
    bytes += segment.size;
  }

  return { files, bytes };
}

function createValidationReporter(
  tracks: ResumeTrack[],
  onValidate?: ResumeValidationCallback,
): (size: number) => void {
  let totalFiles = 0;
  let totalBytes = 0;
  for (const track of tracks) {
    const totals = trackTotals(track);
    totalFiles += totals.files;
    totalBytes += totals.bytes;
  }

  let checkedFiles = 0;
  let checkedBytes = 0;

  return (size: number) => {
    checkedFiles++;
    checkedBytes += size;
    onValidate?.({ checkedFiles, totalFiles, checkedBytes, totalBytes });
  };
}

async function validateTrack(
  dir: string,
  track: ResumeTrack,
  onFile?: (size: number) => void,
): Promise<ResumeTrackState> {
  const completed = new Set<number>();
  const container = track.container ?? 'mpegts';

  let initValid = false;
  const init = track.initSegment;
  if (init) {
    onFile?.(init.size);
    const initPath = join(dir, init.fileName);
    const info = await lstat(initPath).catch(() => undefined);

    if (!info?.isFile() || info.isSymbolicLink() || info.size !== init.size) {
      await rm(initPath, { force: true });
      delete track.initSegment;
    } else {
      const scan = await scanSegmentFile(initPath, container, { requireFtyp: true }).catch(
        () => undefined,
      );
      if (!scan || !scan.valid || scan.size !== init.size || scan.sha256 !== init.sha256) {
        await rm(initPath, { force: true });
        delete track.initSegment;
      } else {
        initValid = true;
      }
    }
  }

  for (const [key, segment] of Object.entries(track.segments)) {
    onFile?.(segment.size);
    const index = Number(key);
    const path = join(dir, segment.fileName);

    if (!Number.isInteger(index) || index < 0 || index >= track.segmentCount) {
      delete track.segments[key];
      continue;
    }

    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile() || info.isSymbolicLink() || info.size !== segment.size) {
      await rm(path, { force: true });
      delete track.segments[key];
      continue;
    }

    const scan = await scanSegmentFile(path, container).catch(() => undefined);
    if (!scan || !scan.valid || scan.size !== segment.size || scan.sha256 !== segment.sha256) {
      await rm(path, { force: true });
      delete track.segments[key];
      continue;
    }

    completed.add(index);
  }

  return { completed, initValid };
}

function fingerprintSegments(segments: M3U8Segment[], map: M3U8Map | undefined): string {
  const payload = segments.map(segment => ({
    duration: segment.duration,
    sequence: segment.sequence,
    uri: stripQuery(segment.uri),
    encryption: segment.encryption
      ? {
          uri: stripQuery(segment.encryption.uri),
          iv: segment.encryption.iv ?? null,
        }
      : null,
    ...(segment.byterange ? { byterange: segment.byterange } : {}),
  }));

  // Keep the fingerprint of MPEG-TS playlists byte-identical to earlier
  // versions so existing resume directories remain usable.
  const serialized = JSON.stringify(payload);
  if (!map) {
    return hashString(serialized);
  }

  const mapIdentity = {
    uri: stripQuery(map.uri),
    byterange: map.byterange ?? null,
    encryption: map.encryption
      ? {
          uri: stripQuery(map.encryption.uri),
          iv: map.encryption.iv ?? null,
        }
      : null,
  };

  return hashString(`${serialized}\n${JSON.stringify(mapIdentity)}`);
}

function hashUrl(url: string): string {
  return hashString(url);
}

/** Match refreshed CloudFront path tokens without weakening query/variant identity. */
function matchesRefreshedPathToken(
  savedHash: string,
  savedDisplay: string,
  currentUrl: string,
  hash: (url: string) => string,
): boolean {
  try {
    const saved = new URL(savedDisplay);
    const current = new URL(currentUrl);
    if (saved.origin !== current.origin || !current.hostname.endsWith('.cloudfront.net')) {
      return false;
    }
    const savedParts = saved.pathname.split('/');
    const currentParts = current.pathname.split('/');
    if (!isPathToken(savedParts[1]) || !isPathToken(currentParts[1])) {
      return false;
    }
    currentParts[1] = savedParts[1]!;
    current.pathname = currentParts.join('/');
    // Reconstruct the old URL and compare its original hash. This also supports
    // existing metadata, whose display URL omits the query string.
    return hash(current.href) === savedHash;
  } catch {
    return false;
  }
}

function isPathToken(value: string | undefined): boolean {
  if (!value || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
    return false;
  }
  try {
    const parts = value.split('.');
    const header = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8'));
    const payload = JSON.parse(Buffer.from(parts[2]!, 'base64url').toString('utf8'));
    return header?.typ === 'JWT' && header.alg === 'HS256' &&
      typeof payload?.exp === 'number' && Array.isArray(payload.paths);
  } catch {
    return false;
  }
}

function hashUrlIdentity(url: string): string {
  try {
    const parsed = new URL(url);
    return hashString(`${parsed.origin}${parsed.pathname}`);
  } catch {
    return hashString(url);
  }
}

function hashString(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function stripQuery(value: string): string {
  const index = value.search(/[?#]/);
  return index === -1 ? value : value.slice(0, index);
}
