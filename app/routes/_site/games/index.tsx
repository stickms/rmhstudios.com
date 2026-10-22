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
 * So this route exists to be that page. It renders `CuratedBuildsTab` off the
 * pure `listCuratedBuilds()` catalog.
 *
 * It is now also where the *player* surfaces live — the party bar, the Ranked
 * summary and the Arcade Pass. They came over when Create's Games tab was
 * removed; `/create?tab=games`, `/arcade`, `/leaderboard` and `/builds` all
 * redirect here, so this page answers for every path that used to reach them.
 */

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { CuratedBuildsTab } from '@/components/creator-studio/BuildsTab';
import { CatalogTabs } from '@/components/creator-studio/CatalogTabs';
import { PartyBar } from '@/components/party/PartyBar';
import { RankedSummary } from '@/components/creator-studio/RankedSummary';
import { CreatorStudioStyles } from '@/components/creator-studio/CreatorStudioStyles';
import { ArcadeSection } from '@/components/creator-studio/ArcadeSection';
import { DeferOnNavigate } from '@/components/ui/defer-on-navigate';
// Read by `validateSearch` (the route definition, which is in every page's
// entry) — so it comes from the UI-free module, not ArcadeSection. See
// components/creator-studio/arcade-tabs.ts.
import { ARCADE_SUB_TABS, type ArcadeSubTab } from '@/components/creator-studio/arcade-tabs';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { definePage } from '@/lib/route/define-page';
import { breadcrumbSchema } from '@/lib/schema';
import { catalogItemListSchema } from '@/lib/seo-catalog';

export const Route = createFileRoute('/_site/games/')({
  // `?sub=` is the Arcade block's sub-tab, mirrored into the URL rather than
  // held locally so `/leaderboard` can deep-link the board even when the viewer
  // is already on this page and it never remounts.
  validateSearch: (search: Record<string, unknown>): { sub?: ArcadeSubTab } =>
    ARCADE_SUB_TABS.includes(search.sub as ArcadeSubTab) ? { sub: search.sub as ArcadeSubTab } : {},
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
  const search = Route.useSearch();
  const { sub = 'challenges' } = search;
  const navigate = useNavigate();
  const games = useMemo(() => listCuratedBuilds().filter((b) => b.kind === 'game'), []);

  const setArcadeSub = useCallback(
    (next: ArcadeSubTab) => {
      void navigate({ to: '/games', search: { sub: next }, replace: true });
    },
    [navigate],
  );

  return (
    <>
      <CreatorStudioStyles />
      <PageLayout
        title={t('games-index-title', { defaultValue: 'Games' })}
        description={t('games-index-subtitle', {
          defaultValue: 'Every game made here. Free, in the browser, nothing to install.',
        })}
        wide
      >
        <CatalogTabs active="/games" />
        {/* The player half, moved off `/create` when its Games tab was removed.
            Only the two COMPACT surfaces sit above the catalog — the party bar
            (null with no session) and the one-line Ranked summary. The Arcade
            Pass comes after the games: signed out it is a full panel with its
            own tab strip and a "sign in to play" block, and above the catalog
            it pushed every game below the fold on a "browse the games" page
            (UI minimalism audit, 2026-10-09). */}
        <div className="flex flex-col gap-4 px-4 pt-2">
          <PartyBar inline />
          <RankedSummary />
        </div>
        <div className="px-4">
          <CuratedBuildsTab
            curated={games}
            seed={0}
            searchPlaceholder={t('search-games-placeholder', { defaultValue: 'Search games...' })}
            emptyLabel={t('empty-games', { defaultValue: 'No games match that search.' })}
          />
        </div>
        <div className="px-4 pt-6 pb-12">
          {/* Below the whole catalog; built after the top of the page has
              painted on a page switch (it carries its own tab strip and
              panels). A `?sub=` deep link is the one arrival that is ABOUT
              this panel, so it renders straight away there. */}
          <DeferOnNavigate enabled={!search.sub} minHeight="40vh">
            <ArcadeSection sub={sub} onSubChange={setArcadeSub} />
          </DeferOnNavigate>
        </div>
      </PageLayout>
    </>
  );
}
