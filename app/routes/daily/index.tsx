// app/routes/daily/index.tsx — the Daily hub: today's puzzles, the daily arcade
// mutator and the member-made Connections grids.
//
// `/daily-mutator` and `/connections` were separate pages that nothing linked to
// (2026-11-19 consolidation audit); they are tabs here now, mirrored into
// `?tab=` so the old URLs (rows in lib/route/legacy-redirects.ts) and
// back-navigation land on the right one. The puzzles tab is the interactive
// (non-3D) Daily Puzzles hub, unchanged; the strip sits at the top of its column.

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { GameErrorBoundary } from '@/components/shared/GameErrorBoundary';
import { GameLoadingFallback } from '@/components/shared/GameLoadingFallback';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { PuzzlePage } from '@/components/daily-puzzles/PuzzleShell';
import { DailyMutatorSection } from '@/components/arcade/DailyMutatorSection';
import { ConnectionsSection } from '@/components/party/ConnectionsPages';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { dailyMutatorQuery } from '@/lib/arcade/daily.queries';

// Static, not `lazy()`: Start already splits this route's component into its own
// chunk and loads it BEFORE hydrating. An inner `lazy()` can still be pending at
// hydration, and an update reaching the boundary then swaps the server-rendered
// page for the fallback (docs/archive/2026/fouc-audit-2026-10-06.md §13).
import { DailyPuzzlesHub } from '@/components/daily-puzzles/DailyPuzzlesHub';
import { ArrivalSuspense } from '@/components/ui/arrive';

const PATH = '/daily';
const DAILY_TABS = ['puzzles', 'mutator', 'connections'] as const;
type DailyTab = (typeof DAILY_TABS)[number];

function DailyIndex() {
  const { t } = useTranslation('c-daily-puzzles');
  const { tab = 'puzzles' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({
        to: '/daily',
        search: next === 'puzzles' ? {} : { tab: next as DailyTab },
        replace: true,
      });
    },
    [navigate],
  );

  const tabs: TabItem[] = [
    { id: 'puzzles', label: t('daily-tab-puzzles', { defaultValue: 'Puzzles' }) },
    { id: 'mutator', label: t('daily-tab-mutator', { defaultValue: 'Mutator' }) },
    { id: 'connections', label: t('daily-tab-connections', { defaultValue: 'Connections' }) },
  ];

  const strip = (
    <Tabs
      tabs={tabs}
      value={tab}
      onChange={setTab}
      idBase="daily"
      aria-label={t('daily-sections-label', { defaultValue: 'Daily sections' })}
    />
  );

  if (tab === 'puzzles') {
    return (
      <GameErrorBoundary gameName="Daily Puzzles">
        <ArrivalSuspense
          fallback={
            <GameLoadingFallback background="var(--site-bg)" foreground="var(--site-text)" />
          }
        >
          <DailyPuzzlesHub sectionTabs={strip} panelId="daily-panel-puzzles" />
        </ArrivalSuspense>
      </GameErrorBoundary>
    );
  }

  return (
    <PuzzlePage width="lg">
      <div className="flex flex-col gap-4 sm:gap-6">
        {strip}
        <div role="tabpanel" id={`daily-panel-${tab}`} aria-labelledby={`daily-tab-${tab}`}>
          <h1 className="t-title mb-2 text-site-text">
            {tab === 'mutator'
              ? t('daily-mutator-heading', { defaultValue: 'Daily mutator' })
              : t('daily-connections-heading', { defaultValue: 'Connections grids' })}
          </h1>
          {tab === 'mutator' ? <DailyMutatorSection /> : <ConnectionsSection />}
        </div>
      </div>
    </PuzzlePage>
  );
}

export const Route = createFileRoute('/daily/')({
  validateSearch: (search: Record<string, unknown>): { tab?: DailyTab } =>
    DAILY_TABS.includes(search.tab as DailyTab) && search.tab !== 'puzzles'
      ? { tab: search.tab as DailyTab }
      : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'puzzles' }),
  // The mutator's board is seeded here, as `/daily-mutator` did, so it paints with the page.
  loader: async ({ context, deps }) => {
    if (deps.tab === 'mutator') {
      await prefetchRouteQuery(context.queryClient, dailyMutatorQuery());
    }
  },
  head: () => ({
    meta: buildMeta({
      title: 'Daily Puzzles | RMH Studios',
      description:
        'Seven daily brain puzzles, the daily arcade mutator and member-made Connections grids. A new set at midnight EST.',
      path: PATH,
    }),
    links: [buildCanonical(PATH)],
  }),
  component: DailyIndex,
});
