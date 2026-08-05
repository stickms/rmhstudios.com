/**
 * Real-User Monitoring — report Core Web Vitals to /api/rum.
 *
 * Uses the `web-vitals` library's **attribution** build to capture LCP, CLS,
 * INP, FCP and TTFB at their correct moments (including bfcache restores) and
 * beacons each metric to the server, where it is rate-limited and logged as a
 * structured sample for aggregate percentile reporting. Anonymous — the server
 * reduces the pathname to a low-cardinality first-segment route label before
 * logging it.
 *
 * Each metric carries the diagnostic fields that make it *actionable* rather
 * than merely alarming (OPT-35): which phase of an interaction dominated INP,
 * which element painted last for LCP, which element moved for CLS. A plain
 * `{name, value}` sample can only ever say "a route is slow"; these say why.
 *
 * Back/forward navigations additionally report whether the document was served
 * from the back/forward cache, and when it was not, which disqualifier fired
 * (OPT-31) — so bfcache eligibility is a monitored number rather than something
 * that silently rots the next time a `no-store` header or an `unload` listener
 * is added.
 */

import type { Metric } from 'web-vitals';

const ENDPOINT = '/api/rum';
let started = false;

/**
 * Caps for the free-form strings in a beacon.
 *
 * They exist here *and* in `/api/rum`'s zod schema on purpose: this copy keeps
 * the beacon small, and the server's copy is the one that is actually trusted.
 */
const TARGET_MAX = 120;
const SCRIPT_MAX = 200;
const REASONS_MAX = 200;

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

/* -------------------------------------------------------------------------- */
/* Beacon shape                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The envelope every beacon shares.
 *
 * `name` widens `Metric['name']` with `BFCACHE`, which is ours rather than Web
 * Vitals' — it rides the same endpoint because it answers the same question
 * ("did this navigation go well?") and because a second endpoint would mean a
 * second rate-limit bucket and a second schema to keep in step.
 */
interface RumSample {
  name: Metric['name'] | 'BFCACHE';
  value: number;
  rating?: Metric['rating'];
  id?: string;
  navigationType?: string;
}

/**
 * Diagnostic fields. Every one is optional and every one is dropped from the
 * JSON when absent, so a browser that supports none of the attribution APIs
 * still sends exactly the beacon it sent before.
 */
interface RumAttribution {
  /* INP */
  inputDelay?: number;
  processingDuration?: number;
  presentationDelay?: number;
  target?: string;
  script?: string;
  /* LCP */
  element?: string;
  ttfb?: number;
  resourceLoadDelay?: number;
  resourceLoadDuration?: number;
  elementRenderDelay?: number;
  /* CLS */
  shifted?: string;
  /* bfcache */
  reasons?: string;
}

/**
 * A finite number as whole milliseconds, or `undefined` when the field is not
 * present at all.
 *
 * Every attribution field goes through this rather than being read directly:
 * the attribution objects are shaped by whichever browser produced them, so a
 * missing field is normal, not exceptional, and `Math.round(undefined)` is
 * `NaN` — which `JSON.stringify` silently turns into `null` and the server's
 * schema then rejects, taking the whole beacon with it.
 */
function ms(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  // Clamped, not dropped: a phase that rounds to a hair below zero is still a
  // real "0 ms", whereas a missing field reads as "not supported here".
  return Math.max(0, Math.round(value));
}

/** A non-empty string truncated to `max`, or `undefined`. */
function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

