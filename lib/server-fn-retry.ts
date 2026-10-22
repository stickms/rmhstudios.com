/**
 * One bounded retry for TanStack Start server-function GETs.
 *
 * Why this exists: the client's server-function fetcher
 * (`@tanstack/start-client-core` serverFnFetcher → getResponse) does no retry,
 * and for any non-JSON non-2xx response it does `throw new Error(await
 * response.text())`. A 502/503/504 from Apache/Cloudflare during a blue/green
 * hotswap, a pool-exhausted blip, or a dropped connection on a mobile network
 * therefore rejects the root/page loader with the proxy's whole HTML error page
 * as its message, and the route lands on "Something went wrong". These are
 * transient: the same idempotent GET a moment later succeeds.
 *
 * Scope is deliberately narrow: GET requests to `/_serverFn/` only (idempotent
 * by construction — mutations are POST and are never replayed), one retry, a
 * short jittered backoff, never after the caller aborted. If the retry fails
 * too, a gateway-error response is replaced by a short plain-text one so the
 * thrown/reported message is "Server temporarily unavailable (HTTP 502)" rather
 * than 8 KB of Cloudflare HTML.
 */

export const SERVER_FN_RETRY_DELAY_MS = 350;

const GATEWAY_STATUSES = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

export function isServerFnGet(input: RequestInfo | URL, init?: RequestInit): boolean {
  const isRequest = typeof Request !== 'undefined' && input instanceof Request;
  const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return false;
  const url =
    typeof input === 'string' ? input : input instanceof URL ? input.pathname : isRequest ? input.url : '';
  return url.includes('/_serverFn/');
}

export function isGatewayStatus(status: number): boolean {
  return GATEWAY_STATUSES.has(status);
}

function isAbort(error: unknown, init?: RequestInit): boolean {
  if (init?.signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

function cleanGatewayResponse(res: Response): Response {
  return new Response(`Server temporarily unavailable (HTTP ${res.status})`, {
    status: res.status,
    statusText: res.statusText,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

/** A fetch that retries a failed server-fn GET once. Exported for tests. */
export async function fetchWithServerFnRetry(
  baseFetch: typeof fetch,
  input: RequestInfo | URL,
  init?: RequestInit,
  delayMs: number = SERVER_FN_RETRY_DELAY_MS,
): Promise<Response> {
  if (!isServerFnGet(input, init)) return baseFetch(input, init);

  let first: Response | null = null;
  let firstError: unknown = null;
  try {
    first = await baseFetch(input, init);
    if (!isGatewayStatus(first.status)) return first;
  } catch (error) {
    if (isAbort(error, init)) throw error;
    firstError = error;
  }

  await sleep(delayMs + Math.random() * delayMs, init?.signal);
  if (init?.signal?.aborted) {
    if (first) return cleanGatewayResponse(first);
    throw firstError;
  }

  try {
    const second = await baseFetch(input, init);
    return isGatewayStatus(second.status) ? cleanGatewayResponse(second) : second;
  } catch (error) {
    if (isAbort(error, init)) throw error;
    if (first) return cleanGatewayResponse(first);
    throw error;
  }
}

let installed = false;

/** Wrap `window.fetch` once so every server-fn GET gets the retry. */
export function installServerFnRetry(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const baseFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    fetchWithServerFnRetry(baseFetch, input, init)) as typeof fetch;
}
