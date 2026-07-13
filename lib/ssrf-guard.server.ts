/**
 * SSRF guard for server-side fetches of user-supplied URLs.
 *
 * Endpoints that fetch arbitrary client-provided URLs (image proxies, oembed /
 * OpenGraph resolvers) are classic SSRF vectors: an attacker can point them at
 * internal services, cloud metadata endpoints (169.254.169.254), or localhost.
 *
 * `safeFetch` validates the URL, resolves its DNS to real IPs, rejects any that
 * land in a private/reserved range, re-validates on every redirect hop, and
 * PINS undici's connection to the exact validated IP. Without pinning, undici
 * re-resolves DNS independently at connect time, so the address we validated is
 * never actually used — a DNS-rebinding TOCTOU (issue #407). Pinning is done via
 * a per-request undici Agent whose `connect.lookup` returns only the validated
 * address; because the request URL keeps the original hostname, TLS SNI and the
 * Host header stay correct.
 *
 * Usage:
 *   const res = await safeFetch(userUrl, { headers: { ... } });
 *   // throws SsrfError if the URL is disallowed
 */

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
// undici ships as a transitive dependency (Node's global fetch uses an OLDER,
// internal copy that is NOT importable, so we use undici's own fetch/Agent here
// — the two versions are not dispatcher-compatible).
import { Agent, fetch as undiciFetch } from 'undici';

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

/** A validated destination address, used to pin undici's connection (see `safeFetch`). */
interface PinnedTarget {
  address: string;
  /** IP family for undici's lookup callback: 4 (A record) or 6 (AAAA record). */
  family: 4 | 6;
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
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmark)
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (version === 6) {
    const addr = ip.toLowerCase();
    if (addr === '::' || addr === '::1') return true; // unspecified / loopback
    // ULA fc00::/7 (fc, fd) plus link-local fe80::/10 — which spans fe80–febf,
    // i.e. any address starting fe8, fe9, fea, or feb (not just the literal
    // "fe80" prefix). Mirrors the stricter rmhladder guard.
    if (/^(fc|fd|fe8|fe9|fea|feb)/.test(addr)) return true;
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

/**
 * Validate a single URL: protocol, allowlist, and that it resolves to a public
 * IP. Returns the address to pin the connection to — the literal for IP hosts,
 * or the first resolved (already-verified-public) address for hostnames.
 */
async function assertSafeUrl(urlStr: string, opts: SafeFetchOptions): Promise<PinnedTarget> {
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
    return { address: url.hostname, family: isIP(url.hostname) === 6 ? 6 : 4 };
  }

  // Resolve all A/AAAA records and reject if ANY is private (defeats simple
  // rebinding where one record is public and another points inward).
  let records: { address: string; family: number }[];
  try {
    records = await lookup(url.hostname, { all: true });
  } catch {
    throw new SsrfError('DNS resolution failed');
  }
  if (records.length === 0) throw new SsrfError('No DNS records');
  for (const { address } of records) {
    if (isPrivateIp(address)) throw new SsrfError('Resolves to a private address');
  }
  // Pin to the first resolved address; every record was just verified public.
  const [first] = records;
  return { address: first.address, family: first.family === 6 ? 6 : 4 };
}

/** The Response type undici's fetch returns (WHATWG-compatible with the global). */
type PinnedResponse = Awaited<ReturnType<typeof undiciFetch>>;

/**
 * Hand the pinned response back to the caller as a standard `Response`, tearing
 * down the per-request dispatcher once the body is fully read, canceled, or
 * errors — so the pinned connection is never leaked.
 */
function finalizePinnedResponse(res: PinnedResponse, dispatcher: Agent): Response {
  const teardown = () => {
    void dispatcher.destroy();
  };
  const headers = new Headers();
  for (const [key, value] of res.headers as unknown as Iterable<[string, string]>) {
    headers.append(key, value);
  }

  if (!res.body) {
    teardown();
    return new Response(null, { status: res.status, statusText: res.statusText, headers });
  }

  // Stream through a passthrough so teardown fires exactly when the body settles.
  const passthrough = new TransformStream();
  const body = res.body as unknown as ReadableStream<Uint8Array>;
  void body.pipeTo(passthrough.writable).then(teardown, teardown);
  return new Response(passthrough.readable, { status: res.status, statusText: res.statusText, headers });
}

/**
 * Fetch a user-supplied URL with SSRF protection. Validates the URL and every
 * redirect hop, and pins each connection to the exact validated IP so undici
 * cannot re-resolve DNS to a rebound internal address. Throws `SsrfError` for
 * disallowed URLs.
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

  // Per-request pin table consulted by the dispatcher's DNS lookup below. Each
  // hop validates its URL with assertSafeUrl and records the resolved address
  // here, so undici connects to that exact IP instead of re-resolving DNS on its
  // own (which would reopen the rebinding TOCTOU this guard exists to close).
  const pinnedHosts = new Map<string, PinnedTarget>();
  const dispatcher = new Agent({
    connect: {
      // undici's lookup shim mirrors dns.lookup(hostname, { all: true }, cb).
      lookup: (hostname, _lookupOpts, cb) => {
        const target = pinnedHosts.get(hostname.toLowerCase());
        if (target) {
          cb(null, [{ address: target.address, family: target.family }]);
          return;
        }
        // Never let undici resolve a host we did not just validate + pin.
        cb(new SsrfError(`Unpinned host: ${hostname}`), []);
      },
    },
  });

  try {
    let current = urlStr;
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const target = await assertSafeUrl(current, opts);
      pinnedHosts.set(new URL(current).hostname.toLowerCase(), target);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      // Honor a caller-provided signal in addition to our timeout.
      if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

      let res: PinnedResponse;
      try {
        res = await undiciFetch(current, {
          ...init,
          redirect: 'manual',
          signal: controller.signal,
          dispatcher,
        } as Parameters<typeof undiciFetch>[1]);
      } finally {
        clearTimeout(timer);
      }

      // Manually follow redirects so we can re-validate (and re-pin) each Location.
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) return finalizePinnedResponse(res, dispatcher);
        await res.body?.cancel().catch(() => {}); // release the socket before the next hop
        current = new URL(location, current).toString();
        continue;
      }
      return finalizePinnedResponse(res, dispatcher);
    }
    throw new SsrfError('Too many redirects');
  } catch (err) {
    void dispatcher.destroy();
    throw err;
  }
}
