const DEFAULT_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const MAX_HEADER_NAME_LENGTH = 60;

// Hop-by-hop headers are connection-specific and are dropped instead of being
// forwarded. Browsers include "Connection: keep-alive" in copied cURL commands.
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

// Headers that would change the meaning of every request meow-loader makes.
const REJECTED_HEADERS = new Map<string, string>([
  ['host', 'The "Host" header is not supported.'],
  ['content-length', 'The "Content-Length" header is not supported.'],
  [
    'range',
    'The "Range" header is not supported: it would be sent with every segment request and truncate the download.',
  ],
]);

export function buildBaseHeaders(): Headers {
  const headers = new Headers(DEFAULT_HEADERS);
  if (!headers.has('user-agent')) {
    headers.set('User-Agent', DEFAULT_USER_AGENT);
  }
  return headers;
}

export function applyUserHeaders(headers: Headers, userHeaders: Record<string, string>): void {
  for (const [key, value] of Object.entries(userHeaders)) {
    headers.set(key, value);
  }
}

/**
 * Build request headers with browser-like defaults. Header names are
 * case-insensitive, so a custom "user-agent" or "accept" header overrides the
 * corresponding default.
 */
export function buildRequestHeaders(userHeaders: Record<string, string> = {}): Headers {
  const headers = buildBaseHeaders();
  applyUserHeaders(headers, userHeaders);
  return headers;
}

export function assertValidHeaderValue(name: string, value: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`Invalid value for header "${truncateHeaderName(name)}": line breaks are not allowed`);
  }
}

/**
 * Parse a "Key: Value" header argument. Returns null for connection-specific
 * headers that should be dropped, and throws for malformed or unsupported
 * headers. Values are never echoed in error messages because they often hold
 * credentials.
 */
export function normalizeUserHeader(argument: string): { name: string; value: string } | null {
  const colon = argument.indexOf(':');
  if (colon === -1) {
    throw new Error('Invalid header format. Use "Key: Value"');
  }

  const name = argument.slice(0, colon).trim();
  const value = argument.slice(colon + 1).trim();

  if (!name) {
    throw new Error('Header name cannot be empty');
  }
  if (!HEADER_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid header name "${truncateHeaderName(name)}"`);
  }

  assertValidHeaderValue(name, value);

  const lower = name.toLowerCase();
  const rejection = REJECTED_HEADERS.get(lower);
  if (rejection) {
    throw new Error(rejection);
  }
  if (HOP_BY_HOP_HEADERS.has(lower)) {
    return null;
  }

  return { name, value };
}

function truncateHeaderName(name: string): string {
  return name.length > MAX_HEADER_NAME_LENGTH ? `${name.slice(0, MAX_HEADER_NAME_LENGTH)}…` : name;
}
