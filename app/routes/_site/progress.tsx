/**
 * /progress — the one page for "how am I doing": the member's progress, streak
 * and achievements, the weekly recap, the yearly Wrapped, and the site's daily
 * front page.
 *
 * It replaces five pages (2026-11-19 consolidation audit): `/achievements`
 * rendered the same column as this page with another tab open, and `/recap`,
 * `/wrapped` and `/today` were reachable from nothing but each other. Their old
 * paths are rows in `lib/route/legacy-redirects.ts` and land on the matching
 * tab here.
 *
 * The tab is mirrored into `?tab=` (as on `/store`) so a notification, the old
 * URLs and back-navigation land on the right section. Each tab keeps the
 * component it always rendered; the loader fetches only what the open tab
 * shows. Today is public; every other tab is the viewer's own and asks a
 * signed-out visitor to sign in.
 */
import { useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { useTranslation } from 'react-i18next';
import { PageLayout } from '@/components/feed/PageLayout';
import { PageTabs } from '@/components/feed/PageTabs';
import { ProgressColumn } from '@/components/feed/ProgressColumn';
import { StreakColumn } from '@/components/feed/StreakColumn';
import { AchievementsColumn } from '@/components/feed/AchievementsColumn';
import { RecapColumn } from '@/components/feed/RecapColumn';
import { WrappedColumn } from '@/components/feed/WrappedColumn';
import { TodaySection } from '@/components/discovery/TodaySection';
import { useSession } from '@/components/Providers';
import { Spinner } from '@/components/ui/spinner';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { useArrival } from '@/components/ui/arrive';
import type { TabItem } from '@/components/ui/tabs';
import { getRequestSession } from '@/lib/auth-session.server';
import { listAchievements } from '@/lib/achievements.server';
import { getWeeklyRecap } from '@/lib/recap.server';
import { getYearlyWrapped } from '@/lib/wrapped/wrapped.server';
import { getLatestDigest } from '@/lib/discovery/today.server';
import { prefetchRouteQuery } from '@/lib/route/route-query';
import { battlepassQuery, progressSummaryQuery } from '@/lib/progress.queries';
import { definePage } from '@/lib/route/define-page';

const PROGRESS_TABS = ['progress', 'streaks', 'achievements', 'today', 'week', 'year'] as const;
type ProgressTab = (typeof PROGRESS_TABS)[number];

// Each signed-in section is fetched server-side so it is present at first paint
// and prefetched on intent. Signed out, they answer `null` and the tab shows the
// sign-in prompt instead.
const fetchAchievements = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return session ? await listAchievements(session.user.id) : null;
});
const fetchRecap = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return session ? await getWeeklyRecap(session.user.id) : null;
});
const fetchWrapped = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return session ? await getYearlyWrapped(session.user.id) : null;
});
const fetchToday = createServerFn({ method: 'GET' }).handler(() => getLatestDigest());

/** What the loader fetched for the open tab; the other fields stay absent. */
interface ProgressLoaderData {
  achievements?: Awaited<ReturnType<typeof fetchAchievements>>;
  recap?: Awaited<ReturnType<typeof fetchRecap>>;
  wrapped?: Awaited<ReturnType<typeof fetchWrapped>>;
  digest?: Awaited<ReturnType<typeof fetchToday>>;
}

export const Route = createFileRoute('/_site/progress')({
  head: definePage<ProgressLoaderData>({
    path: '/progress',
    title: 'Progress | RMH Studios',
    description:
      'Your level, streak and achievements, your week and your year on RMH Studios, and the last 24 hours on the site.',
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: ProgressTab } =>
    PROGRESS_TABS.includes(search.tab as ProgressTab) ? { tab: search.tab as ProgressTab } : {},
  loaderDeps: ({ search }) => ({ tab: search.tab ?? 'progress' }),
  loader: async ({ context, deps }): Promise<ProgressLoaderData> => {
    switch (deps.tab) {
      case 'progress':
        await Promise.all([
          prefetchRouteQuery(context.queryClient, progressSummaryQuery()),
          prefetchRouteQuery(context.queryClient, battlepassQuery()),
        ]);
        return {};
      case 'achievements':
        return { achievements: await fetchAchievements() };
      case 'week':
        return { recap: await fetchRecap() };
      case 'year':
        return { wrapped: await fetchWrapped() };
      case 'today':
        return { digest: await fetchToday() };
      default:
        return {};
    }
  },
  component: ProgressPage,
});

function ProgressPage() {
  const { t } = useTranslation('site');
  const { t: tFeed } = useTranslation('feed');
  const data: ProgressLoaderData = Route.useLoaderData() ?? {};
  const { tab = 'progress' } = Route.useSearch();
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  // The section fades in when the session resolves after the spinner (M9).
  const arrival = useArrival(!isPending);

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/progress', search: { tab: next as ProgressTab }, replace: true });
    },
    [navigate],
  );

  const tabs: TabItem[] = [
    { id: 'progress', label: tFeed('journey-tab-progress', { defaultValue: 'Progress' }) },
    { id: 'streaks', label: tFeed('journey-tab-streaks', { defaultValue: 'Streaks' }) },
    {
      id: 'achievements',
      label: tFeed('journey-tab-achievements', { defaultValue: 'Achievements' }),
    },
    { id: 'today', label: t('progress-tab-today', { defaultValue: 'Today' }) },
    { id: 'week', label: t('progress-tab-week', { defaultValue: 'Week' }) },
    { id: 'year', label: t('progress-tab-year', { defaultValue: 'Year' }) },
  ];

  const signInTitle: Record<Exclude<ProgressTab, 'today'>, string> = {
    progress: t('sign-in-to-track-progress', { defaultValue: 'Sign in to track your progress' }),
    streaks: t('sign-in-to-track-progress', { defaultValue: 'Sign in to track your progress' }),
    achievements: t('sign-in-to-track-achievements', {
      defaultValue: 'Sign in to track achievements',
    }),
    week: t('sign-in-to-track-progress', { defaultValue: 'Sign in to track your progress' }),
    year: t('sign-in-to-see-wrapped', { defaultValue: 'Sign in to see your Wrapped' }),
  };

  function personal() {
    if (tab === 'today') return null;
    if (isPending) {
      return (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      );
    }
    if (!session) {
      return (
        <SignedOutPrompt
          className={arrival}
          callbackURL={`/progress?tab=${tab}`}
          title={signInTitle[tab]}
        />
      );
    }
    const userId = session.user.id;
    return (
      <div className={arrival}>
        {tab === 'progress' && <ProgressColumn hideHeader />}
        {tab === 'streaks' && <StreakColumn hideHeader />}
        {tab === 'achievements' && (
          <AchievementsColumn
            userId={userId}
            hideHeader
            own
            initialData={data.achievements}
          />
        )}
        {tab === 'week' && (
          <RecapColumn initialData={data.recap} />
        )}
        {tab === 'year' && (
          <WrappedColumn initialData={data.wrapped} />
        )}
      </div>
    );
  }

  return (
    <PageLayout title={tFeed('progress-heading', { defaultValue: 'Progress' })}>
      <PageTabs
        tabs={tabs}
        value={tab}
        onChange={setTab}
        idBase="progress"
        aria-label={tFeed('journey-sections-label', { defaultValue: 'Journey sections' })}
      />
      <div role="tabpanel" id={`progress-panel-${tab}`} aria-labelledby={`progress-tab-${tab}`}>
        {tab === 'today'
          ? data.digest && <TodaySection digest={data.digest} />
          : personal()}
      </div>
    </PageLayout>
  );
}
