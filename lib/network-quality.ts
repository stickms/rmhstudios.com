'use client';

/**
 * Network quality — the one place the client decides how good the connection is
 * and how much the visitor wants us to spend of it.
 *
 * Before this module, five files read `navigator.connection` on their own
 * (`perf-tier`, `performance-tier`, `useDataSaver`, `viewport-prefetch`, `rum`),
 * each with its own idea of "slow" — and the speculative prefetchers ignored the
 * site's own Data Saver setting entirely: a visitor who switched it ON in
 * Settings still had routes warmed on hover and on scroll, because only the
 * browser's Save-Data flag was consulted. New code reads the network through
 * here; `viewport-prefetch` and `useDataSaver` delegate to it.
 *
 * Three inputs, in order of authority:
 *
 *  1. **The visitor's explicit choice** — the Data Saver setting
 *     (`rmh-data-saver`: `on` / `off` / `auto`). `on` always means "spend less";
 *     `off` means "don't hold back on my account", though a connection that is
 *     genuinely slow is still treated as slow (speculating on 2G hurts the page
 *     being read, whatever the preference says).
 *  2. **What the browser reports** — `navigator.connection` (`saveData`,
 *     `effectiveType`, `rtt`) and `prefers-reduced-data`. Chromium only.
 *  3. **What this page measured** — the document's own TCP handshake time from
 *     Navigation Timing, which is one round trip. It is the only signal Safari
 *     and Firefox give, and without it every one of their visitors read as "fast
 *     connection" however slow the link actually was.
 *
 * Everything here is synchronous, allocation-light and safe on the server (where
 * it answers "unknown" / "no preference"), so it can be called from render paths,
 * event handlers and the router alike.
 */

/** The Network Information API surface we read. Not in lib.dom; all optional. */
export interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
  /** Estimated round trip in ms, rounded to 25ms by the browser. */
  readonly rtt?: number;
  /** Estimated downlink in Mbit/s. */
  readonly downlink?: number;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

/**
 * - `offline` — the browser says there is no network.
 * - `slow` — 2G-class: round trips of a second or more. Do the minimum.
 * - `moderate` — 3G-class: usable, but every extra request is felt.
 * - `fast` — 4G/broadband.
 * - `unknown` — no signal at all (server, or a browser with no API whose
 *   handshake was not observable). Callers treat it as "probably fine".
 */
export type ConnectionClass = 'offline' | 'slow' | 'moderate' | 'fast' | 'unknown';

/** localStorage key + event of the Data Saver setting (owned by hooks/useDataSaver). */
export const DATA_SAVER_KEY = 'rmh-data-saver';
export const DATA_SAVER_EVENT = 'rmh:data-saver';

/** Round-trip thresholds, in ms, matching Chrome's own effectiveType buckets. */
const SLOW_RTT_MS = 1400;
const MODERATE_RTT_MS = 270;

export function readConnection(): NetworkInformationLike | undefined {
  const nav = (globalThis as { navigator?: Navigator & { connection?: NetworkInformationLike } })
    .navigator;
  return nav?.connection;
}

/** The stored Data Saver preference, or `auto`. Never throws (private mode, SSR). */
export function readDataSaverSetting(): 'auto' | 'on' | 'off' {
  try {
    const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem(DATA_SAVER_KEY);
    return raw === 'on' || raw === 'off' ? raw : 'auto';
  } catch {
    return 'auto';
  }
}

/**
 * `@media (prefers-reduced-data: reduce)`. A browser that doesn't know the
 * feature evaluates the query to `not all`, which correctly reads as "no
 * preference".
 */
function prefersReducedDataQuery(): boolean {
  const mm = (globalThis as { matchMedia?: (query: string) => { matches: boolean } }).matchMedia;
  if (typeof mm !== 'function') return false;
  try {
    return mm.call(globalThis, '(prefers-reduced-data: reduce)').matches === true;
  } catch {
    return false;
  }
}

/**
 * One round trip, as this page load observed it: the TCP handshake of the
 * document request (`connectEnd - connectStart`). Zero when the connection was
 * reused or the page came from a cache, which says nothing about the network —
 * so that reads as `undefined`, not as "instant".
 */
export function measuredRttMs(): number | undefined {
  const perf = (globalThis as { performance?: Performance }).performance;
  if (!perf || typeof perf.getEntriesByType !== 'function') return undefined;
  try {
    const nav = perf.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return undefined;
    const handshake = nav.connectEnd - nav.connectStart;
    return handshake > 0 ? handshake : undefined;
  } catch {
    return undefined;
  }
}

function classFromRtt(rtt: number): ConnectionClass {
  if (rtt >= SLOW_RTT_MS) return 'slow';
  if (rtt >= MODERATE_RTT_MS) return 'moderate';
  return 'fast';
}

/** How good the connection is right now. See {@link ConnectionClass}. */
export function connectionClass(): ConnectionClass {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav && nav.onLine === false) return 'offline';

  const conn = readConnection();
  const type = conn?.effectiveType;
  if (type === 'slow-2g' || type === '2g') return 'slow';
  if (type === '3g') return 'moderate';
  // `effectiveType` saturates at '4g'; a live `rtt` can still say otherwise
  // (a congested "4g" link), so it gets the last word when present.
  if (typeof conn?.rtt === 'number' && conn.rtt > 0) return classFromRtt(conn.rtt);
  if (type === '4g') return 'fast';

  const measured = measuredRttMs();
  return measured === undefined ? 'unknown' : classFromRtt(measured);
}

/**
 * Has the visitor (or their browser) asked us to use less data?
 *
 * The user-preference half of the policy — deliberately separate from
 * {@link shouldSpeculate}'s network-quality half. The site's own setting wins:
 * `on` is always yes and `off` is always no; under `auto` the browser's
 * Save-Data flag and `prefers-reduced-data` decide.
 */
export function prefersLessData(): boolean {
  const setting = readDataSaverSetting();
  if (setting === 'on') return true;
  if (setting === 'off') return false;
  return readConnection()?.saveData === true || prefersReducedDataQuery();
}

/**
 * Is speculative fetching (warming a route the visitor has not asked for yet)
 * appropriate right now?
 *
 * No when the visitor asked for less data, and no on anything slower than a
 * fast connection: on 3G and below a speculative request queues ahead of the
 * content actually being read and makes the current page slower to win a
 * navigation that may never happen. `unknown` reads as yes — those browsers are
 * a large share of the traffic this exists for, and "no signal" must not mean
 * "no feature".
 */
export function shouldSpeculate(): boolean {
  if (prefersLessData()) return false;
  const cls = connectionClass();
  return cls === 'fast' || cls === 'unknown';
}
