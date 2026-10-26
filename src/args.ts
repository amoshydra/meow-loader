export const DEFAULT_MAX_DOWNLOAD = 50 * 1024 ** 3;
export const DEFAULT_MAX_SEGMENT_SIZE = 1024 ** 3;
export const DEFAULT_PLAYLIST_MAX_BYTES = 16 * 1024 ** 2;
export const DEFAULT_MAX_SEGMENTS = 100_000;

export interface ParsedArgs {
  headers: Record<string, string>;
  headerOrigins: string[];
  positionals: string[];
  resumeDir: string | undefined;
  force: boolean;
  cleanup: boolean;
  allowPrivateNetwork: boolean;
  allowInsecure: boolean;
  dryRun: boolean;
  maxDownload: number;
  maxSegmentSize: number;
  help: boolean;
  version: boolean;
}

export const USAGE = `Usage: meow-loader <m3u8-url> [output.mp4] [variant-index] [options]

Options:
  -H, --header <"Key: Value">    Add a custom HTTP header (repeatable)
  --header-origin <origin>        Send custom headers to this origin too (repeatable)
  --resume <dir>                  Resume a partial download from a saved working dir
  --cleanup                       Remove downloaded segments from the --resume dir after success
  --max-download <size>           Maximum total download, e.g. 50GB (0 = unlimited)
  --max-segment-size <size>       Maximum size of one segment, e.g. 1GB
  --allow-private-network         Allow loopback/private-network URLs in manifests
  --allow-insecure                Allow HTTPS playlists to reference HTTP resources
  --dry-run                       Show playlist information without downloading
  -f, --force                     Overwrite an existing output file
  -h, --help                      Show this help message
  -V, --version                   Show the version number

Examples:
  meow-loader https://example.com/video.m3u8
  meow-loader https://example.com/video.m3u8 output.mp4 0
  meow-loader https://example.com/video.m3u8 --header "Authorization: Bearer token"
  meow-loader https://example.com/video.m3u8 --header "Authorization: Bearer token" \\
    --header-origin https://cdn.example.com
  meow-loader https://example.com/video.m3u8 --resume /tmp/meow-abc123
  meow-loader https://example.com/video.m3u8 --dry-run`;

export function parseArgs(argv: string[]): ParsedArgs {
  const headers: Record<string, string> = {};
  const headerOrigins: string[] = [];
  const positionals: string[] = [];
  let resumeDir: string | undefined;
  let force = false;
  let cleanup = false;
  let allowPrivateNetwork = false;
  let allowInsecure = false;
  let dryRun = false;
  let maxDownload = DEFAULT_MAX_DOWNLOAD;
  let maxSegmentSize = DEFAULT_MAX_SEGMENT_SIZE;
  let help = false;
  let version = false;
  let endOfOptions = false;

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i]!;

    if (!endOfOptions && arg === '--') {
      endOfOptions = true;
      continue;
    }

    if (!endOfOptions && (arg === '--help' || arg === '-h')) {
      help = true;
      continue;
    }

    if (!endOfOptions && (arg === '--version' || arg === '-V')) {
      version = true;
      continue;
    }

    if (!endOfOptions && (arg === '--force' || arg === '-f')) {
      force = true;
      continue;
    }

    if (!endOfOptions && arg === '--cleanup') {
      cleanup = true;
      continue;
    }

    if (!endOfOptions && arg === '--allow-private-network') {
      allowPrivateNetwork = true;
      continue;
    }

    if (!endOfOptions && arg === '--allow-insecure') {
      allowInsecure = true;
      continue;
    }

    if (!endOfOptions && (arg === '--dry-run' || arg === '--info')) {
      dryRun = true;
      continue;
    }

    if (!endOfOptions && (arg === '--header' || arg === '-H')) {
      const header = argv[i + 1];
      if (header === undefined) {
        throw new Error('--header/-H requires an argument in "Key: Value" format');
      }
      i++;

      const colonIdx = header.indexOf(':');
      if (colonIdx === -1) {
        throw new Error(`Invalid header format "${header}". Use "Key: Value"`);
      }

      const key = header.slice(0, colonIdx).trim();
      const value = header.slice(colonIdx + 1).trim();
      if (!key) {
        throw new Error(`Header key cannot be empty in "${header}"`);
      }

      headers[key] = value;
      continue;
    }

    if (!endOfOptions && arg === '--header-origin') {
      const origin = argv[i + 1];
      if (origin === undefined) {
        throw new Error('--header-origin requires an origin, e.g. https://cdn.example.com');
      }
      i++;
      headerOrigins.push(origin);
      continue;
    }

    if (!endOfOptions && arg === '--resume') {
      const dir = argv[i + 1];
      if (dir === undefined) {
        throw new Error('--resume requires a directory path');
      }
      i++;
      resumeDir = dir;
      continue;
    }

    if (!endOfOptions && arg === '--max-download') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--max-download requires a size, e.g. 50GB');
      }
      i++;
      maxDownload = parseByteSize(value);
      continue;
    }

    if (!endOfOptions && arg === '--max-segment-size') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new Error('--max-segment-size requires a size, e.g. 1GB');
      }
      i++;
      maxSegmentSize = parseByteSize(value);
      continue;
    }

    if (!endOfOptions && arg.startsWith('-') && arg !== '-') {
      throw new Error(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  return {
    headers,
    headerOrigins,
    positionals,
    resumeDir,
    force,
    cleanup,
    allowPrivateNetwork,
    allowInsecure,
    dryRun,
    maxDownload,
    maxSegmentSize,
    help,
    version,
  };
}

export function parseByteSize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB|KIB|MIB|GIB|TIB)?$/i.exec(value.trim());
  if (!match) {
    throw new Error(`Invalid size "${value}". Use values like 500MB, 1GB, or 0.`);
  }

  const amount = Number(match[1]);
  const unit = (match[2] || 'B').toUpperCase();
  const multipliers: Record<string, number> = {
    B: 1,
    KB: 1000,
    MB: 1000 ** 2,
    GB: 1000 ** 3,
    TB: 1000 ** 4,
    KIB: 1024,
    MIB: 1024 ** 2,
    GIB: 1024 ** 3,
    TIB: 1024 ** 4,
  };

  const bytes = amount * multipliers[unit]!;
  if (!Number.isFinite(bytes) || bytes < 0 || !Number.isSafeInteger(Math.round(bytes))) {
    throw new Error(`Invalid size "${value}"`);
  }

  return Math.round(bytes);
}
