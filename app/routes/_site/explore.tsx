import { createFileRoute } from '@tanstack/react-router';
import { PageFrame } from '@/components/feed/PageLayout';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { ExploreColumn } from '@/components/feed/ExploreColumn';
import { auth } from '@/lib/auth';
import { listExplore } from '@/lib/explore.server';

// Prefetch the explore payload server-side so it's present at first paint (SSR)
// and prefetched on hover intent instead of fetched client-side on mount. The
// tips leaderboard stays client-fetched.
const fetchExplore = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return { data: await listExplore(session?.user?.id ?? null) };
});

export const Route = createFileRoute('/_site/explore')({
  head: () => ({
    meta: buildMeta({
      title: 'Explore | RMH Studios',
      description:
        'Trending posts, rising creators and what the RMH Studios community is talking about right now.',
      path: '/explore',
    }),
    links: [buildCanonical('/explore')],
  }),
  loader: () => fetchExplore(),
  component: ExplorePage,
});

function ExplorePage() {
  const { data } = Route.useLoaderData();
  return (
    <>
      <PageFrame>
        <ExploreColumn initialData={data} />
      </PageFrame>
    </>
  );
}
