import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const WIDTHS = {
  /** Forms and queues read best in a narrow column. */
  narrow: 'max-w-3xl',
  /** The default admin measure: stat grids, lists, panels. */
  default: 'max-w-4xl',
  /** Wide data views (charts, dense tables). */
  wide: 'max-w-6xl',
} as const;

/**
 * The inner column every admin page renders inside `PageLayout`.
 *
 * One spacing grammar for the whole admin area: `pt-4 pb-12` with sections
 * spaced by `--site-section-gap`, and NO inline padding. The shell frame
 * supplies the page gutter and the page title sits on it
 * (docs/page-consistency.md §2), so a `px-*` here indents every admin page a
 * second time: on a 390px phone that was 32px of the column gone before a row
 * added its own.
 */
export function AdminBody({
  width = 'default',
  className,
  children,
}: {
  width?: keyof typeof WIDTHS;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full min-w-0 space-y-[var(--site-section-gap)] pt-4 pb-12',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
