/**
 * Helpers for accepting a browser "Copy as cURL" command.
 *
 * meow-loader is not a curl emulator: it accepts the small, safe subset of
 * options that appears in commands copied from a browser Network tab, and
 * rejects everything else with an actionable message.
 */

const CURL_NOOP_LONG = new Set([
  '--compressed',
  '--location',
  '--location-trusted',
  '--silent',
  '--show-error',
  '--globoff',
  '--http1.0',
  '--http1.1',
  '--http2',
  '--http2-prior-knowledge',
  '--include',
  '--verbose',
  '--no-buffer',
  '--fail',
  '--no-progress-meter',
]);

// Short flags that need no behaviour of their own. -k/--insecure is handled
// separately because it maps to --allow-insecure.
const CURL_NOOP_SHORT = new Set(['L', 's', 'S', 'g', 'i', 'v', 'N', 'f']);

const CURL_REJECTED: Record<string, string> = {
  '-X': 'meow-loader only sends GET requests',
  '--request': 'meow-loader only sends GET requests',
  '-I': 'HEAD requests are not supported',
  '--head': 'HEAD requests are not supported',
  '-T': 'uploads are not supported',
  '--upload-file': 'uploads are not supported',
  '-u': 'Basic authentication is not supported; pass -H "Authorization: ..." instead',
  '--user': 'Basic authentication is not supported; pass -H "Authorization: ..." instead',
  '-O': 'writing to a generated filename is not supported; use -o <file.mp4>',
  '--remote-name': 'writing to a generated filename is not supported; use -o <file.mp4>',
  '-J': 'writing to a generated filename is not supported; use -o <file.mp4>',
  '--remote-header-name': 'writing to a generated filename is not supported; use -o <file.mp4>',
  '-c': 'cookie jars are not supported',
  '--cookie-jar': 'cookie jars are not supported',
  '--resolve': 'custom DNS resolution would bypass the URL safety checks and is not supported',
  '--connect-to': 'custom host mapping would bypass the URL safety checks and is not supported',
  '--dns-servers': 'custom DNS servers are not supported',
  '--proxy': 'proxies are not supported',
  '-x': 'proxies are not supported',
  '--noproxy': 'proxies are not supported',
  '--interface': 'binding to a network interface is not supported',
  '--unix-socket': 'Unix sockets are not supported',
  '-4': 'forcing IPv4 is not supported',
  '--ipv4': 'forcing IPv4 is not supported',
  '-6': 'forcing IPv6 is not supported',
  '--ipv6': 'forcing IPv6 is not supported',
  '--cert': 'client certificates are not supported',
  '--key': 'client certificates are not supported',
  '--cacert': 'custom certificate authorities are not supported',
  '--capath': 'custom certificate authorities are not supported',
  '--http3': 'HTTP/3 is not supported',
};

const CURL_REJECTED_PREFIXES: Array<[prefix: string, reason: string]> = [
  ['--data', 'request bodies are not supported; meow-loader only sends GET requests'],
  ['--form', 'request bodies are not supported; meow-loader only sends GET requests'],
  ['--json', 'request bodies are not supported; meow-loader only sends GET requests'],
];

export function isCurlNoopOption(argument: string): boolean {
  if (CURL_NOOP_LONG.has(argument)) {
    return true;
  }

  // Combined short flags such as -sSL.
  if (!/^-[A-Za-z]+$/.test(argument)) {
    return false;
  }

  return [...argument.slice(1)].every(char => CURL_NOOP_SHORT.has(char));
}

export function curlRejectionReason(argument: string): string | undefined {
  const exact = CURL_REJECTED[argument];
  if (exact) {
    return exact;
  }

  for (const [prefix, reason] of CURL_REJECTED_PREFIXES) {
    if (argument.startsWith(prefix)) {
      return reason;
    }
  }

  return undefined;
}

/**
 * curl treats a --cookie argument without "=" as a cookie-jar filename.
 * meow-loader only supports the "name=value; name2=value2" form.
 */
export function parseCookieArgument(argument: string): string {
  if (!argument.includes('=')) {
    throw new Error(
      'Cookie files are not supported. Pass a cookie string like "name=value; name2=value2"',
    );
  }
  if (/[\r\n\0]/.test(argument)) {
    throw new Error('Invalid cookie value: line breaks are not allowed');
  }

  return argument;
}
