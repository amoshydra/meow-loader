import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { formatBytes } from './display';
import { applyUserHeaders, buildBaseHeaders } from './headers';
import { normalizeOrigin, redactUrl } from './url';

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const DNS_TIMEOUT_MS = 5_000;
const MAX_RESOLVED_HOSTS = 1_000;
const MAX_HEADER_WARNINGS = 20;

export interface NetworkPolicyOptions {
  playlistUrl: string;
  userHeaders?: Record<string, string>;
  headerOrigins?: string[];
  allowPrivateNetwork?: boolean;
  allowInsecure?: boolean;
  timeoutMs?: number;
  maxRedirects?: number;
}

export interface FetchOptions {
  attempts?: number;
  label?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export class UrlPolicyError extends Error {}

/**
 * Network client that applies URL policy, SSRF protections, redirect limits,
 * request timeouts, and per-origin custom-header scoping.
 */
export class NetworkClient {
  readonly playlistOrigin: string;
  private readonly playlistProtocol: string;
  private readonly userHeaders: Record<string, string>;
  private readonly allowedHeaderOrigins: Set<string>;
  private readonly allowPrivateNetwork: boolean;
  private readonly allowInsecure: boolean;
  private readonly timeoutMs: number;
  private readonly maxRedirects: number;
  private readonly dnsCache = new Map<string, string[]>();
  private readonly warnedHeaderOrigins = new Set<string>();

  constructor(options: NetworkPolicyOptions) {
    let playlist: URL;
    try {
      playlist = new URL(options.playlistUrl);
      assertHttpUrl(playlist);
    } catch (error) {
      throw new Error(`Invalid playlist URL: ${redactUrl(options.playlistUrl)}`);
    }

    this.playlistOrigin = playlist.origin;
    this.playlistProtocol = playlist.protocol;
    this.userHeaders = { ...(options.userHeaders || {}) };
    this.allowedHeaderOrigins = new Set([this.playlistOrigin]);
    this.allowPrivateNetwork = options.allowPrivateNetwork ?? false;
    this.allowInsecure = options.allowInsecure ?? false;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.maxRedirects = options.maxRedirects ?? 10;

    for (const origin of options.headerOrigins || []) {
      try {
        this.allowedHeaderOrigins.add(normalizeOrigin(origin));
      } catch {
        throw new Error(`Invalid --header-origin: ${origin}`);
      }
    }
  }

  async fetch(url: string, init: RequestInit = {}, options: FetchOptions = {}): Promise<Response> {
    const attempts = Math.max(1, options.attempts ?? 1);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const response = await this.fetchOnce(
          url,
          init,
          options.label || 'resource',
          options.signal,
          options.timeoutMs,
        );
        if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt === attempts) {
          return response;
        }
        await response.body?.cancel();
      } catch (error) {
        if (error instanceof UrlPolicyError) {
          throw error;
        }
        lastError = error;
        if (attempt === attempts) {
          throw error;
        }
      }

      if (attempt < attempts) {
        await delay(500 * 2 ** (attempt - 1));
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private async fetchOnce(
    url: string,
    init: RequestInit,
    label: string,
    externalSignal?: AbortSignal,
    timeoutMs?: number,
  ): Promise<Response> {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      throw new UrlPolicyError(`Invalid ${label} URL: ${redactUrl(url)}`);
    }

    for (let redirects = 0; redirects <= this.maxRedirects; redirects++) {
      await this.validateUrl(current, label);

      const headers = this.headersFor(current);
      if (init.headers) {
        new Headers(init.headers).forEach((value, key) => headers.set(key, value));
      }

      const timeoutSignal =
        timeoutMs === 0 ? undefined : AbortSignal.timeout(timeoutMs ?? this.timeoutMs);
      const signal =
        externalSignal && timeoutSignal
          ? AbortSignal.any([externalSignal, timeoutSignal])
          : externalSignal ?? timeoutSignal;

      let response: Response;
      try {
        response = await fetch(current, {
          ...init,
          headers,
          redirect: 'manual',
          signal,
        });
      } catch (error) {
        throw new Error(
          `Request failed for ${label} ${redactUrl(current.href)}: ${errorMessage(error)}`,
        );
      }

      if (!REDIRECT_STATUS.has(response.status)) {
        return response;
      }

      const location = response.headers.get('location');
      if (!location) {
        return response;
      }
      if (redirects >= this.maxRedirects) {
        await response.body?.cancel();
        throw new Error(`Too many redirects while fetching ${redactUrl(current.href)}`);
      }

      await response.body?.cancel();
      current = new URL(location, current);
    }

    throw new Error(`Too many redirects while fetching ${redactUrl(url)}`);
  }

  private headersFor(url: URL): Headers {
    const headers = buildBaseHeaders();

    if (this.allowedHeaderOrigins.has(url.origin)) {
      applyUserHeaders(headers, this.userHeaders);
      return headers;
    }

    if (
      Object.keys(this.userHeaders).length > 0 &&
      !this.warnedHeaderOrigins.has(url.origin) &&
      this.warnedHeaderOrigins.size < MAX_HEADER_WARNINGS
    ) {
      this.warnedHeaderOrigins.add(url.origin);
      console.error(
        `Warning: custom headers were not sent to ${url.origin}. Add --header-origin ${url.origin} if this host requires auth.`,
      );
    }

    return headers;
  }

