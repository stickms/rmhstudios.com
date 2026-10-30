'use client';

import { useMemo } from 'react';
import { Link, getRouteApi } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { filterRail, groupRail } from '@/lib/games/library';
import { TitleArt } from './TitleArt';

const layoutApi = getRouteApi('/games/_library');

const SHELF_SIZE = 8;

/**
 * Home, as Steam's Library opens: a "Recent Games" shelf of cover art, then "All
 * Games" as a grid of the whole catalog.
 */
export function LibraryHomePage() {
  const { t } = useTranslation('games-hub');
  const { recentIds } = layoutApi.useLoaderData();
  const { kind = 'all' } = layoutApi.useSearch();

  const { recent, all } = useMemo(() => {
    const items = filterRail(listCuratedBuilds(), { kind, search: '' });
    const { recent: r, rest } = groupRail(items, recentIds);
    return { recent: r.slice(0, SHELF_SIZE), all: [...r, ...rest].sort((a, b) => a.title.localeCompare(b.title)) };
  }, [kind, recentIds]);

  return (
    <div>
      <h1 className="stm-sr">{t('steam-home-title', { defaultValue: 'Games and apps' })}</h1>

      {recent.length > 0 ? (
        <section aria-labelledby="stm-recent">
          <h2 id="stm-recent" className="stm-shelf-head">
            {t('steam-recent-games', { defaultValue: 'Recent Games' })}
            <ChevronDown aria-hidden size={14} />
          </h2>
          <Capsules items={recent} />
        </section>
      ) : null}

      <section aria-labelledby="stm-all">
        <h2 id="stm-all" className="stm-shelf-head">
          {kind === 'app'
            ? t('steam-all-apps', { defaultValue: 'All Apps' })
            : kind === 'game'
              ? t('steam-all-games', { defaultValue: 'All Games' })
              : t('steam-all-titles', { defaultValue: 'All Games & Apps' })}
          <span className="stm-count">({all.length})</span>
          <span className="stm-count" style={{ marginInlineStart: 'auto' }}>
            {t('steam-sort-az', { defaultValue: 'Sorted A to Z' })}
          </span>
        </h2>
        <Capsules items={all} />
      </section>
    </div>
  );
}

function Capsules({ items }: { items: ReturnType<typeof listCuratedBuilds> }) {
  return (
    <ul className="stm-capsules">
      {items.map((b) => (
        <li key={b.id}>
          <Link to="/games/$gameId" params={{ gameId: b.id }} className="stm-capsule">
            <TitleArt build={b} width={240} height={360} />
            <span className="stm-capsule-name">{b.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
