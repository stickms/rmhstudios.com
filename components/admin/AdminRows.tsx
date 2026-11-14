import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The admin area's layout pieces. Every admin page is one of a few shapes (a
 * queue of items, a form above a list, a ledger of numbers) and each used to
 * space itself: a `rounded-site p-5` block here, a `px-4 py-3` there, left over
 * from when those were cards. With the card gone the padding only indented the
 * content past the page title, and nothing separated one item from the next.
 * The grammar now, written on the pages themselves: content sits on the page
 * gutter (`AdminBody` adds no inline padding), a list is `divide-y
 * divide-site-border` with rows of `py-3` or `py-4` (R3), a quoted text hangs
 * from a `border-s-2` rule, and numbers go in `StatGrid` / `StatTile`. This
 * file holds the two pieces that are more than a class list.
 */

/**
 * A titled part of an admin page. The heading is `t-heading`; an optional
 * control sits on the heading's line and drops under it when the line is full.
 */
export function AdminSection({
  title,
  description,
  action,
  className,
  children,
}: {
  /** Already translated. */
  title: ReactNode;
  /** Already translated. */
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        'min-w-0 space-y-3',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h2 className="t-heading min-w-0 text-site-text">
          {
            title
          }
        </h2>
        {
          action
        }
      </div>
      {description ? (
        <p className="t-body max-w-prose text-site-text-muted">
          {
            description
          }
        </p>
      ) : null}
      {
        children
      }
    </section>
  );
}

/**
 * The one place an admin page may scroll sideways: a table too wide for a
 * phone scrolls inside this, to the screen edge, and the page itself never
 * does. The negative margin lets the table use the gutter while it scrolls.
 */
export function AdminScroll({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        '-mx-[var(--site-page-gutter)] overflow-x-auto px-[var(--site-page-gutter)]',
        className,
      )}
    >
      {
        children
      }
    </div>
  );
}
