import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { M3U8Segment } from './m3u8-parser';
import { scanMpegTsFile } from './segment-validation';
import { redactUrl } from './url';

export const RESUME_METADATA_FILENAME = 'meow-loader.resume.json';
const RESUME_VERSION = 2;

export interface ResumeSegment {
  fileName: string;
  size: number;
  sha256: string;
}

export interface ResumeMetadata {
  version: typeof RESUME_VERSION;
  sourceUrlHash: string;
  mediaPlaylistUrlHash: string;
  sourceDisplay: string;
  mediaPlaylistUrlDisplay: string;
  segmentCount: number;
  segmentFingerprint: string;
  segments: Record<string, ResumeSegment>;
}

export interface ResumeState {
  metadata: ResumeMetadata;
  completed: Set<number>;
  persist: boolean;
}

export async function initializeResumeState(options: {
  dir: string;
  sourceUrl: string;
  mediaPlaylistUrl: string;
  segments: M3U8Segment[];
  persist: boolean;
  tempDir?: string;
}): Promise<ResumeState> {
  const expected = createMetadata(options.sourceUrl, options.mediaPlaylistUrl, options.segments);

  if (!options.persist) {
    return { metadata: expected, completed: new Set(), persist: false };
  }

  const metadataPath = join(options.dir, RESUME_METADATA_FILENAME);
  if (existsSync(metadataPath)) {
    const existing = parseMetadata(await readFile(metadataPath, 'utf8'), metadataPath);
    assertSamePlaylist(existing, expected);
    expected.segments = existing.segments;
  }

  await saveResumeMetadata(options.dir, expected, options.tempDir);
  const completed = await validateCompletedSegments(options.dir, expected);
  await saveResumeMetadata(options.dir, expected, options.tempDir);

  return { metadata: expected, completed, persist: true };
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

export async function saveResumeMetadata(
  dir: string,
  metadata: ResumeMetadata,
  tempDir = dir,
): Promise<void> {
  const metadataPath = join(dir, RESUME_METADATA_FILENAME);
  const temporaryPath = join(tempDir, `${RESUME_METADATA_FILENAME}.${process.pid}.${randomUUID()}.tmp`);

  await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
  await rename(temporaryPath, metadataPath);
}

export async function cleanupResumeState(dir: string, metadata: ResumeMetadata): Promise<void> {
  for (const segment of Object.values(metadata.segments)) {
    await rm(join(dir, segment.fileName), { force: true });
    await rm(join(dir, `${segment.fileName}.part`), { force: true });
  }

  await rm(join(dir, RESUME_METADATA_FILENAME), { force: true });
}

function createMetadata(
  sourceUrl: string,
  mediaPlaylistUrl: string,
  segments: M3U8Segment[],
): ResumeMetadata {
  return {
    version: RESUME_VERSION,
    sourceUrlHash: hashUrlIdentity(sourceUrl),
    mediaPlaylistUrlHash: hashUrl(mediaPlaylistUrl),
    sourceDisplay: redactUrl(sourceUrl),
    mediaPlaylistUrlDisplay: redactUrl(mediaPlaylistUrl),
    segmentCount: segments.length,
    segmentFingerprint: fingerprintSegments(segments),
    segments: {},
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
  if (
    candidate.version !== RESUME_VERSION ||
    typeof candidate.sourceUrlHash !== 'string' ||
    typeof candidate.mediaPlaylistUrlHash !== 'string' ||
    typeof candidate.sourceDisplay !== 'string' ||
    typeof candidate.mediaPlaylistUrlDisplay !== 'string' ||
    !Number.isInteger(candidate.segmentCount) ||
    (candidate.segmentCount ?? -1) < 0 ||
    typeof candidate.segmentFingerprint !== 'string' ||
    !candidate.segments ||
    typeof candidate.segments !== 'object' ||
    Array.isArray(candidate.segments)
  ) {
    throw invalidMetadataError(path);
  }

  for (const [key, value] of Object.entries(candidate.segments)) {
    if (
      !/^\d+$/.test(key) ||
      !value ||
      typeof value !== 'object' ||
      typeof value.fileName !== 'string' ||
      !/^segment_\d+\.ts$/.test(value.fileName) ||
      !Number.isInteger(value.size) ||
      value.size < 0 ||
      typeof value.sha256 !== 'string' ||
      !/^[0-9a-f]{64}$/.test(value.sha256)
    ) {
      throw invalidMetadataError(path);
    }
  }

  return candidate as ResumeMetadata;
}

function invalidMetadataError(path: string): Error {
  return new Error(
    `Invalid or outdated resume metadata: ${path}. Delete it or use a new resume directory.`,
  );
}

function assertSamePlaylist(actual: ResumeMetadata, expected: ResumeMetadata): void {
  if (actual.sourceUrlHash !== expected.sourceUrlHash) {
    throw new Error(
      `Resume directory belongs to a different playlist: expected ${actual.sourceDisplay}, received ${expected.sourceDisplay}`,
    );
  }

  if (actual.mediaPlaylistUrlHash !== expected.mediaPlaylistUrlHash) {
    throw new Error(
      `Resume directory belongs to a different media playlist or variant: expected ${actual.mediaPlaylistUrlDisplay}, received ${expected.mediaPlaylistUrlDisplay}`,
    );
  }

  if (actual.segmentCount !== expected.segmentCount) {
    throw new Error(
      `Resume directory has ${actual.segmentCount} segments, but this playlist has ${expected.segmentCount}`,
    );
  }

  if (actual.segmentFingerprint !== expected.segmentFingerprint) {
    throw new Error('Resume directory belongs to a different version of this playlist');
  }
}

async function validateCompletedSegments(dir: string, metadata: ResumeMetadata): Promise<Set<number>> {
  const completed = new Set<number>();

  for (const [key, segment] of Object.entries(metadata.segments)) {
    const index = Number(key);
    const path = join(dir, segment.fileName);

    if (!Number.isInteger(index) || index < 0 || index >= metadata.segmentCount) {
      delete metadata.segments[key];
      continue;
    }

    const info = await lstat(path).catch(() => undefined);
    if (!info?.isFile() || info.isSymbolicLink() || info.size !== segment.size) {
      await rm(path, { force: true });
      delete metadata.segments[key];
      continue;
    }

    const scan = await scanMpegTsFile(path).catch(() => undefined);
    if (!scan || !scan.valid || scan.size !== segment.size || scan.sha256 !== segment.sha256) {
      await rm(path, { force: true });
      delete metadata.segments[key];
      continue;
    }

    completed.add(index);
  }

  return completed;
}

function fingerprintSegments(segments: M3U8Segment[]): string {
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
  }));

  return hashString(JSON.stringify(payload));
}

function hashUrl(url: string): string {
  return hashString(url);
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
