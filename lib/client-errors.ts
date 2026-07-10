/**
 * Lightweight, dependency-free client-side error reporting.
 *
 * Captures uncaught errors / unhandled promise rejections and explicit reports
 * from React error boundaries, then POSTs a compact payload to
 * `/api/client-error`, where it is rate-limited and logged server-side. This is
 * intentionally wire-compatible with later swapping in a hosted error tracker
 * (Sentry et al.): the call sites (`reportClientError`) stay the same.
 *
 * Hard guards keep a render loop from spamming the sink:
 *   - a per-session cap on total reports
 *   - short-window de-duplication by error signature
 *   - reporting can never itself throw
 */

const ENDPOINT = '/api/client-error';
const MAX_PER_SESSION = 25;
const DEDUPE_WINDOW_MS = 10_000;

let installed = false;
let sent = 0;
const recent = new Map<string, number>();

function signature(message: string, source?: string): string {
  return `${message}::${source ?? ''}`.slice(0, 300);
}

export interface ClientErrorContext {
  /** Where the error came from, e.g. 'route-error' | 'window.onerror'. */
  source?: string;
  /** React component stack, when reporting from an error boundary. */
  componentStack?: string;
}

/** Report a single client error. Safe to call from anywhere; never throws. */
export function reportClientError(error: unknown, context: ClientErrorContext = {}): void {
  if (typeof window === 'undefined') return;
  try {
    const err =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : 'Unknown client error');
    const message = (err.message || 'Unknown client error').slice(0, 500);
    const sig = signature(message, context.source);
    const now = Date.now();

    const last = recent.get(sig);
    if (last && now - last < DEDUPE_WINDOW_MS) return;
    recent.set(sig, now);
    if (recent.size > 100) recent.clear();

    if (sent >= MAX_PER_SESSION) return;
    sent += 1;

    const payload = JSON.stringify({
      message,
      stack: err.stack ? String(err.stack).slice(0, 4000) : undefined,
      componentStack: context.componentStack
        ? context.componentStack.slice(0, 4000)
        : undefined,
      source: context.source ?? 'unknown',
      url: window.location.href.slice(0, 500),
      userAgent: navigator.userAgent.slice(0, 300),
      ts: new Date().toISOString(),
    });

    // `keepalive` / sendBeacon so the report survives an in-flight navigation.
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
    } else {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* error reporting must never throw */
  }
}

/** Install global `error` / `unhandledrejection` listeners exactly once. */
export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', (e: ErrorEvent) => {
    reportClientError(e.error ?? e.message, { source: 'window.onerror' });
  });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    reportClientError(e.reason, { source: 'unhandledrejection' });
  });
}
