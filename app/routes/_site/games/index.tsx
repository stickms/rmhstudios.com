/**
 * /games — the public games index.
 *
 * The catalog is browsable inside `/create` (its Games tab), which is where it
 * ended up after `/arcade`, `/leaderboard` and `/builds` were folded in. That
 * is the right home for the *creator* half of that page — the Arcade Pass,
 * Ranked, the party bar — but it left the site with no destination a visitor
 * would guess for "I want to play something", and no indexable index above the
 * 21 `/games/{id}` hub pages.
 *
 * Which is why the sitemap used to advertise `/games` and `/apps` at priority
 * 0.9 with nothing behind them, and why `lib/seo-catalog.ts` had to carry a
 * `GAMES_INDEX_PATH = '/create?tab=games'` constant that every game's JSON-LD
 * breadcrumb walked back through — a URL the sitemap suite correctly refuses to
 * list, because a `?tab=` is a page state and not a page.
 *
 * So this route exists to be that page. It renders the same `CuratedBuildsTab`
 * the Create tab renders, off the same pure `listCuratedBuilds()` catalog, and
 * `/create?tab=games` keeps working for the creator surfaces stacked above it.
 */

import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CuratedBuildsTab } from '@/components/creator-studio/BuildsTab';
import { CatalogTabs } from '@/components/creator-studio/CatalogTabs';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/_site/games/')({
  head: definePage({
    path: '/games',
    title: 'Games | RMH Studios',
    description:
      'Every game made at RMH Studios — party games, puzzles, city builders, racers and multiplayer arenas. Free to play in the browser, no install.',
    jsonLd: () => [
      catalogItemListSchema('game'),
      breadcrumbSchema([{ name: 'Games', path: '/games' }]),
    ],
  }),
  component: GamesIndexPage,
});

function GamesIndexPage() {
  const { t } = useTranslation('site');
  const games = useMemo(() => listCuratedBuilds().filter((b) => b.kind === 'game'), []);

  return (
    <PageLayout
      title={t('games-index-title', { defaultValue: 'Games' })}
      description={t('games-index-subtitle', {
        defaultValue: 'Every game made here. Free, in the browser, nothing to install.',
      })}
      wide
    >
      <CatalogTabs active="/games" />
      <div className="px-4 pb-12">
        <CuratedBuildsTab
          curated={games}
          seed={0}
          searchPlaceholder={t('search-games-placeholder', { defaultValue: 'Search games...' })}
          emptyLabel={t('empty-games', { defaultValue: 'No games match that search.' })}
        />
      </div>
    </PageLayout>
  );
}
