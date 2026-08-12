/**
 * RevealGroup — a staggered container. Children scroll into view one after
 * another.
 *
 * Like `Reveal`, this was a framer-motion node (`whileInView` + `variants` +
 * `staggerChildren`) and is now a class. `.u-reveal-group` in globals.css runs
 * each child on the `view()` timeline and assigns its stagger by `nth-child`, so
 * the cascade costs zero JavaScript and zero per-frame main-thread work.
 *
 * The stagger is expressed as a scroll-RANGE shift rather than a delay, because
 * a scroll timeline has no clock for `animation-delay` to delay against — see
 * the `.u-reveal-group` block in globals.css.
 *
 * Assigning the stagger in CSS rather than from an index prop is deliberate:
 * `RevealItem` never has to know its position, so conditional children
 * (`{isAdmin && <RevealItem/>}`) cannot desynchronise the cascade the way a
 * hand-threaded index does.
 *
 * See docs/performance-audit-2026-08-12.md §1.1.
 */
import type { ElementType, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface RevealGroupProps {
  /**
   * Formerly the gap between each child's start, in seconds. The cascade is now
   * fixed in CSS (`nth-child` range shifts), so this is accepted and ignored
   * rather than removed — it keeps the existing call sites compiling.
   *
   * @deprecated No effect. See `.u-reveal-group` in globals.css.
   */
  stagger?: number;
  /** Shift before the first child enters, in seconds. */
  delay?: number;
  className?: string;
  as?: ElementType;
  children?: ReactNode;
}

export interface RevealItemProps {
  className?: string;
  as?: ElementType;
  children?: ReactNode;
}

/**
 * A single staggered child. Its animation comes from the parent's
 * `.u-reveal-group > *` rule, so it needs no class and no props beyond content.
 */
export function RevealItem({ as = 'div', className, children }: RevealItemProps) {
  const Tag = as as 'div';
  return <Tag className={className}>{children}</Tag>;
}

export function RevealGroup({ delay = 0, className, as = 'div', children }: RevealGroupProps) {
  // See Reveal: a bare `ElementType` types its props as `never`.
  const Tag = as as 'div';
  // Seconds → range shift, matching Reveal's conversion.
  const shift = delay > 0 ? Math.min(25, Math.round((delay / 0.06) * 5)) : undefined;

  return (
    <Tag
      // See Reveal: `data-reveal` feeds the `noscript` rule in __root.tsx.
      data-reveal=""
      className={cn('u-reveal-group', className)}
      style={shift !== undefined ? ({ '--u-reveal-shift': `${shift}%` } as never) : undefined}
    >
      {children}
    </Tag>
  );
}
