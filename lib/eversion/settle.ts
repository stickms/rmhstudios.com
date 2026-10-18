/**
 * The AFTER readiness gate (spec amendment 2026-10-18 §6.4a). Client-only at runtime; the decision logic
 * ({@link waitForSettled}) is pure over a probe and a clock, so it is unit-tested in node.
 *
 * ## The bug it closes
 *
 * AFTER used to be captured when the ROUTER was idle, fonts were ready and the viewport's `<img>`s had
 * loaded, plus two frames. A route's loader settling says nothing about what the page then fetches for itself:
 * Home returns its feed UNAWAITED, so the route is idle at once and the feed is still a column of skeletons;
 * React Query hooks, lazy chunks and Suspense boundaries are the same. The texture then froze a half-loaded
 * page, UNWRAP laid that picture onto the screen, and the run ended on the real, loaded page: a jump in content.
 *
 * ## What "settled" means
 *
 * Every condition must hold for {@link AFTER_STABLE_FRAMES} frames in a row:
 *
 * 1. no query that is loading its FIRST data (`fetchStatus` fetching, no `data` yet, an observer mounted) in the
 *    page's React Query client. A background refetch of data already on screen changes nothing a picture shows
 *    and is deliberately not waited for; mutations are user writes, not page content, and are not either;
 * 2. no loading placeholder in the viewport ({@link LOADING_PLACEHOLDER_SELECTOR}: `Skeleton`, `RoutePending`,
 *    `aria-busy`, the radial loader);
 * 3. every `<img>` in the viewport complete, and `document.fonts` not loading;
 * 4. the DOM and the layout quiet for {@link AFTER_QUIET_MS} (no node added or removed, no `src` swap, no
 *    layout-shift entry), outside the hub and the other excluded UI.
 *
 * ## It costs nothing when the page is already settled
 *
 * The first reading after the route is idle passes, and the second frame later it returns: two frames, exactly
 * the two `nextFrame()`s it replaces. The quiet window is measured from the moment the run began observing,
 * which is before the navigation was issued, so a settled page has been quiet for longer than the window.
 *
 * ## It is bounded by the timeline, not by a timer of its own
 *
 * The gate the render side holds open for AFTER ends at the stretch cap. Working back from it:
 *
 * - **soft** = cap - {@link STRETCH_CAP_MS} - {@link PLACEHOLDER_XFADE_MS} - {@link AFTER_CAPTURE_RESERVE_MS}:
 *   the latest AFTER can be captured and crossfaded in without the eversion having to wait for it. Until
 *   then waiting is FREE (the eversion is still turning, AFTER is needed ~3 s in): the full conditions apply.
 * - **hard** = cap - {@link PLACEHOLDER_XFADE_MS} - {@link AFTER_CAPTURE_RESERVE_MS}: past soft the eversion
 *   holds for AFTER, so only ACTIVITY (a fetch, an image, a font still in flight) is waited on, and only to
 *   hard. A skeleton with nothing loading behind it is that page's resting state (a permanent empty-state
 *   shimmer must not stretch every navigation by 2.5 s).
 * - Past hard the page is captured as it is: a late page is shown as the page it was, and the final dissolve
 *   (not a cut) carries it onto what it became.
 *
 * Fast-forward and back/forward skip the wait altogether.
 */

import {
  AFTER_CAPTURE_RESERVE_MS,
  AFTER_DECODE_CAP_MS,
  AFTER_QUIET_CAP_MS,
  AFTER_QUIET_MS,
  AFTER_RENDER_GRACE_MS,
  AFTER_STABLE_FRAMES,
  CAPTURE_EXCLUDE_SELECTORS,
  LOADING_PLACEHOLDER_SELECTOR,
  PLACEHOLDER_XFADE_MS,
  STRETCH_CAP_MS,
} from './constants';
import { getSharedQueryClient } from '../query-client-ref';

/** What one look at the page found. */
export interface SettleReading {
  /** Queries with an observer, loading their first data. */
  fetching: number;
  /** Viewport images not yet complete. */
  images: number;
  fontsLoading: boolean;
  /** Loading placeholders in the viewport. */
  placeholders: number;
  /** `performance.now()` of the last DOM or layout change outside the excluded UI; `-Infinity` if none. */
  lastChangeAt: number;
}

export interface SettleProbe {
  read(): SettleReading;
  dispose(): void;
}

export interface SettleEnv {
  now(): number;
  /** Resolves on the next animation frame (or a timer, in a hidden tab). */
  nextFrame(): Promise<void>;
}

export interface SettleRequest {
  /** Instants on the `env.now()` clock; re-read every frame (a fast-forward moves them). */
  soft(): number;
  hard(): number;
  /** The run no longer wants AFTER (ended, aborted, UNWRAP began). */
  cancelled(): boolean;
  /** The visitor hurried the run: capture now. */
  hurried(): boolean;
}

export type SettleReason = 'settled' | 'rested' | 'hard-deadline' | 'hurried' | 'cancelled';

/** What the gate found, for the debug slot and the tests. */
export interface SettleReport {
  /** Every condition held: the page is what the visitor will see. */
  settled: boolean;
  reason: SettleReason;
  /** How long the gate waited, ms. */
  waitedMs: number;
  frames: number;
  /** The last reading. */
  last: SettleReading | null;
}

/**
 * The two instants a settle wait is bounded by, worked back from the timeline's AFTER deadline (the render
 * side's `need-after-by`, on this thread's clock). See the module doc.
 */
export function afterSettleDeadlines(needBy: number): { soft: number; hard: number } {
  const hard = needBy - PLACEHOLDER_XFADE_MS - AFTER_CAPTURE_RESERVE_MS;
  return { soft: hard - STRETCH_CAP_MS, hard };
}

