import { assertValidHeaderValue, normalizeUserHeader } from './headers';
import {
  curlRejectionReason,
  isCurlNoopOption,
  parseCookieArgument,
} from './curl-args';

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
       meow-loader curl <curl-command> [options]

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

Curl mode:
  Paste a browser "Copy as cURL" command directly:
    meow-loader curl 'https://example.com/video.m3u8' -H 'Cookie: session=...'
  Supported: --url, -H/--header, -b/--cookie, -A/--user-agent, -e/--referer,
    -o/--output, -k/--insecure, -L, --compressed.
  Only GET requests are supported; other curl options are rejected.
  In curl mode -o sets the output file and -f means --fail; use --force to overwrite.

Examples:
  meow-loader https://example.com/video.m3u8
  meow-loader https://example.com/video.m3u8 output.mp4 0
  meow-loader https://example.com/video.m3u8 --header "Authorization: Bearer token"
  meow-loader https://example.com/video.m3u8 --header "Authorization: Bearer token" \\
    --header-origin https://cdn.example.com
  meow-loader curl 'https://example.com/video.m3u8' -b 'session=abc123'
  meow-loader https://example.com/video.m3u8 --resume /tmp/meow-abc123
  meow-loader https://example.com/video.m3u8 --dry-run`;

interface OptionValue {
  value: string | undefined;
  next: number;
}

/**
 * Match an option that takes a value, in all the spellings curl accepts:
 * "--header value", "--header=value", "-H value", and "-Hvalue".
 */
function takeValue(
  argv: string[],
  index: number,
  long: string,
  short?: string,
): OptionValue | undefined {
  const token = argv[index];
  if (token === undefined) {
    return undefined;
  }

  if (token === long || (short !== undefined && token === short)) {
    return { value: argv[index + 1], next: index + 1 };
  }

  if (token.startsWith(`${long}=`)) {
    return { value: token.slice(long.length + 1), next: index };
  }

  if (
    short !== undefined &&
    token.startsWith(short) &&
    token.length > short.length &&
    !token.startsWith('--')
  ) {
    return { value: token.slice(short.length), next: index };
  }

  return undefined;
}

function findHeaderKey(headers: Record<string, string>, name: string): string | undefined {
  return Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase());
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  assertValidHeaderValue(name, value);
  const existing = findHeaderKey(headers, name);
  if (existing !== undefined) {
    delete headers[existing];
  }
  headers[name] = value;
}

function appendHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = findHeaderKey(headers, name);
  if (existing === undefined) {
    headers[name] = value;
    return;
  }
  headers[existing] = `${headers[existing]}; ${value}`;
}

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

  // A pasted "Copy as cURL" command starts with the literal word "curl".
  const curl = argv[2] === 'curl';
  let curlUrl: string | undefined;
  let curlOutput: string | undefined;
  let sawCurlPositional = false;

  for (let i = curl ? 3 : 2; i < argv.length; i++) {
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

    if (!endOfOptions && (arg === '--force' || (!curl && arg === '-f'))) {
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

    if (!endOfOptions && curl) {
      if (isCurlNoopOption(arg)) {
        continue;
      }

      if (arg === '-k' || arg === '--insecure') {
        allowInsecure = true;
        continue;
      }

      const rejection = curlRejectionReason(arg);
      if (rejection) {
        throw new Error(`Unsupported curl option "${arg}": ${rejection}.`);
      }

      const urlOption = takeValue(argv, i, '--url');
      if (urlOption) {
        if (urlOption.value === undefined) {
          throw new Error('--url requires a URL');
        }
        if (curlUrl !== undefined) {
          throw new Error('Only one URL is supported; remove the extra --url');
        }
        curlUrl = urlOption.value;
        i = urlOption.next;
        continue;
      }

      const cookieOption = takeValue(argv, i, '--cookie', '-b');
      if (cookieOption) {
        if (cookieOption.value === undefined) {
          throw new Error('--cookie/-b requires a value');
        }
        i = cookieOption.next;
        appendHeader(headers, 'Cookie', parseCookieArgument(cookieOption.value));
        continue;
      }

      const userAgentOption = takeValue(argv, i, '--user-agent', '-A');
      if (userAgentOption) {
        if (userAgentOption.value === undefined) {
          throw new Error('--user-agent/-A requires a value');
        }
        i = userAgentOption.next;
        setHeader(headers, 'User-Agent', userAgentOption.value);
        continue;
      }

      const refererOption = takeValue(argv, i, '--referer', '-e');
      if (refererOption) {
        if (refererOption.value === undefined) {
          throw new Error('--referer/-e requires a value');
        }
        i = refererOption.next;
        setHeader(headers, 'Referer', refererOption.value);
        continue;
      }

      const outputOption = takeValue(argv, i, '--output', '-o');
      if (outputOption) {
        if (outputOption.value === undefined) {
          throw new Error('--output/-o requires a file path');
        }
        if (outputOption.value === '-') {
          throw new Error('Writing to stdout is not supported; use -o <file.mp4>');
        }
        i = outputOption.next;
        curlOutput = outputOption.value;
        continue;
      }
    }

    const headerOption = takeValue(argv, i, '--header', '-H');
    if (headerOption) {
      if (headerOption.value === undefined) {
        throw new Error('--header/-H requires an argument in "Key: Value" format');
      }
      i = headerOption.next;

      const parsed = normalizeUserHeader(headerOption.value);
      if (parsed) {
        headers[parsed.name] = parsed.value;
      }
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
      if (curl) {
        throw new Error(
          `Unsupported curl option "${arg}". meow-loader supports GET requests with headers; copy the playlist request from the browser Network tab.`,
        );
      }
      const hint = sawCurlPositional
        ? '\nThe "curl" command must be the first argument: npx meow-loader curl <url> ...'
        : '';
      throw new Error(`Unknown option: ${arg}${hint}`);
    }

    if (!curl && arg === 'curl' && positionals.length === 0) {
      sawCurlPositional = true;
    }
    positionals.push(arg);
  }

  return {
    headers,
    headerOrigins,
    positionals: curl ? resolveCurlPositionals(positionals, curlUrl, curlOutput) : positionals,
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

function resolveCurlPositionals(
  positionals: string[],
  curlUrl: string | undefined,
  curlOutput: string | undefined,
): string[] {
  let url: string | undefined;
  let rest: string[];

  if (curlUrl !== undefined) {
    url = curlUrl;
    rest = positionals;
    if (rest[0] !== undefined && /^https?:\/\//i.test(rest[0])) {
      throw new Error('Only one URL is supported; remove the extra URL or the --url option');
    }
  } else {
    url = positionals[0];
    rest = positionals.slice(1);
  }

  const limit = curlOutput !== undefined ? 1 : 2;
  if (rest.length > limit) {
    const unexpected = rest[limit]!.slice(0, 80);
    throw new Error(`Unexpected argument: ${unexpected}`);
  }

  const output = curlOutput ?? rest[0];
  const variant = curlOutput !== undefined ? rest[0] : rest[1];

  return [url, output, variant].filter((value): value is string => value !== undefined);
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
