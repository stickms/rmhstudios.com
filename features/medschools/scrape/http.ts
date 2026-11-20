/**
 * Polite per-host HTTP gate for the med schools scraper (server only).
 *
 * One gate per source host serializes every request and spaces them, so the
 * hourly job and the backfill can never overlap on the host. Each session owns
 * its failure counter and halts after `maxConsecutiveFailures`.
 *
 * Failure accounting (ruling R2): network errors, 5xx after retries and 429
 * exhaustion are counted here, once. A 404 or a robots.txt refusal comes back
 * as `{ ok: false }` without counting; callers report unexpected-page errors
 * through `noteFailure`.
 */
import { isPathAllowed } from '@/lib/rmhladder/adapters/robots';
import type { SourceConfig } from './sources';

export class SourceHaltedError extends Error {
  constructor(message = 'source halted after repeated failures') {
    super(message);
    this.name = 'SourceHaltedError';
  }
}

export interface PoliteResult {
  ok: boolean;
  status: number;
  body: string;
  notModified?: boolean;
}

export interface PoliteClient {
  /** `path` is a path or an absolute URL on the source origin. */
  get(path: string, opts?: { etag?: string }): Promise<PoliteResult>;
  /** Resets the consecutive-failure counter. */
  noteSuccess(): void;
  /** Pipelines call this for an unparseable page. */
  noteFailure(reason: string): void;
  readonly halted: boolean;
  readonly requests: number;
  readonly lastFailure: string | null;
}

export interface PoliteHost {
  session(opts?: { spacingMs?: number }): PoliteClient;
}

export interface PoliteHostDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPoliteHost(config: SourceConfig, deps: PoliteHostDeps = {}): PoliteHost {
  const sleep = deps.sleep ?? defaultSleep;
  const now = deps.now ?? Date.now;

  // Host-wide state shared by every session.
  let tail: Promise<unknown> = Promise.resolve();
  let lastAt = Number.NEGATIVE_INFINITY;
  let robotsTxt: Promise<string | null> | null = null;

  async function transport(url: string, headers: Record<string, string>): Promise<Response> {
    if (deps.fetchImpl) {
      return deps.fetchImpl(url, {
        headers,
        signal: AbortSignal.timeout(config.timeoutMs),
        redirect: 'follow',
      });
    }
    const { safeFetch } = await import('@/lib/ssrf-guard.server');
    return safeFetch(url, { headers, timeoutMs: config.timeoutMs, allowedProtocols: ['https:'] });
  }

  /** Run `task` alone on the host, after the spacing gap has elapsed. */
  function serialized<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.catch(() => undefined);
    return run;
  }

  async function waitSlot(spacingMs: number): Promise<void> {
    const wait = Math.max(0, lastAt + spacingMs - now());
    if (wait > 0) await sleep(wait);
    lastAt = now();
  }

  function retryDelayMs(res: Response | null, attempt: number, spacingMs: number): number {
    const header = res?.headers.get('retry-after');
    if (header) {
      const secs = Number(header);
      if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, config.retryAfterCapMs);
    }
    return Math.min(spacingMs * 2 ** attempt, config.retryAfterCapMs);
  }

  /** One logical request: attempts with backoff, all inside a single serialized slot. */
  async function fetchWithRetries(
    url: string,
    headers: Record<string, string>,
    spacingMs: number,
  ): Promise<{ result: PoliteResult; transportFailure: boolean }> {
    let last: PoliteResult = { ok: false, status: 0, body: '' };
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      await waitSlot(spacingMs);
      let res: Response | null = null;
      try {
        res = await transport(url, headers);
      } catch {
        last = { ok: false, status: 0, body: '' };
      }
      if (res) {
        if (res.status === 304) return { result: { ok: true, status: 304, body: '', notModified: true }, transportFailure: false };
        const body = await res.text().catch(() => '');
        last = { ok: res.ok, status: res.status, body };
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable) return { result: last, transportFailure: false };
      }
      if (attempt < config.maxRetries) {
        const delay = retryDelayMs(res, attempt + 1, spacingMs);
        await sleep(delay);
      }
    }
    return { result: last, transportFailure: true };
  }

  /** robots.txt body, fetched once per host; null when unreachable (treated as allowed). */
  function loadRobots(spacingMs: number): Promise<string | null> {
    robotsTxt ??= serialized(async () => {
      const { result } = await fetchWithRetries(
        `${config.origin}/robots.txt`,
        { 'user-agent': config.userAgent, accept: 'text/plain, */*;q=0.5' },
        spacingMs,
      );
      return result.ok ? result.body : null;
    });
    return robotsTxt;
  }

  function session(opts: { spacingMs?: number } = {}): PoliteClient {
    const spacingMs = opts.spacingMs ?? config.spacingMs;
    let failures = 0;
    let requests = 0;
    let lastFailure: string | null = null;

    const fail = (reason: string) => {
      failures++;
      lastFailure = reason;
    };

    return {
      async get(path, getOpts = {}) {
        if (failures >= config.maxConsecutiveFailures) throw new SourceHaltedError(lastFailure ?? undefined);
        const url = new URL(path, config.origin);
        if (url.origin !== config.origin) {
          throw new Error(`refusing to fetch ${url.origin}: not the source origin ${config.origin}`);
        }

        const robots = await loadRobots(spacingMs);
        if (robots !== null && !isPathAllowed(robots, config.userAgent, url.pathname)) {
          return { ok: false, status: 0, body: '' };
        }

        const headers: Record<string, string> = {
          'user-agent': config.userAgent,
          accept: 'text/html, application/json;q=0.9, */*;q=0.5',
        };
        if (getOpts.etag) headers['if-none-match'] = getOpts.etag;

        requests++;
        const { result, transportFailure } = await serialized(() =>
          fetchWithRetries(url.toString(), headers, spacingMs),
        );
        if (transportFailure) {
          fail(`${url.pathname}: ${result.status ? `HTTP ${result.status}` : 'network error'}`);
        }
        return result;
      },
      noteSuccess() {
        failures = 0;
      },
      noteFailure(reason) {
        fail(reason);
      },
      get halted() {
        return failures >= config.maxConsecutiveFailures;
      },
      get requests() {
        return requests;
      },
      get lastFailure() {
        return lastFailure;
      },
    };
  }

  return { session };
}
