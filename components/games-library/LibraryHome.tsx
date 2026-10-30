'use client';

import { useMemo } from 'react';
import { Link, getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArcadeSection } from '@/components/creator-studio/ArcadeSection';
import type { ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { CreatorStudioStyles } from '@/components/creator-studio/CreatorStudioStyles';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import { PartyBar } from '@/components/party/PartyBar';
import { DeferOnNavigate } from '@/components/ui/defer-on-navigate';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { groupRail } from '@/lib/games/library';
import { TitleArt } from './TitleArt';

const layoutApi = getRouteApi('/_site/games');

const SHELF_SIZE = 8;

/**
 * The library's Home: a shelf of what you played last (or, with no history, the
 * start of the catalog), then the player surfaces that used to live on the grid —
 * the party bar, the Ranked summary and the Arcade Pass.
 */
export function LibraryHome({
  sub,
  deferArcade,
  onSubChange,
}: {
  sub: ArcadeSubTab;
  deferArcade: boolean;
  onSubChange: (next: ArcadeSubTab) => void;
}) {
  const { t } = useTranslation('site');
  const { recentIds } = layoutApi.useLoaderData();
  const shelf = useMemo(() => {
    const all = listCuratedBuilds();
    const { recent, rest } = groupRail(all, recentIds);
    return { recent: recent.slice(0, SHELF_SIZE), featured: rest.slice(0, SHELF_SIZE) };
  }, [recentIds]);
  const items = shelf.recent.length > 0 ? shelf.recent : shelf.featured;

  return (
    <div className="min-w-0 space-y-6">
      <CreatorStudioStyles />
      <header>
        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-site-text">
          {t('games-index-title', { defaultValue: 'Games' })}
        </h1>
        <p className="mt-1 text-sm text-site-text-muted">
          {t('games-index-subtitle', {
            defaultValue: 'Every game made here. Free, in the browser, nothing to install.',
          })}
        </p>
      </header>

      <section aria-labelledby="library-shelf">
        <h2 id="library-shelf" className="site-section-label pb-2">
          {shelf.recent.length > 0
            ? t('library-shelf-recent', { defaultValue: 'Recent' })
            : t('library-shelf-start', { defaultValue: 'Start here' })}
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((b) => (
            <li key={b.id}>
              <Link
                to="/games/$gameId"
                params={{ gameId: b.id }}
                className="glass-fill glass-interactive flex h-full flex-col gap-2 rounded-site p-2"
              >
                <TitleArt
                  build={b}
                  width={240}
                  height={320}
                  className="aspect-[3/4] w-full rounded-site-sm"
                />
                <span className="truncate px-1 pb-1 text-sm font-medium text-site-text">
                  {b.title}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-col gap-3">
        <PartyBar inline />
        <RankedSummary />
      </div>

      {/* Below the shelf; built after the top of the page has painted on a page
          switch. A `?sub=` deep link is the one arrival that is ABOUT this panel,
          so it renders straight away there. */}
      <DeferOnNavigate enabled={deferArcade} minHeight="40vh">
        <ArcadeSection sub={sub} onSubChange={onSubChange} />
      </DeferOnNavigate>
    </div>
  );
}
