'use client';

/**
 * The restaurant's motion vocabulary — three pieces, and deliberately no more.
 *
 * A Scandinavian room does not animate; the light in it changes. So nothing
 * here bounces, overshoots, slides in from a side, or arrives faster than the
 * eye can follow it being still. Everything is the same gesture at different
 * amplitudes: a surface that was slightly below and slightly transparent
 * settles into place on one long decelerating curve, the one in `--rebar-ease`.
 *
 * Why these are components rather than a `variants` object each section
 * imports: the page has five sections built by hand, and the failure mode of a
 * hand-built page is that section three picks 0.4s and section four picks 0.5s
 * and the scroll reads as two different hands. A component cannot drift.
 *
 * Reduced motion is not handled here on purpose. `Providers.tsx` mounts
 * `<MotionConfig reducedMotion="user">`, which strips transform and layout
 * animation from every framer-motion element in the tree while leaving opacity
 * alone — so these fade and do not travel, which is the correct reading of the
 * preference rather than a second code path that has to be kept in step.
 */

import { m as motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The page's one curve and one duration, in framer-motion's units.
 *
 * These mirror `--rebar-ease` / `--rebar-dur` in `globals.css` rather than
 * importing `lib/motion.ts`: the site's `DURATION.base` is 0.16s, tuned for UI
 * that answers a click, and a 0.16s reveal on a 900px-tall section reads as a
 * flicker. This page is read, not operated, so it gets a slower hand — and
 * keeping that decision beside the CSS token it matches is what stops the two
 * drifting apart.
 */
const REBAR_EASE = [0.16, 1, 0.3, 1] as const;
const REBAR_DUR = 0.62;

/** How far a revealing surface starts below where it lands. */
const RISE_PX = 20;

/**
 * A block that settles as it scrolls into view, once.
 *
 * `once: true` matters more than it looks: a reveal that replays every time the
 * section re-enters turns a scroll back up the page into a light show, and on a
 * menu the reader is scrolling back up precisely because they want to re-read
 * something.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as = 'div',
}: {
  children: ReactNode;
  /** Seconds. Use `stagger()` below rather than hand-picking these. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'tr';
}) {
  const Tag = motion[as];
  return (
    <Tag
      initial={{ opacity: 0, y: RISE_PX }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '0px 0px -12% 0px' }}
      transition={{ duration: REBAR_DUR, ease: REBAR_EASE, delay }}
      className={className}
    >
      {children}
    </Tag>
  );
}

/**
 * Delay for the nth item in a run, capped.
 *
 * Uncapped stagger is the classic reveal bug: nine courses at 90ms each means
 * the last one starts 0.8s after the first, so a reader who scrolls at any
 * speed watches rows arrive after they have already read past them. The cap
 * means a long list front-loads its rhythm and then catches up.
 */
export function stagger(index: number, step = 0.055, max = 0.33): number {
  return Math.min(index * step, max);
}

/**
 * A hairline that draws itself left-to-right as it comes into view.
 *
 * The rules are the page's structure — there are no cards, so a line is how a
 * section announces that it has started. Drawing rather than fading gives the
 * eye a direction to follow into the heading beneath it, and it is a `scaleX`
 * on a full-width element, never an animated `width`, so it never reflows.
 */
export function DrawnRule({ className, delay = 0 }: { className?: string; delay?: number }) {
  return (
    <motion.div
      aria-hidden
      initial={{ scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
      transition={{ duration: 0.8, ease: REBAR_EASE, delay }}
      className={cn('h-px w-full origin-left bg-rebar-line-strong', className)}
    />
  );
}

/**
 * Cross-fade for content that swaps in place (the selected course).
 *
 * Exported as variants rather than a component because the consumer needs to
 * own the `AnimatePresence` key — it is the course id, and only the menu knows
 * that.
 */
export const swapVariants: Variants = {
  enter: { opacity: 0, y: 12 },
  center: { opacity: 1, y: 0, transition: { duration: 0.42, ease: REBAR_EASE } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: REBAR_EASE } },
};
