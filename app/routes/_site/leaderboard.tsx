import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { LeaderboardColumn } from '@/components/feed/LeaderboardColumn';
import { auth } from '@/lib/auth';
import { getLeaderboard } from '@/lib/leaderboard.server';

// Fetch the default (global) leaderboard server-side so the page paints at first
// load / on prefetch. The friends scope is fetched client-side on toggle.
const fetchLeaderboard = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return {
    global: await getLeaderboard(session?.user.id ?? null, 'global'),
    signedIn: !!session,
  };
});

export const Route = createFileRoute('/_site/leaderboard')({
  head: () => ({ meta: [{ title: 'Leaderboard | RMH Studios' }] }),
  loader: () => fetchLeaderboard(),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { global, signedIn } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <LeaderboardColumn initialData={global} signedIn={signedIn} />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
