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
import { useBackOrFallback } from '@/hooks/useBackOrFallback';

export default function Tf2Header({
  title,
  backLabel,
  backHref,
  rightActions,
}: {
  title: string;
  backLabel: string;
  backHref: string;
  rightActions?: ReactNode;
}) {
  const goBack = useBackOrFallback();
  return (
    <header className="grid h-14 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-(--app-border) bg-(--app-bg-subtle) px-3 sm:px-4">
      <div className="flex min-w-0 items-center">
        <Link
          to={backHref}
          onClick={goBack}
          className="flex items-center gap-1.5 rounded-(--app-radius-sm) px-2 py-1 text-sm font-medium text-(--app-text-muted) hover:text-(--app-text)"
        >
          <ArrowLeft className="size-4 shrink-0 rtl-flip" aria-hidden />
          <span className="hidden truncate xs:inline">{backLabel}</span>
          <span className="sr-only xs:hidden">{backLabel}</span>
        </Link>
      </div>
      <h1 className="tf2hud-title hidden truncate px-2 text-2xl text-(--app-text) sm:block">
        {title}
      </h1>
      <div className="flex min-w-0 items-center justify-end gap-2">{rightActions}</div>
    </header>
  );
}