function send(sample: RumSample, attribution: RumAttribution = {}): void {
  try {
    // Absent fields are omitted entirely — `JSON.stringify` drops `undefined`
    // values — so the beacon's shape is unchanged for every browser and every
    // route that carries no trace id and supports no attribution API.
    const body = JSON.stringify({
      name: sample.name,
      value: Math.round(sample.value * 1000) / 1000,
      rating: sample.rating,
      id: sample.id,
      navigationType: sample.navigationType,
      path: window.location.pathname.slice(0, 200),
      ts: new Date().toISOString(),
      traceId: navigationTraceId(),
      ...attribution,
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

/* -------------------------------------------------------------------------- */
/* bfcache (OPT-31)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * `PerformanceNavigationTiming.notRestoredReasons` is not in the DOM lib yet,
 * and shipped in two shapes: a list of `{ reason }` objects today, a list of
 * bare strings in earlier Chrome builds. Both are read, so a field sample from
 * an older client is never silently empty.
 */
type NavigationTimingWithReasons = PerformanceNavigationTiming & {
  notRestoredReasons?: { reasons?: ({ reason?: string } | string)[] | null } | null;
};

/**
 * Whether this browser implements `notRestoredReasons`.
 *
 * Chromium-only today; the guard is what keeps this inert elsewhere. It gates
 * the restored sample as well as the not-restored one, deliberately: a hit rate
 * built from everybody's hits over Chromium's misses is not a rate, and the
 * only safe way to keep numerator and denominator drawn from one population is
 * to report neither where the API is missing.
 */
function supportsNotRestoredReasons(): boolean {
  return (
    typeof PerformanceNavigationTiming !== 'undefined' &&
    'notRestoredReasons' in PerformanceNavigationTiming.prototype
  );
}

/** The distinct blocking reasons for this navigation, sorted for groupability. */
function blockingReasons(nav: PerformanceNavigationTiming): string[] {
  const raw = (nav as NavigationTimingWithReasons).notRestoredReasons?.reasons ?? [];
  const seen = new Set<string>();
  for (const item of raw) {
    const reason = typeof item === 'string' ? item : item?.reason;
    if (typeof reason === 'string' && reason) seen.add(reason);
  }
  // Sorted so one disqualifier set is always one string: `{a,b}` and `{b,a}`
  // are the same regression and must not become two series.
  return [...seen].sort();
}

/**
 * Report whether a back/forward navigation was served from the back/forward
 * cache, and when it was not, why.
 *
 * The reasons are structured and blame-free (`unload-handler`,
 * `response-cache-control-no-store`, `masked`, …), so a regression surfaces as
 * a named cause rather than a mystery latency bump on back navigations.
 */
function reportBfcache(): void {
  try {
    if (!supportsNotRestoredReasons()) return;

    // A bfcache HIT never reaches the code below: the document is resumed, not
    // re-evaluated, so no module-scope code runs on a restore. The hit has to
    // be caught as an event instead. `persisted` is false on the initial
    // pageshow, so this fires only on a genuine restore — and it is not `once`,
    // because back → forward → back restores the same document repeatedly.
    window.addEventListener('pageshow', (event) => {
      if (!event.persisted) return;
      send({
        name: 'BFCACHE',
        value: 1, // 1 = restored
        rating: 'good',
        id: 'restored',
        navigationType: 'back-forward',
      });
    });

    // A bfcache MISS is an ordinary document load whose navigation entry says
    // `back_forward`: the user pressed Back and got a fresh document anyway.
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[];
    if (nav?.type !== 'back_forward') return;
    const reasons = blockingReasons(nav);
    send(
      {
        name: 'BFCACHE',
        value: 0,
        rating: 'poor',
        id: 'not-restored',
        navigationType: 'back-forward',
      },
      // A miss with no listed reason is still a miss; labelling it keeps it in
      // the denominator instead of vanishing into an absent field.
      { reasons: clip(reasons.join(','), REASONS_MAX) ?? 'unknown' },
    );
  } catch {
    /* telemetry must never throw */
  }
}

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Start collecting Core Web Vitals. Safe to call once on the client.
 *
 * The library is fetched in its OWN chunk rather than imported at module scope:
 * `__root.tsx` calls this from a mount effect, so a static import only served to
 * put 8.5 KB of measurement code into the entry chunk that every page must parse
 * before it can hydrate — i.e. the monitoring was taxing the very metric it
 * reports. The attribution build is ~2 KB larger again, which makes keeping the
 * import dynamic more load-bearing than it was, not less: **this import must
 * stay dynamic** (`docs/performance-audit-2026-08-04.md` §4, OPT-35 gotcha 1).
 *
 * Arriving a tick late costs no data: every metric here is collected through a
 * `buffered: true` PerformanceObserver, so entries that occurred before this
 * resolves (TTFB, FCP, the early layout shifts) are replayed on registration.
 * The bfcache report is the one thing that does *not* wait for the chunk — it
 * reads an already-complete navigation entry, so it runs inline.
 */
export function initWebVitals(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  reportBfcache();
  void import('web-vitals/attribution')
    .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
      onLCP((metric) => {
        const a = metric.attribution;
        send(metric, {
          // web-vitals v6 renamed LCP's attributed selector from `element` to
          // `target`. The beacon field stays `element` because `target` already
          // means "the thing the user interacted with" for INP, and both share
          // one flat payload.
          element: clip(a?.target, TARGET_MAX),
          // The load-phase breakdown, which says whether a slow LCP is the
          // server (ttfb), discovery (resourceLoadDelay), the byte transfer
          // (resourceLoadDuration) or everything after it (elementRenderDelay).
          ttfb: ms(a?.timeToFirstByte),
          resourceLoadDelay: ms(a?.resourceLoadDelay),
          resourceLoadDuration: ms(a?.resourceLoadDuration),
          elementRenderDelay: ms(a?.elementRenderDelay),
        });
      });
      onCLS((metric) =>
        send(metric, { shifted: clip(metric.attribution?.largestShiftTarget, TARGET_MAX) }),
      );
      onINP((metric) => {
        const a = metric.attribution;
        send(metric, {
          // The three numbers that decompose INP. Together they say WHICH phase
          // to fix, which is the entire point of measuring it:
          //   inputDelay         → the main thread was busy before the handler ran
          //   processingDuration → the handler itself is slow
          //   presentationDelay  → style/layout/paint after the handler returned
          inputDelay: ms(a?.inputDelay),
          processingDuration: ms(a?.processingDuration),
          presentationDelay: ms(a?.presentationDelay),
          // A selector path to the element that was interacted with. This is
          // what turns "INP is bad on /" into "INP is bad on the like button in
          // a feed card"; the server normalizes it before logging, because a
          // selector carrying a row index or a generated id is a new series per
          // row.
          target: clip(a?.interactionTarget, TARGET_MAX),
          // The script the Long Animation Frames API blames for the frame.
          // `longestScript` is the better answer where it exists (the longest
          // script actually intersecting the interaction); the raw LoAF entry is
          // the fallback for builds that don't summarise it. Absent entirely
          // without LoAF support, and on frames under the 50 ms reporting bar.
          script: clip(
            a?.longestScript?.entry?.sourceURL ??
              a?.longAnimationFrameEntries?.[0]?.scripts?.[0]?.sourceURL,
            SCRIPT_MAX,
          ),
        });
      });
      onFCP(send);
      onTTFB(send);
    })
    .catch(() => {
      /* telemetry must never break the page */
    });
}
