'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { isIosWebKit, isPerfLite, supportsViewTimeline } from '@/lib/perf-tier';

export interface RadialWheelItem {
  id: string;
  node: ReactNode;
}

/**
 * Who draws the rake.
 *
 * - `css` — a scroll-driven CSS animation (`animation-timeline: view()`) does
 *   the whole thing, on the thread that owns the scroll. Nothing here runs.
 * - `js`  — the hand-driven fallback below: a rAF-throttled `scroll` pass.
 * - `off` — no rake; the wheel is a plain column.
 *
 * See {@link resolveRakeMode} for how one is picked, and the `@supports` block
 * beside `.radial-wheel__slot` in `radial.css` for the CSS half.
 */
type RakeMode = 'css' | 'js' | 'off';

/**
 * Pick the rake, in the order the reasons outrank each other.
 *
 * 1. **Reduced motion wins outright.** A curve the page applies to itself as you
 *    scroll is exactly the unrequested motion the preference is about.
 * 2. **`perf-lite` next.** Continuous decorative GPU work is what that tier
 *    exists to drop, whichever thread it would have run on.
 * 3. **CSS if the browser has scroll-driven animations.** This is the good
 *    path — the effect stops being scroll-*linked* (JS reacting to a scroll
 *    that already happened) and becomes scroll-*driven* (the compositor
 *    evaluating it as part of the same frame), so it cannot lag the content.
 * 4. **Nothing on iOS WebKit without it.** The JS pass is not merely slower
 *    there, it is structurally late: iOS scrolls off the main thread and
 *    delivers the offset a frame behind, so every card is drawn for a scroll
 *    position the screen has already left. That reads as the column *swimming*
 *    rather than as a low frame rate, and no amount of tuning inside the pass
 *    fixes it — the answer is a flat, honest column until the browser can do
 *    step 3. (`lib/perf-tier.ts` §isIosWebKit for why this is not `perf-lite`.)
 * 5. **Otherwise the JS pass**, which is what every non-iOS browser without
 *    scroll-driven animations has always had.
 */
function resolveRakeMode(reduced: boolean): RakeMode {
  if (reduced || isPerfLite()) return 'off';
  if (supportsViewTimeline()) return 'css';
  if (isIosWebKit()) return 'off';
  return 'js';
}

interface RadialWheelProps {
  items: RadialWheelItem[];
  /** Called (rAF-debounced) when the scroll nears the end — drives lazy loading. */
  onEndReached?: () => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
  /** Short haptic tick each time a new card crosses the focus line. */
  haptics?: boolean;
  /** A leading, non-raked node (e.g. the compose box) pinned above the wheel. */
  lead?: ReactNode;
}

const MAX_TILT = 15; // deg of rake at the edges of the focus band
/**
 * How far back a card at the edge of the band is pushed, in px against the
 * 1500px perspective — which is also the ONLY thing that shrinks it.
 *
 * There used to be a `scale(1 - |t| * 0.12)` in the transform as well, giving a
 * card two independent size terms: a perspective projection AND a flat 2D
 * scale, multiplied. It is gone. A card lying on a cylinder gets smaller
 * because it is further away; expressing that twice was a second, non-physical
 * size change riding along with the first, and every frame of a scroll changed
 * both — on WebKit a continuously changing 2D scale is the case least likely to
 * survive as a cached raster, which is the same trap the globe's element cage
 * fell into (`LiquidGlobe.tsx` §the wireframe cage, where it halved the frame
 * rate of a drag).
 *
 * Raised from 64px so the depth still reads without it: 1500/(1500+150) = 0.91
 * at the band edge, against the 0.84 the two terms used to reach together.
 */