  private async validateUrl(url: URL, label: string): Promise<void> {
    try {
      assertHttpUrl(url);
    } catch (error) {
      throw new UrlPolicyError(`${label} URL is not supported: ${redactUrl(url.href)}`);
    }

    if (url.username || url.password) {
      throw new UrlPolicyError(`URLs with embedded credentials are not supported: ${redactUrl(url.href)}`);
    }

    if (!this.allowInsecure && this.playlistProtocol === 'https:' && url.protocol === 'http:') {
      throw new UrlPolicyError(
        `Refusing HTTPS-to-HTTP ${label} URL: ${redactUrl(url.href)}. Use --allow-insecure to permit it.`,
      );
    }

    if (this.allowPrivateNetwork) {
      return;
    }

    const addresses = await this.resolveAddresses(url.hostname, label);
    for (const address of addresses) {
      if (isPrivateAddress(address)) {
        throw new UrlPolicyError(
          `Refusing ${label} URL on a loopback/private network address (${address}): ${redactUrl(url.href)}. Use --allow-private-network to permit it.`,
        );
      }
    }
  }

  private async resolveAddresses(hostname: string, label: string): Promise<string[]> {
    const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;

    if (isIP(host)) {
      return [host];
    }

    const cached = this.dnsCache.get(host);
    if (cached) {
      return cached;
    }

    if (this.dnsCache.size >= MAX_RESOLVED_HOSTS) {
      throw new Error(`Too many unique ${label} hosts (limit ${MAX_RESOLVED_HOSTS})`);
    }

    let records: Array<{ address: string; family: number }>;
    let timer: NodeJS.Timeout | undefined;
    try {
      records = await Promise.race([
        lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`DNS lookup timed out for ${host}`)),
            DNS_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (error) {
      throw new Error(`Failed to resolve ${label} host ${host}: ${errorMessage(error)}`);
    } finally {
      if (timer) clearTimeout(timer);
    }

    const addresses = records.map(record => record.address);
    if (addresses.length === 0) {
      throw new Error(`Failed to resolve ${label} host ${host}`);
    }

    this.dnsCache.set(host, addresses);
    return addresses;
  }
}

export async function readResponseBytes(
  response: Response,
  maxBytes: number,
  label = 'Response',
): Promise<Uint8Array> {
  const contentLengthHeader = response.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
  if (contentLength !== undefined && Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(
      `${label} is ${formatBytes(contentLength)}, above the ${formatBytes(maxBytes)} limit`,
    );
  }

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeds the ${formatBytes(maxBytes)} limit`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return combined;
}

export async function readResponseText(
  response: Response,
  maxBytes: number,
  label = 'Playlist',
): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, maxBytes, label));
}

export function isPrivateAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIpv4(address);
  }
  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
}

function assertHttpUrl(url: URL): void {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Unsupported URL protocol: ${url.protocol}`);
  }
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b, c] = parts as [number, number, number, number];

  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 88 && c === 99) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && c === 100) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a >= 224) return true;

  return false;
}

function isPrivateIpv6(address: string): boolean {
  const bytes = ipv6ToBytes(address);
  if (!bytes) {
    return true;
  }

  if (bytes.every(byte => byte === 0)) return true;
  if (bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1) return true;

  // IPv4-mapped and IPv4-compatible addresses.
  if (bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff) {
    return isPrivateIpv4(bytes.slice(12).join('.'));
  }
  if (bytes.slice(0, 12).every(byte => byte === 0)) {
    return isPrivateIpv4(bytes.slice(12).join('.'));
  }

  if ((bytes[0]! & 0xfe) === 0xfc) return true; // fc00::/7
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true; // fe80::/10
  if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0xc0) return true; // fec0::/10
  if (bytes[0] === 0xff) return true; // multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true; // 2001:db8::/32
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) return true; // 64:ff9b::/96
  if (bytes[0] === 0x01 && bytes[1] === 0x00 && bytes.slice(2, 8).every(byte => byte === 0)) return true; // 100::/64

  return false;
}

function ipv6ToBytes(address: string): number[] | undefined {
  let value = address.toLowerCase();
  const zoneIndex = value.indexOf('%');
  if (zoneIndex !== -1) {
    value = value.slice(0, zoneIndex);
  }

  const halves = value.split('::');
  if (halves.length > 2) {
    return undefined;
  }

  const left = parseIpv6Groups(halves[0] || '');
  const right = halves.length === 2 ? parseIpv6Groups(halves[1] || '') : [];
  if (!left || !right) {
    return undefined;
  }

  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - left.length - right.length;
    if (missing < 0) {
      return undefined;
    }
    groups = [...left, ...Array<string>(missing).fill('0'), ...right];
  } else {
    groups = left;
  }

  if (groups.length !== 8) {
    return undefined;
  }

  const bytes: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return undefined;
    }
    const number = Number.parseInt(group, 16);
    bytes.push((number >> 8) & 0xff, number & 0xff);
  }

  return bytes;
}

function parseIpv6Groups(value: string): string[] | undefined {
  if (!value) {
    return [];
  }

  const parts = value.split(':');
  const groups: string[] = [];

  for (const part of parts) {
    if (part.includes('.')) {
      if (!isIP(part) || isIP(part) !== 4) {
        return undefined;
      }
      const octets = part.split('.').map(Number);
      groups.push(((octets[0]! << 8) | octets[1]!).toString(16));
      groups.push(((octets[2]! << 8) | octets[3]!).toString(16));
    } else {
      groups.push(part);
    }
  }

  return groups;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
