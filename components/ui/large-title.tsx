'use client';

/**
 * LargeTitle — the iOS large-title navigation bar.
 *
 * On iOS a page opens with its title set large in the content, and as you
 * scroll the title shrinks and slides up into the nav bar while the bar's
 * material fades in behind it. Apple calls the second half of that the
 * *scroll edge effect*: the bar is transparent when the content is at rest at
 * the top, and only materialises once content passes under it, so chrome is
 * spent exactly when it is needed to separate layers and never before.
 *
 * Two details make it read as native rather than as a CSS scroll animation:
 *
 *   1. **It is driven by a scroll MotionValue, not a class toggle.** Every
 *      frame maps scroll position continuously onto scale/opacity/translation,
 *      so the title tracks the finger 1:1 and reverses mid-gesture. A
 *      threshold-triggered CSS transition instead pops between two states and
 *      always lags the gesture by its own duration.
 *   2. **Nothing animates layout.** Scale and translate only, on the compositor,
 *      so the collapse costs no layout work while the list beneath it scrolls.
 *
 * Reduced motion collapses this to a plain static title with a permanent bar,
 * which is the correct non-animated equivalent — the information is the same.
 */
import { useRef, type ReactNode } from 'react';
import { m as motion, useScroll, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/utils';

export interface LargeTitleProps {
  title: string;
  /** Small mono line above the large title (section/eyebrow). */
  eyebrow?: string;
  /** Trailing controls — icon buttons, per Apple's toolbar convention. */
  actions?: ReactNode;
  /** Leading control, typically a back affordance. */
  leading?: ReactNode;
  /** Scroll distance (px) over which the title fully collapses. */
  distance?: number;
  className?: string;
}

export function LargeTitle({
  title,
  eyebrow,
  actions,
  leading,
  distance = 72,
  className,
}: LargeTitleProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();

  // Document scroll, not an element scroll: `_site` pages scroll the document
  // (so mobile Safari can collapse its own toolbars), which is also what lets
  // this bar stay `position: sticky` without owning a scroll container.
  const { scrollY } = useScroll();

  const range: [number, number] = [0, distance];

  // The large title shrinks toward the bar and fades as it goes.
  const largeScale = useTransform(scrollY, range, [1, 0.82]);
  const largeOpacity = useTransform(scrollY, range, [1, 0]);
  const largeY = useTransform(scrollY, range, [0, -12]);

  // The compact title arrives only in the last third, so the two never read as
  // two titles at once.
  const compactOpacity = useTransform(scrollY, [distance * 0.6, distance], [0, 1]);
  const compactY = useTransform(scrollY, [distance * 0.6, distance], [8, 0]);

  // The scroll-edge material: transparent at rest, glass once content is under.
  const barOpacity = useTransform(scrollY, [0, distance * 0.5], [0, 1]);

  if (reduced) {
    return (
      <header className={cn('px-4 pb-3 pt-4 sm:px-6', className)}>
        <div className="flex items-center gap-2">
          {leading}
          <div className="min-w-0 flex-1">
            {eyebrow && (
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-site-text-muted">
                {eyebrow}
              </p>
            )}
            <h1 className="truncate font-display text-3xl font-semibold tracking-[-0.022em] text-site-text">
              {title}
            </h1>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      {/* Sticky bar: holds the compact title + controls, and owns the material. */}
      <div className="sticky top-0 z-20">
        <motion.div
          aria-hidden
          className="glass-chrome absolute inset-0 border-b border-site-border"
          style={{ opacity: barOpacity }}
        />
        <div className="relative flex h-14 items-center gap-2 px-4 sm:px-6">
          {leading}
          <motion.h1
            className="min-w-0 flex-1 truncate text-center font-display text-base font-semibold text-site-text"
            style={{ opacity: compactOpacity, y: compactY }}
          >
            {title}
          </motion.h1>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      </div>

      {/* The large title itself, in the content, collapsing as it scrolls away. */}
      <motion.div
        className="origin-left px-4 pb-2 sm:px-6"
        style={{ scale: largeScale, opacity: largeOpacity, y: largeY }}
      >
        {eyebrow && (
          <p className="font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-site-text-muted">
            {eyebrow}
          </p>
        )}
        <p
          aria-hidden
          className="font-display text-[2.125rem] font-semibold leading-tight tracking-[-0.024em] text-site-text"
        >
          {title}
        </p>
      </motion.div>
    </div>
  );
}
