/**
 * Tf2Header — the bar across the top of every TF2 Hub page except the HUD
 * editor's own workspace: a back link, the page title in the TF2 display face,
 * and room for page actions. Flat and square like the editor's TopBar, so the
 * hub, the workshop and the loadout builder all read as one in-game menu.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { useBackTo } from '@/hooks/useBackOrFallback';

export default function Tf2Header({
  title,
  backLabel,
  backHref,
  rightActions,
  heading = true,
}: {
  title: string;
  backLabel: string;
  backHref: string;
  rightActions?: ReactNode;
  /** False when the page has its own visible h1 (a hero): the bar's title is then plain text. */
  heading?: boolean;
}) {
  // The back control names where it goes, so it only steps back when that is the previous page.
  const goBack = useBackTo(backHref);
  return (
    // Phone: [back] [title…] [actions]. From `sm` up the title is centred between them.
    // Inside the safe area (a notch in landscape, the status bar of a home-screen app) via tf2hud-header.
    <header className="tf2hud-header grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 border-b border-(--app-border) bg-(--app-bg-subtle) sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-2">
      <div className="flex min-w-0 items-center">
        <Link
          to={backHref}
          onClick={goBack}
          className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-(--app-radius-sm) px-2 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text) sm:pointer-fine:min-h-8 sm:pointer-fine:min-w-0 sm:justify-start"
        >
          <ArrowLeft className="size-4 shrink-0 rtl-flip" aria-hidden />
          <span className="hidden truncate xs:inline">{backLabel}</span>
          <span className="sr-only xs:hidden">{backLabel}</span>
        </Link>
      </div>
      {/* Always in the document (screen readers need the page's h1 at every width). */}
      {heading ? (
        <h1 className="tf2hud-title min-w-0 truncate text-xl text-(--app-text) sm:px-2 sm:text-2xl">
          {title}
        </h1>
      ) : (
        <p className="tf2hud-title min-w-0 truncate text-xl text-(--app-text) sm:px-2 sm:text-2xl">
          {title}
        </p>
      )}
      <div className="flex min-w-0 items-center justify-end gap-2">{rightActions}</div>
    </header>
  );
}
