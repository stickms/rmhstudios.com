import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Gamepad2, Trophy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { Spinner } from '@/components/ui/spinner';
import { getRequestSession } from '@/lib/auth-session.server';
import { getArcadeState } from '@/lib/game/results.server';
import { getLeaderboard } from '@/lib/leaderboard.server';
import { ArcadeHub } from '@/components/arcade/ArcadeHub';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';

const ARCADE_TABS = ['challenges', 'leaderboard'] as const;
type ArcadeTab = (typeof ARCADE_TABS)[number];

// Prefetch both tabs' server data in one pass. The viewer's arcade state seeds
// the challenge cards (null when signed out — the Challenges tab shows the
// sign-in prompt), and the global leaderboard seeds the public Leaderboard tab
// so it paints at first load. Session is resolved once via the request-memoized
// helper (shared with the root loader / sidebar during SSR).
const fetchArcade = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession().catch(() => null);
  const [state, leaderboard] = await Promise.all([
    session ? getArcadeState(session.user.id) : Promise.resolve(null),
    getLeaderboard(session?.user.id ?? null, 'global'),
  ]);
  return { state, leaderboard, signedIn: !!session };
});

export const Route = createFileRoute('/_site/arcade')({
  head: () => ({ meta: [{ title: 'Arcade Pass | RMH Studios' }] }),
  // Mirror the active tab into `?tab=` so /arcade?tab=leaderboard deep-links (and
  // the /leaderboard redirect) land on the right tab; anything else → challenges.
  validateSearch: (search: Record<string, unknown>): { tab?: ArcadeTab } => {
    const tab = search.tab;
    return ARCADE_TABS.includes(tab as ArcadeTab) ? { tab: tab as ArcadeTab } : {};
  },
  // Both boards tolerate mild staleness; hold loader data 30s so tab/back
  // navigation doesn't recompute them (perf audit §4.2). Claims still refresh
  // explicitly via router.invalidate() inside ArcadeHub.
  staleTime: 30_000,
  loader: () => fetchArcade(),
  component: ArcadePage,
});

function ArcadePage() {
  const { t } = useTranslation('site');
  const { state, leaderboard, signedIn } = Route.useLoaderData();
  const { tab = 'challenges' } = Route.useSearch();
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();
  const title = t('arcade-title', { defaultValue: 'Arcade Pass' });

  const setTab = (next: ArcadeTab) => {
    void navigate({ to: '/arcade', search: { tab: next }, replace: true });
  };

  const tabs: { id: ArcadeTab; label: string; icon: typeof Gamepad2 }[] = [
    { id: 'challenges', label: t('arcade-tab-challenges', { defaultValue: 'Challenges' }), icon: Gamepad2 },
    { id: 'leaderboard', label: t('arcade-tab-leaderboard', { defaultValue: 'Leaderboard' }), icon: Trophy },
  ];

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {/* Mobile-only header; the tab bar below is the primary chrome on every
            breakpoint, and each tab's content renders header-less beneath it so
            no big section header stacks under the tabs. */}
        <MobileTopBar title={title} />

        {/* §15.1: unified sheet + flowing-capsule tab strip (was a border-b
            underline row). This is the arcade's primary chrome on every
            breakpoint; content renders header-less beneath it. */}
        <div className="my-3 px-2 tab-sheet-scroll md:px-3">
          <LiquidTabs
            aria-label={title}
            value={tab}
            onChange={(id) => setTab(id as ArcadeTab)}
            tabs={tabs}
          />
        </div>

        {tab === 'leaderboard' ? (
          <LeaderboardColumn initialData={leaderboard} signedIn={signedIn} hideHeader />
        ) : session && !isPending ? (
          <ArcadeHub initialState={state} hideHeader />
        ) : isPending ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
            <p className="font-medium text-site-text">
              {t('arcade-sign-in', {
                defaultValue: 'Sign in to play the daily arcade challenges',
              })}
            </p>
            <Link to="/login" search={{ callbackURL: '/arcade' }}>
              <Button variant="accent">{t('sign-in', { defaultValue: 'Sign in' })}</Button>
            </Link>
          </div>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
