/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * Endpoints that fetch arbitrary client-provided URLs (image proxies, oembed /
 * OpenGraph resolvers) are classic SSRF vectors: an attacker can point them at
 * internal services, cloud metadata endpoints (169.254.169.254), or localhost.
 *
 * `safeFetch` validates the URL, resolves its DNS to real IPs, rejects any that
 * land in a private/reserved range, and re-validates on every redirect hop to
 * mitigate DNS-rebinding and redirect-based bypasses.
 *
 * Usage:
 *   const res = await safeFetch(userUrl, { headers: { ... } });
 *   // throws SsrfError if the URL is disallowed
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface SafeFetchOptions extends RequestInit {
  /** Allowed protocols. Defaults to https only. */
  allowedProtocols?: string[];
  /** Optional hostname allowlist (exact host or suffix match, e.g. "tenor.com"). */
  allowedHosts?: string[];
  /** Max redirects to follow manually. Default 3. */
  maxRedirects?: number;
  /** Per-request timeout in ms. Default 5000. */
  timeoutMs?: number;
}

/**
 * Returns true for IPs that must never be reached from a user-controlled fetch:
 * loopback, private RFC1918, link-local (incl. cloud metadata 169.254.169.254),
 * CGNAT, unique-local IPv6, and unspecified/mapped addresses.
 */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) {
    const parts = ip.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true; // malformed → treat as unsafe
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    if (a === 192 && b === 0) return true; // 192.0.0/24, 192.0.2/24 (test)
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (version === 6) {
    const addr = ip.toLowerCase();
    if (addr === '::' || addr === '::1') return true; // unspecified / loopback
    if (addr.startsWith('fe80') || addr.startsWith('fc') || addr.startsWith('fd')) return true; // link-local + ULA
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = addr.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return false;
  }
  // Not a literal IP.
  return false;
}

function hostMatchesAllowlist(hostname: string, allowedHosts: string[]): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((allowed) => {
    const a = allowed.toLowerCase();
    return host === a || host.endsWith(`.${a}`);
  });
}

/** Validate a single URL: protocol, allowlist, and that it resolves to a public IP. */
async function assertSafeUrl(urlStr: string, opts: SafeFetchOptions): Promise<void> {
  const allowedProtocols = opts.allowedProtocols ?? ['https:'];
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new SsrfError('Invalid URL');
  }

  if (!allowedProtocols.includes(url.protocol)) {
    throw new SsrfError(`Disallowed protocol: ${url.protocol}`);
  }

  if (opts.allowedHosts && !hostMatchesAllowlist(url.hostname, opts.allowedHosts)) {
    throw new SsrfError('Host not in allowlist');
  }

  // If the host is already an IP literal, check it directly.
  if (isIP(url.hostname)) {
    if (isPrivateIp(url.hostname)) throw new SsrfError('Disallowed IP address');
    return;
  }

  // Resolve all A/AAAA records and reject if ANY is private (defeats simple
  // rebinding where one record is public and another points inward).
  let records: { address: string }[];
  try {
    records = await lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfError('DNS resolution failed');
  }
  if (records.length === 0) throw new SsrfError('No DNS records');
  for (const { address } of records) {
    if (isPrivateIp(address)) throw new SsrfError('Resolves to a private address');
  }
}

/**
 * Fetch a user-supplied URL with SSRF protection. Validates the URL and every
 * redirect hop. Throws `SsrfError` for disallowed URLs.
 */
export async function safeFetch(urlStr: string, opts: SafeFetchOptions = {}): Promise<Response> {
  const maxRedirects = opts.maxRedirects ?? 3;
  const timeoutMs = opts.timeoutMs ?? 5000;

  // Strip our own non-fetch options before passing to fetch().
  const { allowedProtocols, allowedHosts, maxRedirects: _mr, timeoutMs: _t, signal, ...init } = opts;
  void allowedProtocols;
  void allowedHosts;
  void _mr;
  void _t;

  let current = urlStr;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeUrl(current, opts);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Honor a caller-provided signal in addition to our timeout.
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    let res: Response;
    try {
      res = await fetch(current, { ...init, redirect: 'manual', signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    // Manually follow redirects so we can re-validate each Location.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) return res;
      current = new URL(location, current).toString();
      continue;
    }
    return res;
  }
  throw new SsrfError('Too many redirects');
}
