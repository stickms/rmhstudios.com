'use client';

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { Home, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { SearchField } from '@/components/ui/search-field';
import { listCuratedBuilds, type CuratedBuild } from '@/lib/builds/curated';
import { filterRail, groupRail, type LibraryKind } from '@/lib/games/library';
import { useLibraryFavorites } from '@/hooks/useLibraryFavorites';
import { cn } from '@/lib/utils';
import { TitleArt } from './TitleArt';

/**
 * The library's left rail, the way Steam's is: Home, a search and kind filter, then
 * one list — Favorites, Recent, everything else A to Z. One glass pane; the rows are
 * flat on it, the open title is marked quietly.
 */
export function LibraryRail({
  kind,
  onKindChange,
  recentIds,
  activeId,
  onIndex,
  className,
}: {
  kind: LibraryKind;
  onKindChange: (k: LibraryKind) => void;
  recentIds: string[];
  activeId: string | null;
  onIndex: boolean;
  className?: string;
}) {
  const { t } = useTranslation('site');
  const [search, setSearch] = useState('');
  const { ids: favoriteIds, toggle } = useLibraryFavorites();

  const all = useMemo(() => listCuratedBuilds(), []);
  const visible = useMemo(() => filterRail(all, { kind, search }), [all, kind, search]);
  const favorites = useMemo(
    () => visible.filter((b) => favoriteIds.includes(b.id)),
    [visible, favoriteIds],
  );
  const { recent, rest } = useMemo(
    () =>
      groupRail(
        visible.filter((b) => !favoriteIds.includes(b.id)),
        recentIds,
      ),
    [visible, favoriteIds, recentIds],
  );

  const tabs: LiquidTab[] = [
    { id: 'all', label: t('library-filter-all', { defaultValue: 'All' }) },
    { id: 'game', label: t('library-filter-games', { defaultValue: 'Games' }) },
    { id: 'app', label: t('library-filter-apps', { defaultValue: 'Apps' }) },
  ];

  return (
    <nav
      aria-label={t('library-rail-label', { defaultValue: 'Games and apps' })}
      className={cn(
        'glass-pane flex min-h-0 flex-col gap-3 rounded-site p-3',
        'md:sticky md:top-[var(--rad-rail-top)] md:max-h-[calc(100dvh-var(--rad-rail-top)-1rem)]',
        className,
      )}
    >
      <Link
        to="/games"
        aria-current={onIndex ? 'page' : undefined}
        className={cn(rowClass(onIndex), 'hidden md:flex')}
      >
        <Home className="size-4 shrink-0 text-site-text-muted" aria-hidden />
        <span className="font-medium">{t('library-home', { defaultValue: 'Home' })}</span>
      </Link>

      <SearchField
        value={search}
        onValueChange={setSearch}
        placeholder={t('library-search', { defaultValue: 'Search games and apps' })}
        aria-label={t('library-search', { defaultValue: 'Search games and apps' })}
      />
      <LiquidTabs
        tabs={tabs}
        value={kind}
        onChange={(id) => onKindChange(id as LibraryKind)}
        size="sm"
        aria-label={t('library-filter-label', { defaultValue: 'Show' })}
      />

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Section
          label={t('library-section-favorites', { defaultValue: 'Favorites' })}
          items={favorites}
          {...{ activeId, favoriteIds, toggle }}
        />
        <Section
          label={t('library-section-recent', { defaultValue: 'Recent' })}
          items={recent}
          {...{ activeId, favoriteIds, toggle }}
        />
        <Section
          label={
            kind === 'app'
              ? t('library-section-apps', { defaultValue: 'Apps' })
              : kind === 'game'
                ? t('library-section-games', { defaultValue: 'Games' })
                : t('library-section-all', { defaultValue: 'All' })
          }
          items={rest}
          {...{ activeId, favoriteIds, toggle }}
        />
        {visible.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-site-text-muted">
            {t('library-empty', { defaultValue: 'Nothing matches that search.' })}
          </p>
        ) : null}
      </div>
    </nav>
  );
}

function rowClass(active: boolean) {
  return cn(
    'flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-site-sm px-2 py-1.5 text-sm text-site-text',
    'hover:bg-site-surface-hover',
    active && 'bg-site-surface-active',
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
  const { t } = useTranslation('site');
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="site-section-label px-2 pb-1">
        {label} <span className="text-site-text-dim">{items.length}</span>
      </h2>
      <ul>
        {items.map((b) => {
          const active = b.id === activeId;
          const favorite = favoriteIds.includes(b.id);
          return (
            <li key={b.id} className="group flex items-center">
              <Link
                to="/games/$gameId"
                params={{ gameId: b.id }}
                aria-current={active ? 'page' : undefined}
                className={rowClass(active)}
              >
                <TitleArt
                  build={b}
                  width={32}
                  height={32}
                  className="size-8 shrink-0 rounded-site-sm"
                />
                <span className="min-w-0 flex-1 truncate">{b.title}</span>
              </Link>
              <button
                type="button"
                aria-pressed={favorite}
                aria-label={
                  favorite
                    ? t('library-unfavorite', {
                        defaultValue: 'Remove {{title}} from favorites',
                        title: b.title,
                      })
                    : t('library-favorite', {
                        defaultValue: 'Add {{title}} to favorites',
                        title: b.title,
                      })
                }
                onClick={() => toggle(b.id)}
                className={cn(
                  'flex size-11 shrink-0 items-center justify-center rounded-site-sm text-site-text-dim hover:text-site-text',
                  favorite
                    ? 'text-site-accent'
                    : // Revealed on hover where hover exists; always visible (dimmed) on touch,
                      // where an invisible 44px button would toggle favourites by accident.
                      '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100',
                )}
              >
                <Star className={cn('size-4', favorite && 'fill-current')} aria-hidden />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
