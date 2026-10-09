/**
 * Client HTTP primitives — typed errors, timeouts and a retry policy that holds
 * up on a bad connection.
 *
 * Three failure modes a fetch in this codebase used to handle badly:
 *
 *  - **It never ends.** A bare `fetch` has no timeout; on a radio that has gone
 *    quiet a request can sit for minutes behind a skeleton that never resolves.
 *    {@link fetchJson} aborts after `timeoutMs` (longer on a slow connection, so
 *    a slow-but-alive link is not cut off) and composes with the caller's signal.
 *  - **Every failure looks the same.** Callers threw `new Error('Failed')`, so a
 *    404 and a dropped connection were indistinguishable — and React Query's
 *    retry retried both. {@link HttpError} carries the status (and Retry-After),
 *    and {@link isRetryable} answers "could trying again help?".
 *  - **Retries stampede.** A fixed delay makes every client that failed together
 *    retry together. {@link retryDelayMs} is exponential with equal jitter and
 *    honours a server's Retry-After.
 *
 * Nothing here is React-specific; `components/Providers.tsx` wires the policy
 * into the QueryClient defaults so every `useQuery` gets it.
 */

import { connectionClass } from '@/lib/network-quality';

export class HttpError extends Error {
  readonly status: number;
  /** Seconds the server asked us to wait (Retry-After), when it said. */
  readonly retryAfterSec?: number;

  constructor(status: number, message?: string, retryAfterSec?: number) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpError';
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

/** A request we aborted because it outlived its timeout. */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Request timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs) && secs >= 0) return secs;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, (at - Date.now()) / 1000);
}

/**
 * Could trying again plausibly succeed?
 *
 * Yes for transport failures (`TypeError` from fetch, a timeout), 408, 425, 429
 * and 5xx. No for every other 4xx — the request itself is wrong (auth, not found,
 * validation) and repeating it only delays the error the user needs to see. An
 * abort the CALLER asked for is not retried either. Unknown errors (a queryFn
 * that threw a plain Error) keep the old behaviour of being retried.
 */
export function isRetryable(error: unknown): boolean {
  if (error instanceof HttpError) {
    const s = error.status;
    return s === 408 || s === 425 || s === 429 || s >= 500;
  }
  if (error instanceof DOMException && error.name === 'AbortError') return false;
  return true;
}

/** Retry budget for one request: one more attempt on a slow link, where blips are common. */
export function maxRetries(): number {
  return connectionClass() === 'slow' ? 3 : 2;
}

/**
 * Delay before retry `attempt` (0-based): exponential from 1s, capped at 15s,
 * with equal jitter (half fixed, half random) so clients that failed together
 * spread out. A server's Retry-After is honoured (capped at 60s).
 */
export function retryDelayMs(attempt: number, error?: unknown, random: () => number = Math.random): number {
  if (error instanceof HttpError && error.retryAfterSec !== undefined) {
    return Math.min(error.retryAfterSec, 60) * 1000;
  }
  const base = Math.min(1000 * 2 ** attempt, 15_000);
  return base / 2 + random() * (base / 2);
}

/** Default timeout: generous on slow links so a slow-but-alive request isn't cut off. */
export function defaultTimeoutMs(): number {
  const cls = connectionClass();
  return cls === 'slow' ? 45_000 : cls === 'moderate' ? 25_000 : 15_000;
}

export interface FetchJsonOptions extends Omit<RequestInit, 'signal'> {
  signal?: AbortSignal;
  /** Abort after this long. Defaults to {@link defaultTimeoutMs}. 0 disables. */
  timeoutMs?: number;
  /**
   * Retries for idempotent requests (GET/HEAD only; ignored otherwise — a
   * retried POST can double-charge or double-post). Defaults to 0: React Query
   * owns retries for queries, so its fetchers should not retry twice over.
   */
  retries?: number;
}

/**
 * `fetch` + JSON with a timeout, typed errors and optional idempotent retries.
 * Throws {@link HttpError} on a non-2xx (with the server's `{ error }` message
 * when it sent one), {@link TimeoutError} on timeout, and rethrows the caller's
 * own abort untouched.
 */
export async function fetchJson<T>(input: RequestInfo | URL, options: FetchJsonOptions = {}): Promise<T> {
  const { timeoutMs = defaultTimeoutMs(), retries = 0, signal, ...init } = options;
  const method = (init.method ?? 'GET').toUpperCase();
  const budget = method === 'GET' || method === 'HEAD' ? retries : 0;

  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal?.reason);
    if (signal) {
      if (signal.aborted) controller.abort(signal.reason);
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    let timedOut = false;
    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : undefined;
    try {
      // `credentials: 'include'` by default: omitting it makes an authenticated
      // endpoint answer 401 in a way that looks like a signed-out session.
      const res = await fetch(input, { credentials: 'include', ...init, signal: controller.signal });
      if (!res.ok) {
        let message: string | undefined;
        try {
          const body = (await res.clone().json()) as { error?: unknown };
          if (typeof body?.error === 'string') message = body.error;
        } catch {
          /* not JSON — keep the status message */
        }
        throw new HttpError(res.status, message, parseRetryAfter(res.headers.get('Retry-After')));
      }
      return (await res.json()) as T;
    } catch (err) {
      const error = timedOut ? new TimeoutError(timeoutMs) : err;
      if (signal?.aborted) throw err;
      if (attempt >= budget || !isRetryable(error)) throw error;
      await new Promise((r) => setTimeout(r, retryDelayMs(attempt, error)));
    } finally {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}