const EDGE_Z = 150;
const FADE_START = 0.62; // |t| where cards begin to dim
const VISIBLE = 2.2; // |t| beyond which a card is off the focus band (flat, no layer)
/**
 * Floor on a raked card's opacity. The fade used to bottom out around 0.18,
 * which is not "de-emphasised", it is unreadable — and any capture taken while
 * a card sat there (a programmatic scroll, a print) kept it as a ghost.
 */
const MIN_OPACITY = 0.4;

/** First index whose value is >= `target`, in a sorted array. */
function lowerBound(values: number[], target: number): number {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The feed as a gently curved column on the **document's own scroll** — no inner
 * scroll container. That is what lets mobile Safari collapse its address/tab bars
 * as you scroll (an inner `overflow:auto` region keeps them pinned and leaves the
 * fixed backdrop showing behind the bottom bar). Cards flow at their natural
 * heights (tall and short RMHarks never overlap), the browser owns the momentum /
 * rubber-band, and a rAF-throttled window-scroll pass rakes each card onto a
 * shallow cylinder by its distance from the viewport centre using cached document
 * offsets (no per-frame layout reads → no thrash). Under reduced-motion the curve
 * is dropped and it is a plain list.
 *
 * …that is the FALLBACK. Where the browser has scroll-driven animations the rake
 * is a stylesheet rule and none of the machinery below runs at all — see
 * {@link resolveRakeMode} for the three-way choice and why iOS WebKit gets a flat
 * column rather than the JS pass.
 */
export function RadialWheel({
  items,
  onEndReached,
  ariaLabel,
  className,
  children,
  haptics = false,
  lead,
}: RadialWheelProps) {
  const reduced = useReducedMotion();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const slotsRef = useRef<HTMLElement[]>([]);
  const centersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);
  /**
   * The slot currently holding the focus line, for the haptic tick. Outlives the
   * observer that sets it — lazy loading rebuilds that observer, and a value
   * scoped to it would make every page append look like a fresh arrival.
   */
  const focusRef = useRef<Element | null>(null);
  /** Per-slot raked/flat flag, so a style is written only when it changes. */
  const stateRef = useRef<Uint8Array>(new Uint8Array(0));
  /** The window of slots raked last pass — the only ones that can need resetting. */
  const bandRef = useRef({ lo: 0, hi: -1 });

  /**
   * Which path draws the rake. Resolved after mount, not during render: it reads
   * `document.documentElement`'s classes and `CSS.supports`, neither of which
   * exists on the server. `'off'` is the honest first value — it renders the
   * plain column the markup describes, and SSR and the first client render agree
   * on it, so nothing is written before the answer is known.
   */
  const [mode, setMode] = useState<RakeMode>('off');
  useEffect(() => setMode(resolveRakeMode(reduced)), [reduced]);

  // Cache each card's document-absolute centre. Transforms shift getBoundingClientRect,
  // so clear them first, measure the true layout position, then the scroll pass
  // reapplies. Rebuilt when the set or any height changes.
  const buildCache = useCallback(() => {
    const track = trackRef.current;
    if (typeof window === 'undefined' || !track) return;
    const els = Array.from(track.querySelectorAll<HTMLElement>('.radial-wheel__slot'));
    slotsRef.current = els;
    for (const el of els) el.style.transform = '';
    const scrollY = window.scrollY;
    centersRef.current = els.map((el) => {
      const r = el.getBoundingClientRect();
      return r.top + scrollY + r.height / 2;
    });
    // The rake's bookkeeping describes the OLD element list, and the transforms
    // it was tracking have just been cleared above — so both are reset here or
    // the next pass would skip a write believing it had already made it.
    stateRef.current = new Uint8Array(els.length);
    bandRef.current = { lo: 0, hi: -1 };
  }, []);

  /**
   * Rake the cards in the focus band onto the cylinder.
   *
   * Two rules keep this affordable, and both were learned the expensive way.
   *
   * **Only touch cards in the band.** This used to walk every slot in the feed
   * on every scroll frame, which is a loop that grows as the feed lazy-loads
   * more pages — and the cards outside the band, which is nearly all of them,
   * still took three style writes each to be told they are still flat. The
   * centres are in document order, so the band is a contiguous window: find it,
   * rake it, and reset only the cards that have just left it (`bandLo/bandHi`
   * remember the last one).
   *
   * **Never write a style that is not changing.** An inline style assignment
   * invalidates the element's computed style whether or not the value differs,
   * and `will-change` is the worst of them — it creates and destroys a
   * compositor layer, and this wrote it on every card on every frame. It now
   * flips exactly twice per card per pass through the band, and the transform
   * and opacity strings are compared before they are assigned.
   */
  const apply = useCallback(() => {
    if (typeof window === 'undefined') return;
    const half = window.innerHeight / 2;
    if (half <= 0) return;
    const viewCenter = window.scrollY + half;
    const els = slotsRef.current;
    const centers = centersRef.current;
    const state = stateRef.current;

    /** Flatten a card that has left the band (or is leaving because of `reduced`). */
    const flatten = (i: number) => {
      if (!state[i]) return;
      state[i] = 0;
      const el = els[i];
      el.style.transform = '';
      el.style.opacity = '';
      el.style.willChange = 'auto';
    };

    // The band, as a window into the (document-ordered) centres. `reduced`
    // collapses it to nothing, which flattens everything and writes no more.
    const reach = VISIBLE * half;
    let lo = 0;
    let hi = -1;
    if (!reduced) {
      lo = lowerBound(centers, viewCenter - reach);
      hi = lowerBound(centers, viewCenter + reach) - 1;
    }

    // Anything that was raked and is no longer in the window goes flat. Only the
    // edges can have changed, so this is a handful of indices, not a sweep.
    for (let i = bandRef.current.lo; i <= bandRef.current.hi; i++) {
      if (i < lo || i > hi) flatten(i);
    }
    bandRef.current = { lo, hi };

    for (let i = lo; i <= hi; i++) {
      const el = els[i];
      if (!el) continue;
      const dy = centers[i] - viewCenter;
      const t = dy / half;
      const at = Math.abs(t);
      if (at > VISIBLE) {
        flatten(i);
        continue;
      }
      const rot = Math.max(-MAX_TILT, Math.min(MAX_TILT, -t * MAX_TILT));
      const tz = -Math.min(at, 1) * EDGE_Z;
      const op = Math.max(
        MIN_OPACITY,
        1 - Math.min(1, Math.max(0, at - FADE_START) / (VISIBLE - FADE_START)) * 0.82,
      );
      // `will-change` on entry only — a layer that is created and thrown away
      // every frame is worse than no layer at all.
      if (!state[i]) {
        state[i] = 1;
        el.style.willChange = 'transform';
      }
      // Per-card perspective() (rather than perspective on a container) keeps the
      // projection self-contained across browsers. Kept byte-identical in shape
      // to the `radial-wheel-rake` keyframes in radial.css, so the two paths
      // cannot drift into drawing subtly different cylinders.
      const transform = `perspective(1500px) translateZ(${tz.toFixed(1)}px) rotateX(${rot.toFixed(2)}deg)`;
      if (transform !== el.style.transform) el.style.transform = transform;
      const opacity = op.toFixed(3);
      if (opacity !== el.style.opacity) el.style.opacity = opacity;
    }
  }, [reduced]);

  const onScroll = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      apply();
    });
  }, [apply]);

  /**
   * Put every slot back the way the stylesheet would have it.
   *
   * Three callers, and the third is the one that makes this a `useCallback`
   * rather than a closure: printing (the page renders as it stands, so a card
   * frozen mid-rake is baked into the output tilted and faded), the print
   * restore's counterpart, and **leaving `js` mode** — a mode flip has to hand
   * the elements back unstyled or the last frame the pass wrote would stay
   * burned into the column with nothing left running to update it.
   */
  const flattenAll = useCallback(() => {
    for (const el of slotsRef.current) {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.willChange = 'auto';
    }
    // `apply` skips writes it believes it has already made, so the state it
    // skips against has to say "flat" after this or the restore is a no-op.
    stateRef.current.fill(0);
    bandRef.current = { lo: 0, hi: -1 };
  }, []);

  // Rebuild + repaint on mount, when the set changes, and on any content resize
  // (late images, reflow) so variable heights always stay correctly spaced.
  //
  // `js` only. This is the O(cards) `getBoundingClientRect()` pass, and a
  // `ResizeObserver` on the track fires it on every late image and every
  // appended page — so on the paths that do not read `centersRef` it must not
  // run at all, rather than run and be ignored.
  useEffect(() => {
    if (mode !== 'js') return;
    buildCache();
    apply();
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      buildCache();
      apply();
    });
    ro.observe(track);
    return () => ro.disconnect();
  }, [mode, buildCache, apply, items.length]);

  // Drive the rake off the document scroll + viewport resize.
  useEffect(() => {
    if (mode !== 'js' || typeof window === 'undefined') return;
    const onResize = () => {
      buildCache();
      apply();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('beforeprint', flattenAll);
    window.addEventListener('afterprint', apply);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('beforeprint', flattenAll);
      window.removeEventListener('afterprint', apply);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      flattenAll();
    };
  }, [mode, onScroll, buildCache, apply, flattenAll]);

  /* ── The haptic tick ──────────────────────────────────────────────────────
     A short buzz each time a card crosses the focus line.

     It used to be computed inside the rake pass, off the cached centres — which
     tied a feature that has nothing to do with the curve to the one path that
     measures the column, and meant the two rake modes that do no measuring
     would have silently lost it. An observer with a zero-height root band at
     the viewport's middle asks the browser the same question directly: it costs
     no scroll listener, no layout read and no per-frame work, and it reports the
     same crossings the distance arithmetic used to.

     Nothing attaches unless the platform can actually vibrate, which is also why
     no iOS device runs any of this — Safari does not implement `navigator.vibrate`
     at all, so the old version was already dead code there. */
  useEffect(() => {
    if (!haptics || reduced || typeof IntersectionObserver === 'undefined') return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    const track = trackRef.current;
    if (!track) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          // Which card holds the focus line, by identity rather than by index:
          // lazy loading appends to the list, so an index means a different card
          // from one page to the next. This is also what absorbs the callback
          // every fresh observer opens with — it re-reports the card already at
          // the centre, which is a re-observation and not a crossing.
          if (e.target === focusRef.current) continue;
          const first = focusRef.current === null;
          focusRef.current = e.target;
          // Never on the first one. Arriving at a feed is not a crossing, and a
          // phone that buzzes as the page settles reads as a notification.
          if (!first) navigator.vibrate(4);
        }
      },
      // -50%/-50% collapses the root to a line across the middle of the
      // viewport: the only slot intersecting it is the one at the focus point.
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 },
    );
    for (const el of track.querySelectorAll<HTMLElement>('.radial-wheel__slot')) io.observe(el);
    return () => io.disconnect();
  }, [haptics, reduced, items.length]);

  // Lazy-load: fire when the sentinel nears the viewport (with headroom).
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !onEndReached) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onEndReached();
      },
      { root: null, rootMargin: '800px 0px' },
    );
    io.observe(sentinel);
    return () => io.disconnect();
  }, [onEndReached]);

  return (
    <div className={cn('radial-wheel', className)} aria-label={ariaLabel} role="feed">
      {lead != null && <div className="radial-wheel__lead">{lead}</div>}
      <div ref={trackRef} className="radial-wheel__track">
        {items.map((item) => (
          <div key={item.id} className="radial-wheel__slot" role="article">
            {item.node}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} className="radial-wheel__sentinel" aria-hidden />
      {children}
    </div>
  );
}
