export const LADDER_USER_AGENT =
  process.env.LADDER_USER_AGENT ?? 'rmhladder-bot/0.1 (+https://rmhstudios.com)';

export interface PoliteResponse { ok: boolean; status: number; body: string }

type Sleep = (ms: number) => Promise<void>;

const sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A small, process-local start-rate limiter. Calls for the same hostname are
 * serialized and start no faster than `minIntervalMs`; unrelated domains do
 * not block one another.
 */
export class DomainRateLimiter {
  private readonly nextStartAt = new Map<string, number>();
  private readonly tails = new Map<string, Promise<void>>();

  constructor(
    private readonly minIntervalMs: number,
    private readonly now: () => number = Date.now,
    private readonly sleepImpl: Sleep = sleep,
  ) {}

  async wait(url: URL): Promise<void> {
    if (this.minIntervalMs <= 0) return;

    const domain = url.hostname.toLowerCase();
    const previous = this.tails.get(domain) ?? Promise.resolve();
    const current = previous
      .catch(() => {})
      .then(async () => {
        const waitMs = Math.max(0, (this.nextStartAt.get(domain) ?? 0) - this.now());
        if (waitMs > 0) await this.sleepImpl(waitMs);
        this.nextStartAt.set(domain, this.now() + this.minIntervalMs);
      });

    this.tails.set(domain, current);
    try {
      await current;
    } finally {
      if (this.tails.get(domain) === current) this.tails.delete(domain);
    }
  }
}

function configuredRateLimitMs(): number {
  if (process.env.NODE_ENV === 'test') return 0;
  const parsed = Number(process.env.LADDER_DOMAIN_RATE_LIMIT_MS ?? '1000');
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
}

const domainRateLimiter = new DomainRateLimiter(configuredRateLimitMs());
const DEFAULT_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export async function readResponseBodyLimited(
  response: Response,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
  if (!response.body) return '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('response too large');
        throw new Error(`Upstream response exceeds ${maxBytes} bytes`);
      }
      output += decoder.decode(value, { stream: true });
    }
    output += decoder.decode();
    return output;
  } finally {
    reader.releaseLock();
  }
}

/** Marks a fetch wrapper that applies the shared domain limiter at its cache-miss/network boundary. */
export const LADDER_FETCH_HANDLES_RATE_LIMIT = Symbol('ladder-fetch-handles-rate-limit');

export async function waitForLadderDomain(url: URL): Promise<void> {
  await domainRateLimiter.wait(url);
}

const BLOCKED_HOSTS = new Set(['localhost', 'localhost.localdomain']);

function isBlockedIpv4(hostname: string): boolean {
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map(Number);
  if (octets.some((part) => part < 0 || part > 255)) return true;
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isBlockedIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host.includes(':')) return false;
  if (host === '::' || host === '::1') return true;
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return true;
  const mapped = host.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return mapped ? isBlockedIpv4(mapped[1]) : false;
}

/**
 * Reject malformed, credential-bearing, non-HTTPS, and obviously local URLs
 * before any request is attempted. Production calls without an injected
 * fetch receive an additional DNS/redirect check from the shared SSRF guard.
 */
export function parseSafeLadderUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!hostname || BLOCKED_HOSTS.has(hostname)) return null;
  if (hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return null;
  if (isBlockedIpv4(hostname) || isBlockedIpv6(hostname)) return null;
  return url;
}

export async function politeFetch(
  url: string,
  opts: {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    init?: RequestInit;
    rateLimiter?: DomainRateLimiter;
    maxResponseBytes?: number;
  } = {},
): Promise<PoliteResponse> {
  const {
    fetchImpl,
    timeoutMs = 10_000,
    init = {},
    rateLimiter = domainRateLimiter,
    maxResponseBytes = DEFAULT_MAX_RESPONSE_BYTES,
  } = opts;
  const safeUrl = parseSafeLadderUrl(url);
  if (!safeUrl) return { ok: false, status: 0, body: '' };

  try {
    const fetchHandlesRateLimit = Boolean(
      fetchImpl &&
      (fetchImpl as typeof fetch & { [LADDER_FETCH_HANDLES_RATE_LIMIT]?: boolean })[LADDER_FETCH_HANDLES_RATE_LIMIT],
    );
    if (!fetchHandlesRateLimit) await rateLimiter.wait(safeUrl);
    const headers = new Headers(init.headers);
    headers.set('user-agent', LADDER_USER_AGENT);
    if (!headers.has('accept')) headers.set('accept', 'application/json, text/html;q=0.9');

    let res: Response;
    if (fetchImpl) {
      res = await fetchImpl(safeUrl.toString(), {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
        // API adapters use fixed official hosts and do not need redirects.
        redirect: 'error',
      });
    } else {
      const { safeFetch } = await import('../../ssrf-guard.server');
      res = await safeFetch(safeUrl.toString(), {
        ...init,
        headers,
        timeoutMs,
        allowedProtocols: ['https:'],
      });
    }

    return { ok: res.ok, status: res.status, body: await readResponseBodyLimited(res, maxResponseBytes) };
  } catch {
    return { ok: false, status: 0, body: '' };
  }
}
