/**
 * /compete — every standings surface on one page: the ranked ladders,
 * tournaments, speedruns, wager matches and the player (XP) leaderboard.
 *
 * Before the 2026-11-19 consolidation these were five destinations with no nav
 * entry at all (`/ranked`, `/tournaments`, `/speedruns`, `/wager`, and the
 * leaderboard as a sub-tab of `/arcade`). Their old index paths are rows in
 * `lib/route/legacy-redirects.ts`; `/tournaments/$id` and `/wager/$id` are still
 * their own pages and link back to their tab here. `/arcade` links here from its
 * header, and the Ranked summary's "View all" opens the Ranked tab.
 *
 * The tab is mirrored into `?tab=` (as on `/store`). Each tab renders the
 * component the old page did; the loader seeds only what the open tab shows,
 * the same data each old route seeded.
 */
import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { RankedColumn } from '@/components/feed/RankedColumn';
import { FriendlyChallengesLazy } from '@/components/competitive/FriendlyChallengesLazy';
import { TournamentsSection } from '@/components/compete/TournamentsSection';
import { SpeedrunsSection } from '@/components/compete/SpeedrunsSection';
import { WagersSection } from '@/components/compete/WagersSection';
import { XpLeaderboardSection } from '@/components/compete/XpLeaderboardSection';
import type { TabItem } from '@/components/ui/tabs';
import { getRequestSession } from '@/lib/auth-session.server';
import { getRankedOverview } from '@/lib/ranked.server';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { tournamentsQuery } from '@/lib/tournaments/tournaments.queries';
import { wagersQuery } from '@/lib/wager/wager.queries';
import { definePage } from '@/lib/route/define-page';
import { fetchExclusionNotice } from '@/lib/economy/exclusion-page.functions';

const COMPETE_TABS = ['ranked', 'tournaments', 'speedruns', 'wagers', 'leaderboard'] as const;
type CompeteTab = (typeof COMPETE_TABS)[number];

// Ratings and challenges server-side, so the Ranked tab is present at first
// paint. Signed-out visitors still get the games list.
const fetchRanked = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return getRankedOverview(session?.user.id ?? null);
});

interface CompeteLoaderData {
  /** Self-excluded: the Wagers tab is not offered and `?tab=wagers` reads as the default tab (W8). */
  excluded?: boolean;
  ranked?: Awaited<ReturnType<typeof fetchRanked>>;
}

export const Route = createFileRoute('/_site/compete')({
  head: definePage<CompeteLoaderData>({
    path: '/compete',
    title: 'Compete | RMH Studios',
    description:
      'Ranked ladders, coin-prize tournaments, replay-verified speedruns, wager matches and the player leaderboard across every RMH Studios game.',
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: CompeteTab } =>
    COMPETE_TABS.includes(search.tab as CompeteTab) ? { tab: search.tab as CompeteTab } : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'ranked' }),
  loader: async ({ context, deps }): Promise<CompeteLoaderData> => {
    // Decided here, so an excluded member's open wagers are never fetched or rendered (also with scripting off).
    const { excluded } = await fetchExclusionNotice();
    switch (excluded && deps.tab === 'wagers' ? 'ranked' : deps.tab) {
      case 'ranked':
        return { excluded, ranked: await fetchRanked() };
      case 'tournaments':
        // The first status tab (open brackets); the others load on demand.
        await prefetchRouteQuery(context.queryClient, tournamentsQuery('REGISTRATION'));
        return { excluded };
      case 'wagers':
        // The open challenges are public; "mine" loads on demand.
        await prefetchRouteQuery(context.queryClient, wagersQuery('open'));
        return { excluded };
      default:
        return { excluded };
    }
  },
  component: CompetePage,
});

function CompetePage() {
  const { t } = useTranslation('site');
  const data: CompeteLoaderData = Route.useLoaderData() ?? {};
  const { tab: requested = 'ranked' } = Route.useSearch();
  const excluded = data.excluded === true;
  const tab = excluded && requested === 'wagers' ? 'ranked' : requested;
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/compete', search: { tab: next as CompeteTab }, replace: true });
    },
    [navigate],
  );

  const tabs: TabItem[] = [
    { id: 'ranked', label: t('compete-tab-ranked', { defaultValue: 'Ranked' }) },
    { id: 'tournaments', label: t('compete-tab-tournaments', { defaultValue: 'Tournaments' }) },
    { id: 'speedruns', label: t('compete-tab-speedruns', { defaultValue: 'Speedruns' }) },
    ...(excluded ? [] : [{ id: 'wagers', label: t('compete-tab-wagers', { defaultValue: 'Wagers' }) }]),
    { id: 'leaderboard', label: t('compete-tab-leaderboard', { defaultValue: 'Leaderboard' }) },
  ];

  return (
    <PageLayout
      title={t('compete-title', { defaultValue: 'Compete' })}
      description={t('compete-description', {
        defaultValue: 'Ladders, brackets, records and stakes across every game.',
      })}
      wide
    >
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="compete"
        aria-label={t('compete-title', { defaultValue: 'Compete' })}
      />
      <div role="tabpanel" id={`compete-panel-${tab}`} aria-labelledby={`compete-tab-${tab}`}>
        {tab === 'ranked' && (
          <>
            <RankedColumn initialData={data.ranked} hideHeader />
            <FriendlyChallengesLazy />
          </>
        )}
        {tab === 'tournaments' && <TournamentsSection />}
        {tab === 'speedruns' && <SpeedrunsSection />}
        {tab === 'wagers' && <WagersSection />}
        {tab === 'leaderboard' && <XpLeaderboardSection />}
      </div>
    </PageLayout>
  );
}
