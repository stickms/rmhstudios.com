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
 * One spacing grammar for the whole admin area: `px-4 pt-4 pb-12` (the page
 * anatomy in docs/page-consistency.md §2) with sections spaced by
 * `--site-section-gap`. Admin pages used to write `p-4 md:p-8` + `space-y-6`
 * themselves, which stacked 32px of desktop padding on top of the shell's own
 * gutters and drifted page to page.
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
        'mx-auto w-full min-w-0 space-y-[var(--site-section-gap)] px-4 pt-4 pb-12',
        WIDTHS[width],
        className,
      )}
    >
      {children}
    </div>
  );
}
