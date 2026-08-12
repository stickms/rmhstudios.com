'use client';

import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from '@/hooks/useReducedMotion';

interface AnimatedCountProps {
  /** The target number. `undefined` is treated as 0. */
  value: number | undefined;
  /** Format the (rounded) number for display. Defaults to `String`. */
  format?: (n: number) => string;
  /**
   * Render nothing when the value rounds to 0. Preserves the "hide the count at
   * zero" behavior of the feed/comment engagement bars.
   */
  hideZero?: boolean;
  className?: string;
  /** Tween duration in ms (default 280). */
  durationMs?: number;
}

/**
 * A count that rolls smoothly from its old value to its new one instead of
 * snapping — so an optimistic like/follow reads as "it happened" rather than a
 * jarring flip. Interruptible (a second change mid-roll continues from wherever
 * the number currently is) and snaps instantly under `prefers-reduced-motion`.
 *
 * ## The tween writes to the DOM, not to React state
 *
 * This used to call `setDisplay(current)` inside its `requestAnimationFrame`
 * loop, which is a full React render **per frame**: ~17 renders for one 280 ms
 * roll. That is charged per instance, and the instances are not rare —
 * `EngagementCount` puts four of these on every post in the feed and three on
 * every comment, so one SSE burst updating ten visible posts could queue up to
 * 170 renders of feed subtrees to move some numbers by one.
 *
 * The frames are now written straight to the text node through a ref. React
 * renders once per real value change; the roll in between costs one string
 * assignment per frame and no reconciliation at all.
 *
 * React still owns the final value — the rendered children are `format(target)`
 * — so the two can never disagree once the tween lands, and a parent re-render
 * mid-roll simply snaps to the target rather than corrupting anything.
 *
 * ## Why this is not the CSS `@property` + `counter()` version
 *
 * docs/performance-audit-2026-08-12.md §1.2 proposed animating a registered
 * `<integer>` custom property and rendering it with `counter()`, for zero React
 * involvement. Implementation found two blockers, both fatal here:
 *
 *  1. **`counter()` renders a bare integer.** Most call sites format —
 *     `formatCount` (1.2K / 3.4M) in the feed and user builds,
 *     `toLocaleString()` (thousands separators) on `ProfileHero`'s coin balance
 *     and `ProfileHoverCard`'s follower counts. A CSS counter can render none of
 *     them, so the roll would either drop the formatting or be restricted to the
 *     minority of unformatted call sites.
 *  2. **The visible number would move into a pseudo-element.** `::after`
 *     content is exposed to assistive tech inconsistently, and the views readout
 *     in `RMHarkActions` is a plain `<div>` with no `aria-label`, so its count
 *     text is genuinely read today. Swapping it for generated content trades a
 *     measured render cost for an unmeasured accessibility regression.
 *
 * The DOM write keeps a real text node — so formatting, selection, copy/paste
 * and the accessibility tree are all exactly as before — and still removes
 * every per-frame render, which was the actual finding.
 */
export function AnimatedCount({
  value,
  format = String,
  hideZero = false,
  className,
  durationMs = 280,
}: AnimatedCountProps) {
  const target = value ?? 0;
  const ref = useRef<HTMLSpanElement>(null);
  // The last painted (possibly fractional) value, so an interrupted tween
  // resumes from where the eye currently is rather than jumping.
  const displayRef = useRef(target);
  // `format` is held in a ref, and is deliberately NOT an effect dependency:
  // most call sites pass an inline arrow (`format={(n) => n.toLocaleString()}`),
  // which is a new identity on every parent render. As a dependency that would
  // tear down and restart the tween on every render — the exact thrash this
  // component was rewritten to remove — while the ref keeps the latest function
  // without re-running anything.
  const formatRef = useRef(format);
  formatRef.current = format;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      displayRef.current = target;
      return;
    }
    const from = displayRef.current;
    if (from === target) return;

    let raf = 0;
    let startTs: number | null = null;
    const step = (ts: number) => {
      if (startTs === null) startTs = ts;
      const t = Math.min(1, (ts - startTs) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const current = from + (target - from) * eased;
      displayRef.current = current;
      // The whole point: a text write, not a state update.
      el.textContent = formatRef.current(Math.round(current));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        displayRef.current = target;
        el.textContent = formatRef.current(Math.round(target));
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  if (hideZero && Math.round(target) === 0) return null;
  // React renders the settled value. Frames in between are painted by the effect
  // above; because this is what React believes the content to be, the tween can
  // only ever end in agreement with it.
  return (
    <span ref={ref} className={className}>
      {format(Math.round(target))}
    </span>
  );
}
