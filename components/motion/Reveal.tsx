/**
 * Feed / motion performance rules (read before adding animation to any list):
 *
 * - Animate transform/opacity ONLY. Never animate height/width/top/left — that
 *   thrashes layout on every frame.
 * - Do NOT wrap every FeedItem in Reveal. `.feed-card-cv` (content-visibility)
 *   plus the `feed-item-enter` CSS animation already handle feed entrance.
 *   Reveal is for section-level content and at most the first screen of a
 *   static list.
 * - ScrollScene is forbidden inside infinite-scroll columns.
 * - Don't double-animate elements already animated by the `.page-root > *`
 *   page-enter CSS. Apply Reveal one level deeper than route roots.
 */
import type { CSSProperties, ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RevealProps {
  /** Element/tag to render (defaults to a div). */
  as?: ElementType;
  /**
   * Stagger, in seconds, kept for source compatibility with the 34 call sites
   * written against the framer version. It is converted to a scroll-range shift
   * (see below) — on a scroll timeline there is no clock to delay against.
   */
  delay?: number;
  /** Starting vertical offset in px (rises to 0). Defaults to the site curve. */
  y?: number;
  /**
   * Formerly the tween duration in seconds. A scroll-driven reveal is paced by
   * the scroller, not by a clock, so this is accepted and ignored rather than
   * removed — dropping it would be a 34-file diff for no behavioural gain.
   *
   * @deprecated No effect. Pacing comes from `animation-range` in globals.css.
   */
  duration?: number;
  className?: string;
  children?: ReactNode;
}

/**
 * Scroll-triggered reveal wrapper. Fades + rises its children into view once, as
 * they scroll in.
 *
 * ## This used to be framer-motion, and the change is the point
 *
 * It was a `motion` node with `whileInView`, which means an IntersectionObserver
 * per element plus a `requestAnimationFrame` callback per frame per element,
 * driving `opacity`/`y` from JavaScript on the main thread. It is used in 34
 * places including 19 feed columns — so the site's hottest surface ran a fistful
 * of concurrent JS tweens during the one gesture (the first scroll) with the
 * least frame budget to spare.
 *
 * It is now a class. `.u-reveal` (globals.css) is `animation-timeline: view()`:
 * the compositor drives it off the scroller, there is no observer, no rAF, no
 * per-frame main-thread work, and no framer-motion in the module graph.
 *
 * ## Why the watchdog is gone rather than ported
 *
 * The old version shipped `useRevealWatchdog`, a 1.5s deadline that forced
 * content visible if the observer never fired — because the hidden state was an
 * inline `opacity: 0` applied unconditionally at SSR, so print, full-page
 * capture, reader mode and a stuck observer all rendered blank sections
 * (AUD-006: /pricing's plan grid, ~4,700px of /rmh-capital).
 *
 * The CSS hidden state exists ONLY inside `@supports (animation-timeline: view())`
 * and `@media not (prefers-reduced-motion: reduce)`. An engine that cannot run
 * the animation never applied the hidden state, so there is nothing to rescue.
 * The failure mode the watchdog guarded is structurally absent, which is a
 * better guarantee than a timer.
 *
 * `data-reveal` is kept: the `noscript` rule in `app/routes/__root.tsx` keys on
 * it, and it is a useful marker for anything auditing reveal surfaces.
 *
 * See docs/performance-audit-2026-08-12.md §1.1.
 */
export function Reveal({ as = 'div', delay = 0, y, className, children }: RevealProps) {
  // Cast for the same reason the framer version cast `motion[as]`: a bare
  // `ElementType` resolves its props to `never`, so JSX rejects every attribute.
  // Pinning it to an intrinsic tag gives the element the ordinary DOM prop set.
  const Tag = as as 'div';
  // Seconds → scroll-range shift. The framer default stagger was ~0.06–0.12s
  // between siblings; 0.06s ≈ one 5% step reads the same on a scroller.
  const shift = delay > 0 ? Math.min(25, Math.round((delay / 0.06) * 5)) : undefined;

  const style: CSSProperties = {};
  if (y !== undefined) (style as Record<string, string>)['--u-reveal-y'] = `${y}px`;
  if (shift !== undefined) (style as Record<string, string>)['--u-reveal-shift'] = `${shift}%`;

  return (
    <Tag
      data-reveal=""
      className={cn('u-reveal', className)}
      style={Object.keys(style).length ? style : undefined}
    >
      {children}
    </Tag>
  );
}
