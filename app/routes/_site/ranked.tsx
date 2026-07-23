import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { RankedColumn } from '@/components/feed/RankedColumn';
import { auth } from '@/lib/auth';
import { getRankedOverview } from '@/lib/ranked.server';

// Fetch the primary Ranked payload (ratings + challenges) server-side so the
// page is present at first paint / prefetched on intent instead of fetched on
// mount. Signed-out visitors still get the games list. The per-game leaderboard
// stays a client-side fetch.
const fetchRanked = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return { overview: await getRankedOverview(session?.user.id ?? null) };
});

export const Route = createFileRoute('/_site/ranked')({
  head: () => ({ meta: [{ title: 'Ranked | RMH Studios' }] }),
  loader: () => fetchRanked(),
  component: RankedPage,
});

function RankedPage() {
  const { overview } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
        <RankedColumn initialData={overview} />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
