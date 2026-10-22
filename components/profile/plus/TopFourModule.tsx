'use client';

import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { AppWindow, Gamepad2, Pencil } from 'lucide-react';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { Button } from '@/components/ui/button';
import type { TopFourItem } from '@/lib/profile/modules';
import { resolveTopFour, type TopFourEntry } from '@/lib/profile/top-four';

/** P1 — four pinned favourites, resolved against the live game/app catalogs. */
function Tile({ entry }: { entry: TopFourEntry }) {
  const { t } = useTranslation('f-profile-plus');
  const Icon = entry.kind === 'game' ? Gamepad2 : AppWindow;
  const body = (
    <>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-site-sm bg-site-bg-subtle">
        {entry.imagePath ? (
          <img
            src={entry.imagePath}
            alt=""
            loading="lazy"
            decoding="async"
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-site-text-dim">
            <Icon className="size-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="mt-1.5 min-w-0">
        <p className="truncate text-sm font-semibold text-site-text">{entry.title}</p>
        <p className="text-xs text-site-text-dim">
          {entry.kind === 'game'
            ? t('kind-game', { defaultValue: 'Game' })
            : t('kind-app', { defaultValue: 'App' })}
        </p>
      </div>
    </>
  );
  const cls = 'glass-fill glass-interactive block rounded-site p-2';
  return entry.href.startsWith('/') ? (
    <Link to={entry.href as string} className={cls}>
      {body}
    </Link>
  ) : (
    <a href={entry.href} target="_blank" rel="noopener noreferrer" className={cls}>
      {body}
    </a>
  );
}

export default function TopFourModule({
  title,
  items,
  isOwner,
}: {
  title: string;
  items: readonly TopFourItem[];
  isOwner: boolean;
}) {
  const { t } = useTranslation('f-profile-plus');
  const entries = resolveTopFour(items);
  if (entries.length === 0 && !isOwner) return null;

  return (
    <WidgetFrame
      title={title}
      empty={entries.length === 0}
      emptyTitle={t('top-four-empty', { defaultValue: 'Pin your four favourites' })}
      emptyDescription={t('top-four-empty-desc', {
        defaultValue: 'Pick four games or apps that say the most about you.',
      })}
      emptyAction={
        <Button asChild variant="accent" size="sm">
          <Link to="/settings/profile">
            <Pencil aria-hidden />
            {t('top-four-choose', { defaultValue: 'Choose' })}
          </Link>
        </Button>
      }
      action={
        isOwner && entries.length > 0 ? (
          <Button asChild variant="ghost" size="xs">
            <Link to="/settings/profile">
              <Pencil aria-hidden />
              {t('top-four-edit', { defaultValue: 'Edit' })}
            </Link>
          </Button>
        ) : null
      }
    >
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {entries.map((entry) => (
          <li key={`${entry.kind}:${entry.id}`} className="min-w-0">
            <Tile entry={entry} />
          </li>
        ))}
      </ul>
    </WidgetFrame>
  );
}
