'use client';

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { House, Search, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { listCuratedBuilds, type CuratedBuild } from '@/lib/builds/curated';
import { filterRail, groupRail, type LibraryKind } from '@/lib/games/library';
import { useLibraryFavorites } from '@/hooks/useLibraryFavorites';
import { TitleArt } from './TitleArt';

/**
 * The library's left list, the way Steam's is: Home, a search box, a kind filter,
 * then one list under small caps headings — Favorites, Recent, everything else A to
 * Z. The open title is the highlighted row.
 */
export function LibraryList({
  kind,
  onKindChange,
  recentIds,
  activeId,
  onIndex,
}: {
  kind: LibraryKind;
  onKindChange: (k: LibraryKind) => void;
  recentIds: string[];
  activeId: string | null;
  onIndex: boolean;
}) {
  const { t } = useTranslation('games-hub');
  const [search, setSearch] = useState('');
  const { ids: favoriteIds, toggle } = useLibraryFavorites();

  const all = useMemo(() => listCuratedBuilds(), []);
  const visible = useMemo(() => filterRail(all, { kind, search }), [all, kind, search]);
  const favorites = useMemo(() => visible.filter((b) => favoriteIds.includes(b.id)), [visible, favoriteIds]);
  const { recent, rest } = useMemo(
    () =>
      groupRail(
        visible.filter((b) => !favoriteIds.includes(b.id)),
        recentIds,
      ),
    [visible, favoriteIds, recentIds],
  );

  const kinds: { id: LibraryKind; label: string }[] = [
    { id: 'all', label: t('steam-filter-all', { defaultValue: 'All' }) },
    { id: 'game', label: t('steam-filter-games', { defaultValue: 'Games' }) },
    { id: 'app', label: t('steam-filter-apps', { defaultValue: 'Apps' }) },
  ];

  const restLabel =
    kind === 'app'
      ? t('steam-section-apps', { defaultValue: 'Apps' })
      : kind === 'game'
        ? t('steam-section-games', { defaultValue: 'Games' })
        : t('steam-section-all', { defaultValue: 'All' });

  return (
    <nav
      className="stm-side"
      data-hide-on-phone={onIndex ? 'false' : 'true'}
      aria-label={t('steam-list-label', { defaultValue: 'Games and apps' })}
    >
      <div className="stm-side-head">
        <Link to="/games" className="stm-home-row" aria-current={onIndex ? 'page' : undefined}>
          <House aria-hidden />
          {t('steam-library-home', { defaultValue: 'Home' })}
        </Link>
        <label className="stm-search">
          <Search aria-hidden />
          <span className="stm-sr">{t('steam-search', { defaultValue: 'Search games and apps' })}</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('steam-search', { defaultValue: 'Search games and apps' })}
          />
        </label>
        <div className="stm-kinds" role="group" aria-label={t('steam-filter-label', { defaultValue: 'Show' })}>
          {kinds.map((k) => (
            <button key={k.id} type="button" aria-pressed={kind === k.id} onClick={() => onKindChange(k.id)}>
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="stm-list">
        <Section label={t('steam-section-favorites', { defaultValue: 'Favorites' })} items={favorites} {...{ activeId, favoriteIds, toggle }} />
        <Section label={t('steam-section-recent', { defaultValue: 'Recent' })} items={recent} {...{ activeId, favoriteIds, toggle }} />
        <Section label={restLabel} items={rest} {...{ activeId, favoriteIds, toggle }} />
        {visible.length === 0 ? (
          <p className="stm-empty">{t('steam-empty', { defaultValue: 'Nothing matches that search.' })}</p>
        ) : null}
      </div>
    </nav>
  );
}

function Section({
  label,
  items,
  activeId,
  favoriteIds,
  toggle,
}: {
  label: string;
  items: CuratedBuild[];
  activeId: string | null;
  favoriteIds: string[];
  toggle: (id: string) => void;
}) {
  const { t } = useTranslation('games-hub');
  if (items.length === 0) return null;
  return (
    <section>
      <h2>
        {label} ({items.length})
      </h2>
      <ul>
        {items.map((b) => {
          const favorite = favoriteIds.includes(b.id);
          return (
            <li key={b.id} className="stm-row-wrap">
              <Link
                to="/games/$gameId"
                params={{ gameId: b.id }}
                className="stm-row"
                aria-current={b.id === activeId ? 'page' : undefined}
              >
                <TitleArt build={b} width={22} height={22} />
                <span>{b.title}</span>
              </Link>
              <button
                type="button"
                className="stm-fav"
                aria-pressed={favorite}
                aria-label={
                  favorite
                    ? t('steam-unfavorite', { defaultValue: 'Remove {{title}} from favorites', title: b.title })
                    : t('steam-favorite', { defaultValue: 'Add {{title}} to favorites', title: b.title })
                }
                onClick={() => toggle(b.id)}
              >
                <Star aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
