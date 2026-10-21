import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { RankedColumn } from '@/components/feed/RankedColumn';
import { FriendlyChallengesLazy } from '@/components/competitive/FriendlyChallengesLazy';
import { getRequestSession } from '@/lib/auth-session.server';
import { getRankedOverview } from '@/lib/ranked.server';

// Fetch the primary Ranked payload (ratings + challenges) server-side so the
// page is present at first paint / prefetched on intent instead of fetched on
// mount. Signed-out visitors still get the games list. The per-game leaderboard
// stays a client-side fetch.
const fetchRanked = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return { overview: await getRankedOverview(session?.user.id ?? null) };
});

export const Route = createFileRoute('/_site/ranked')({
  head: () => ({
    meta: buildMeta({
      title: 'Ranked | RMH Studios',
      description:
        'Competitive ladders across the RMH Studios arcade: current standings, your rating, and the seasons in progress.',
      path: '/ranked',
    }),
    links: [buildCanonical('/ranked')],
  }),
  loader: () => fetchRanked(),
  component: RankedPage,
});

function RankedPage() {
  const { overview } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <RankedColumn initialData={overview} />
      </PageFrame>
      <FriendlyChallengesLazy />
    </>
  );
}
