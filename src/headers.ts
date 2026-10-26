const DEFAULT_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'cross-site',
};

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

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
