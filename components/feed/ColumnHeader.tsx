'use client';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { MobileMenuButton } from './MobileMenuButton';

type ColumnHeaderProps = {
  /** Heading text. Omit for a header that is entirely custom (see `children`). */
  title?: ReactNode;
  /** Accent-coloured glyph before the title. */
  icon?: LucideIcon;
  /** Right-aligned controls (buttons, badges, counters). */
  actions?: ReactNode;
  /**
   * Custom content in place of the icon/title pair — e.g. SearchColumn's input.
   * Stretches to fill the row. The menu button and `actions` still bracket it.
   */
  children?: ReactNode;
  /**
   * Sticks to the top of the column. Default true; pass false when the column is
   * embedded as a tab inside another page, where a second sticky bar would stack.
   */
  sticky?: boolean;
  /**
   * Escape hatch for columns rendered as a tab inside another page, which
   * already have a page header carrying the drawer button — a second one would
   * be a duplicate control. Page-level headers should never set this.
   */
  showMenuButton?: boolean;
  className?: string;
};

/**
 * The standard header for a feed "column" page (Communities, Notifications,
 * Bookmarks, …).
 *
 * Exists because the mobile hamburger is opt-in per page, not rendered by the
 * `_site` layout: pages that bypassed PageLayout and hand-rolled a `<header>`
 * silently shipped without any way to open the drawer on mobile. Routing every
 * column header through here makes MobileMenuButton structural rather than
 * something each page has to remember.
 *
 * MobileMenuButton is itself `md:hidden`, so on desktop this renders exactly the
 * icon/title/actions row it always did.
 */
export function ColumnHeader({
  title,
  icon: Icon,
  actions,
  children,
  sticky = true,
  showMenuButton = true,
  className,
}: ColumnHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-center gap-2 border-b border-site-border px-4 py-3',
        sticky && 'sticky top-0 z-10 glass-chrome',
        className,
      )}
    >
      {showMenuButton && <MobileMenuButton />}
      {Icon && <Icon className="h-5 w-5 shrink-0 text-site-accent" aria-hidden />}
      {/* min-w-0 + truncate because several callers pass user-supplied text
          (a tag name, a creator's display name) that would otherwise push the
          actions off the row instead of ellipsing. */}
      {title && <h1 className="min-w-0 truncate text-lg font-bold text-site-text">{title}</h1>}
      {children && <div className="min-w-0 flex-1">{children}</div>}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
