/**
 * Real-User Monitoring — report Core Web Vitals to /api/rum.
 *
 * Uses the `web-vitals` library to capture LCP, CLS, INP, FCP and TTFB at their
 * correct moments (including bfcache restores) and beacons each metric to the
 * server, where it is rate-limited and logged as a structured sample for
 * aggregate percentile reporting. Anonymous — the server reduces the pathname
 * to a low-cardinality first-segment route label before logging it.
 */

import type { Metric } from 'web-vitals';

const ENDPOINT = '/api/rum';
let started = false;

/**
 * The server's trace id for THIS page's navigation (E1), or undefined.
 *
 * `server/nitro/otel.ts` echoes the request's trace id as
 * `Server-Timing: trace;desc="<id>"`. `Server-Timing` is the only response
 * header a page can read back for its own document, so this is how a "the site
 * was slow at 14:02" beacon becomes a single trace lookup across the SSR log,
 * the socket hub and the Go workers — with no meta tag, no inline script, and
 * no import of the server-only trace module into the client bundle.
 *
 * Resolved once and memoised: the navigation entry is immutable, and
 * `getEntriesByType` is not cheap enough to call once per metric.
 */
let traceId: string | undefined;
let traceResolved = false;

function navigationTraceId(): string | undefined {
  if (traceResolved) return traceId;
  traceResolved = true;
  try {
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    // `serverTiming` is absent on engines that don't implement it and empty
    // cross-origin; both simply mean "no id", never an error.
    const entry = nav?.serverTiming?.find((t) => t.name === 'trace');
    // 32 hex chars — reject anything else rather than beacon a junk value.
    if (entry?.description && /^[0-9a-f]{32}$/.test(entry.description)) {
      traceId = entry.description;
    }
  } catch {
    /* telemetry must never throw */
  }
  return traceId;
}

function send(metric: Metric): void {
  try {
    // `traceId` is omitted entirely when absent — JSON.stringify drops
    // undefined values — so the beacon's shape is unchanged for every browser
    // and every route that doesn't carry one.
    const body = JSON.stringify({
      name: metric.name,
      value: Math.round(metric.value * 1000) / 1000,
      rating: metric.rating,
      id: metric.id,
      navigationType: metric.navigationType,
      path: window.location.pathname.slice(0, 200),
      ts: new Date().toISOString(),
      traceId: navigationTraceId(),
    });
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }));
    } else {
      void fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* telemetry must never throw */
  }
}

/**
 * Start collecting Core Web Vitals. Safe to call once on the client.
 *
 * The library is fetched in its OWN chunk rather than imported at module scope:
 * `__root.tsx` calls this from a mount effect, so a static import only served to
 * put 8.5 KB of measurement code into the entry chunk that every page must parse
 * before it can hydrate — i.e. the monitoring was taxing the very metric it
 * reports. Arriving a tick late costs no data: every metric here is collected
 * through a `buffered: true` PerformanceObserver, so entries that occurred
 * before this resolves (TTFB, FCP, the early layout shifts) are replayed on
 * registration.
 */
export function initWebVitals(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  void import('web-vitals')
    .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      onLCP(send);
      onCLS(send);
      onINP(send);
      onFCP(send);
      onTTFB(send);
    })
    .catch(() => {
      /* telemetry must never break the page */
    });
}
