'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type ColumnHeaderProps = {
  /** Heading text. Omit for a header that is entirely custom (see `children`). */
  title?: ReactNode;
  /** Accent-coloured glyph before the title. */
  icon?: LucideIcon;
  /** Right-aligned controls (buttons, badges, counters). */
  actions?: ReactNode;
  /**
   * Custom content in place of the icon/title pair — e.g. SearchColumn's input.
   * Stretches to fill the row, with `actions`after it.
   */
  children?: ReactNode;
  /**
   * Sticks to the top of the column. Default true; pass false when the column is
   * embedded as a tab inside another page, where a second sticky bar would stack.
   */
  sticky?: boolean;
  /**
   * Heading level for `title`. Default 'h1'. Pass 'h2' when the column is
   * embedded in a page that already renders its own h1 — several routes stack a
   * desktop-only title capsule above a column and shipped two h1s at md+ (and
   * one at smaller widths), so the outline changed with the viewport.
   */
  headingLevel?: 'h1' | 'h2';
  className?: string;
};

/**
 * The standard header for a feed"column"page (Communities, Notifications,
 * Bookmarks, …) — one consistent icon/title/actions row.
 *
 * It used to also render the mobile hamburger that opened the push drawer. The
 * radial redesign replaced that drawer with the RMH hub orb, which the shell
 * renders on every page, so the per-header button is gone: it had nothing left
 * to open and did nothing when tapped.
 */
export function ColumnHeader({
  title,
  icon: Icon,
  actions,
  children,
  sticky = true,
  headingLevel = 'h1',
  className,
}: ColumnHeaderProps) {
  const Heading = headingLevel;

  // The PAGE title. When this header is the page's h1 (a `PageFrame` route —
  // Bookmarks, Drafts, Ranked, Help, a tag page, Flashcards …) it renders in
  // exactly the markup and classes `PageLayout` uses: flat display type on the
  // backdrop, actions in the header's action slot, no glyph. It used to be a
  // small icon + text-2xl title in a glass capsule, so ~25 routes titled
  // themselves in a different face, size and container from the ~90
  // `PageLayout` routes beside them — the most visible of the "different
  // styles" the 2026-10-09 consistency audit found. Embedded h2 headers and
  // headers with custom content (a search field) keep the compact row below.
  if (title && !children && headingLevel === 'h1') {
    return (
      <header data-slot="page-header" className={cn('page-heading', className)}>
        <div className="page-heading__content">
          <div className="min-w-0">
            <h1 className="site-display-3">
              <span className="min-w-0 truncate">{title}</span>
            </h1>
          </div>
          {actions && <div data-slot="page-header-action">{actions}</div>}
        </div>
      </header>
    );
  }

  return (
    <header
      className={cn(
        // `flex-wrap`: with two labelled actions the title was the only
        // shrinkable item in the row, so at 390px it truncated to "Flash…"
        // while its actions kept full width. Wrapping lets the heading keep its
        // line and pushes the actions to a second row when the space runs out —
        // better than either an unreadable title or unlabelled glyph buttons.
        'flex flex-wrap items-center gap-2 px-4 py-3',
        // Sticky column headers float as L3 `.glass-chrome` capsules inset from the
        // column edges (§8.2); embedded (sticky={false}) headers stay inline with
        // a hairline divider. The optics-ring glint comes free from `.glass-chrome`.
        sticky
          ? 'glass-chrome site-sticky-chrome'
          : 'border-b border-site-border',
        className,
      )}
    >
      {Icon && <Icon className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />}
      {/* min-w-0 + truncate because several callers pass user-supplied text
 (a tag name, a creator's display name) that would otherwise push the
 actions off the row instead of ellipsing. */}
      {title && (
        <Heading className="min-w-0 truncate font-display text-xl font-bold tracking-tight text-site-text sm:text-2xl">
          {title}
        </Heading>
      )}
      {children && <div className="min-w-0 flex-1">{children}</div>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
