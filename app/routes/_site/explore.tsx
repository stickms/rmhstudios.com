import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from "@/components/feed/ContextRail";
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
  head: () => ({ meta: [{ title: 'Explore | RMH Studios' }] }),
  loader: () => fetchExplore(),
  component: ExplorePage,
});

function ExplorePage() {
  const { data } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
      >
      <ExploreColumn initialData={data} />
    </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
