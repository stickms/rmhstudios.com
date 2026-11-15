/**
 * DirectoryItem — one entry in a directory of things to open: a community, a live Space.
 *
 * A tile at the start (an icon, an avatar), a name with an optional tag beside it, an optional line of
 * description, a line of small facts, and optionally a visible action at the end. The whole item is one
 * link, so it is one keyboard stop and one touch target.
 *
 * This is the Communities list item, moved here unchanged so the Spaces list can be the same thing instead
 * of a look-alike (components/CLAUDE.md: a second copy of a card is this repo's most common defect). The
 * classes are exactly what `CommunitiesColumn` wrote inline; anything that should change about how a
 * directory entry looks changes here, for every directory at once.
 *
 * It is a CARD: a 1px border at the site radius, which turns ink on hover (owner, 2026-11-13: "yes cards would
 * be nice", for Communities and Spaces alike). That is a chosen exception to rules-before-boxes (R3) for these
 * two directories, where each entry is a place to enter; it stays flat (no fill at rest, no shadow).
 *
 * `action` is a label, not a second control: an interactive element inside a link is invalid, and the item
 * is already the link. It is drawn as a bordered button so the affordance is visible, and hidden from
 * assistive technology, which reads the link itself. Below 640px it is not drawn: the row is the target and
 * the name needs the width.
 */
import type { CSSProperties, ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The list a set of items sits in. The gutter and gap the Communities list has always used. */
export const DIRECTORY_LIST_CLASS = 'flex flex-col gap-3 px-4 pb-12';

/** The tag beside an item's name (a role, "Live"). */
export function DirectoryTag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-site-bg-subtle px-2 py-0.5 text-xs font-medium text-site-accent">
      {children}
    </span>
  );
}

/** One fact in the meta line: a small icon and a few words. */
export function DirectoryFact({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}</span>;
}

export function DirectoryItem({
  to,
  media,
  mediaStyle,
  title,
  tag,
  description,
  meta,
  action,
}: {
  /** A full router path. */
  to: string;
  /** What fills the 56px tile: an emoji, an icon, an image. */
  media: ReactNode;
  mediaStyle?: CSSProperties;
  title: string;
  tag?: ReactNode;
  description?: ReactNode;
  /** `DirectoryFact`s. */
  meta?: ReactNode;
  /** The words of the visible action at the end ("Join"). */
  action?: ReactNode;
}) {
  return (
    <Link
      to={to as string}
      data-slot="directory-item"
      className="relative flex items-start gap-4 rounded-site border border-site-border p-5 transition-[border-color,background-color] duration-site hover:border-site-text hover:bg-site-surface-hover"
    >
      <div
        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-site text-3xl"
        style={mediaStyle}
      >
        {media}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-base font-semibold text-site-text">{title}</p>
          {tag}
        </div>
        {description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-site-text-muted">{description}</p>
        )}
        {meta && (
          <div className="mt-2 flex items-center gap-4 text-xs text-site-text-muted">{meta}</div>
        )}
      </div>
      {action && (
        <span
          aria-hidden
          className={cn(
            buttonVariants({ variant: 'default' }),
            'hidden self-center sm:inline-flex',
          )}
        >
          {action}
        </span>
      )}
    </Link>
  );
}
