/**
 * A loadout in a list: title, class, author, a strip of its items, counts, and
 * whatever actions the list wants beside them.
 */
'use client';

import { Link } from '@tanstack/react-router';
import { GitFork, Heart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Pill } from '@/components/tf2-hud/ui';
import type { LoadoutSummary } from '@/lib/tf2-loadout/api-types';
import type { CatalogIndex } from '@/lib/tf2-loadout/use-catalog';
import ItemTile from './ItemTile';
import { CLASS_DEFAULT } from './labels';

const PREVIEW = 8;

export default function LoadoutCard({
  loadout,
  idx,
  actions,
}: {
  loadout: LoadoutSummary;
  idx: CatalogIndex | null;
  actions?: React.ReactNode;
}) {
  const { t } = useTranslation('c-tf2-hud');
  const entries = Object.values(loadout.slots);
  const shown = idx
    ? entries.flatMap((e) => {
        const item = idx.item(e.item);
        return item
          ? [{ item, paint: e.paint !== undefined ? idx.paint(e.paint) : undefined }]
          : [];
      })
    : [];
  return (
    <article className="flex flex-col gap-2 rounded-(--app-radius) border border-(--app-border) bg-(--app-bg-subtle) p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="tf2hud-title min-w-0 truncate text-xl">
          <Link
            to="/tf2/loadout/l/$slug"
            params={{ slug: loadout.slug }}
            className="hover:underline"
          >
            {loadout.title}
          </Link>
        </h3>
        <div className="flex shrink-0 items-center gap-1">
          <Pill tone="accent">
            {t(`class-${loadout.tfClass}`, { defaultValue: CLASS_DEFAULT[loadout.tfClass] })}
          </Pill>
          {loadout.visibility !== 'PUBLIC' ? (
            <Pill tone={loadout.visibility === 'PRIVATE' ? 'warning' : 'info'}>
              {loadout.visibility === 'PRIVATE'
                ? t('private', { defaultValue: 'Private' })
                : t('unlisted', { defaultValue: 'Unlisted' })}
            </Pill>
          ) : null}
        </div>
      </div>
      <p className="text-xs text-(--app-text-dim)">
        {loadout.author
          ? t('by', { defaultValue: 'by {{name}}', name: loadout.author.name })
          : null}
        {loadout.forkOf
          ? ` · ${t('fork-of', { defaultValue: 'fork of {{title}}', title: loadout.forkOf.title })}`
          : null}
      </p>
      {shown.length ? (
        <ul className="grid grid-cols-4 gap-1.5" aria-label={t('items', { defaultValue: 'Items' })}>
          {shown.slice(0, PREVIEW).map(({ item, paint }, i) => (
            <li key={`${item.id}-${i}`}>
              <ItemTile item={item} paint={paint} />
            </li>
          ))}
        </ul>
      ) : null}
      {loadout.description ? (
        <p className="line-clamp-2 text-sm text-(--app-text-muted)">{loadout.description}</p>
      ) : null}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="flex items-center gap-3 text-xs text-(--app-text-muted)">
          <span
            className="inline-flex items-center gap-1"
            title={t('likes', { defaultValue: 'Likes' })}
          >
            <Heart className="size-3.5" aria-hidden />
            {loadout.likeCount}
          </span>
          <span
            className="inline-flex items-center gap-1"
            title={t('forks', { defaultValue: 'Forks' })}
          >
            <GitFork className="size-3.5" aria-hidden />
            {loadout.forkCount}
          </span>
        </span>
        <div className="flex items-center gap-1">{actions}</div>
      </div>
    </article>
  );
}