/**
 * Wait until the page is settled, or the bounds say stop. Pure over `probe` and `env`.
 */
export async function waitForSettled(
  probe: SettleProbe,
  env: SettleEnv,
  req: SettleRequest,
): Promise<SettleReport> {
  const started = env.now();
  let frames = 0;
  let stable = 0;
  let lastActivityAt = started;
  let calmSince: number | null = null;
  let last: SettleReading | null = null;
  const report = (reason: SettleReason): SettleReport => ({
    settled: reason === 'settled',
    reason,
    waitedMs: env.now() - started,
    frames,
    last,
  });

  for (;;) {
    if (req.cancelled()) return report('cancelled');
    const now = env.now();
    const r = (last = probe.read());
    const activity = r.fetching > 0 || r.images > 0 || r.fontsLoading;
    if (activity) lastActivityAt = now;
    const calm = !activity && r.placeholders === 0;
    calmSince = calm ? (calmSince ?? now) : null;
    // Quiet is waited for, but only for so long once everything else is in order.
    const quiet =
      now - r.lastChangeAt >= AFTER_QUIET_MS ||
      (calmSince !== null && now - calmSince >= AFTER_QUIET_CAP_MS);
    stable = calm && quiet ? stable + 1 : 0;
    if (stable >= AFTER_STABLE_FRAMES) return report('settled');
    if (req.hurried()) return report('hurried');
    // Past the free window only activity holds the capture, and the result gets a moment to render.
    if (now >= req.soft() && !activity && now - lastActivityAt >= AFTER_RENDER_GRACE_MS) {
      return report('rested');
    }
    if (now >= req.hard()) return report('hard-deadline');
    await env.nextFrame();
    frames++;
  }
}

/* ═════════════════════════════════════════════════════════════════════════════
   The DOM probe
   ═════════════════════════════════════════════════════════════════════════════ */

const EXCLUDED = CAPTURE_EXCLUDE_SELECTORS.join(',');
/** A page with a thousand placeholders needs no exact count: enough is enough. */
const PROBE_LOOK_CAP = 64;

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return (
    r.width > 0 &&
    r.height > 0 &&
    r.bottom > 0 &&
    r.right > 0 &&
    r.top < window.innerHeight &&
    r.left < window.innerWidth
  );
}

function outsideExcluded(node: Node | null): boolean {
  const el = node instanceof Element ? node : (node?.parentElement ?? null);
  return !el || !el.closest(EXCLUDED);
}

/** Queries with an observer on screen that are loading their first data. */
export function countLoadingQueries(): number {
  const client = getSharedQueryClient();
  if (!client) return 0;
  try {
    let n = 0;
    for (const q of client.getQueryCache().findAll({ fetchStatus: 'fetching' })) {
      if (q.state.data === undefined && q.isActive()) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

/** The viewport's images that are not complete. */
function loadingImages(): HTMLImageElement[] {
  const out: HTMLImageElement[] = [];
  for (const img of Array.from(document.images)) {
    if (img.complete || !inViewport(img) || !outsideExcluded(img)) continue;
    out.push(img);
    if (out.length >= PROBE_LOOK_CAP) break;
  }
  return out;
}

function countPlaceholders(): number {
  let n = 0;
  for (const el of Array.from(document.querySelectorAll(LOADING_PLACEHOLDER_SELECTOR))) {
    if (!inViewport(el) || !outsideExcluded(el)) continue;
    if (++n >= PROBE_LOOK_CAP) break;
  }
  return n;
}

/**
 * Observe the live document. Starts watching when called (the runner calls it BEFORE the navigation is issued,
 * so the quiet window covers the route's own commit). `dispose()` stops it.
 */
export function createDomProbe(): SettleProbe {
  if (typeof document === 'undefined') throw new Error('eversion: settle probe needs a document');
  let lastChangeAt = -Infinity;
  const stamp = () => {
    lastChangeAt = performance.now();
  };
  let mo: MutationObserver | null = null;
  let po: PerformanceObserver | null = null;
  try {
    mo = new MutationObserver((records) => {
      for (const r of records) {
        if (outsideExcluded(r.target)) {
          stamp();
          return;
        }
      }
    });
    // Not `characterData`: a clock or a counter ticking is not a page that has not loaded.
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'hidden', 'aria-busy'],
    });
  } catch {
    mo = null;
  }
  try {
    po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const shift = e as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
        if ((shift.value ?? 0) > 0 && !shift.hadRecentInput) stamp();
      }
    });
    po.observe({ type: 'layout-shift', buffered: false });
  } catch {
    po = null;
  }
  return {
    read: () => ({
      fetching: countLoadingQueries(),
      images: loadingImages().length,
      fontsLoading: document.fonts?.status === 'loading',
      placeholders: countPlaceholders(),
      lastChangeAt,
    }),
    dispose() {
      mo?.disconnect();
      po?.disconnect();
    },
  };
}

/** `img.decode()` of the viewport's images, bounded: the bitmap the capture reads is then ready to paint. */
export async function decodeViewportImages(capMs = AFTER_DECODE_CAP_MS): Promise<void> {
  const pending = Array.from(document.images)
    .filter((img) => img.complete && img.naturalWidth > 0 && inViewport(img))
    .slice(0, PROBE_LOOK_CAP)
    .map((img) => img.decode().catch(() => undefined));
  if (pending.length === 0) return;
  await Promise.race([
    Promise.all(pending),
    new Promise<void>((resolve) => setTimeout(resolve, capMs)),
  ]);
}
