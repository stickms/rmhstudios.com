/**
 * `fetch()` that aborts after a timeout, so a request on a dead-slow or flaky
 * connection fails fast with a clear error instead of hanging forever and
 * leaving a spinner spinning. Use this for client-side `fetch` to internal
 * APIs where "never resolves" is a worse outcome than "failed, try again".
 *
 * ```ts
 * try {
 *   const res = await fetchWithTimeout('/api/coins', { timeoutMs: 10_000 });
 *   // ...
 * } catch (err) {
 *   if (isTimeout(err)) toast.error('Slow connection — please retry.');
 * }
 * ```
 *
 * On timeout the returned promise rejects with a `DOMException` named
 * `TimeoutError`. Any `signal` you pass is respected too — if it aborts first,
 * the fetch aborts with your reason.
 */
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, signal: externalSignal, ...rest } = init;
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
    timeoutMs,
  );

  // Chain an externally-provided signal so callers can still cancel early.
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), {
        once: true,
      });
    }
  }

  try {
    return await fetch(input, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** True if an error came from {@link fetchWithTimeout} hitting its timeout. */
export function isTimeout(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}
