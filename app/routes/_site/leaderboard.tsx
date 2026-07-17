import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';
import { getRequestSession } from '@/lib/auth-session.server';
import { getLeaderboard } from '@/lib/leaderboard.server';

// Fetch the default (global) leaderboard server-side so the page paints at first
// load / on prefetch. The friends scope is fetched client-side on toggle.
const fetchLeaderboard = createServerFn({ method: 'GET' }).handler(async () => {
  // Request-memoized session (perf audit §4.2) — shares the resolution with the
  // root loader / sidebar during SSR instead of re-running Better Auth + tier.
  const session = await getRequestSession().catch(() => null);
  return {
    global: await getLeaderboard(session?.user.id ?? null, 'global'),
    signedIn: !!session,
  };
});

export const Route = createFileRoute('/_site/leaderboard')({
  head: () => ({ meta: [{ title: 'Leaderboard | RMH Studios' }] }),
  // Leaderboards tolerate mild staleness; hold loader data 30s so re-navigation
  // doesn't recompute the board (perf audit §4.2).
  staleTime: 30_000,
  loader: () => fetchLeaderboard(),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { global, signedIn } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <LeaderboardColumn initialData={global} signedIn={signedIn} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
