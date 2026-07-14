import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { CommunitiesColumn } from '@/components/feed/CommunitiesColumn';
import { CommunitiesSkeleton } from '@/components/feed/CommunitiesSkeleton';
import { auth } from '@/lib/auth';
import { listCommunities } from '@/lib/communities.server';

// Fetch the community list server-side so the page is present at first paint
// (SSR) and prefetched on hover intent, instead of a client-side waterfall that
// only starts fetching after the route mounts.
const fetchCommunities = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return { communities: await listCommunities({ userId: session?.user.id ?? null }) };
});

export const Route = createFileRoute('/_site/communities')({
  head: () => ({ meta: [{ title: 'Communities | RMH Studios' }] }),
  loader: async () => await fetchCommunities(),
  // Cold navigations (loader not yet prefetched) show a layout-matched skeleton
  // rather than the generic route fallback, so the real page swaps in without a
  // shift.
  pendingComponent: CommunitiesPending,
  component: CommunitiesPage,
});

function CommunitiesShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-[calc(env(safe-area-inset-bottom,0px)+92px)] md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        {children}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}

function CommunitiesPage() {
  const { communities } = Route.useLoaderData();
  return (
    <CommunitiesShell>
      <CommunitiesColumn initialCommunities={communities} />
    </CommunitiesShell>
  );
}

function CommunitiesPending() {
  return (
    <CommunitiesShell>
      <CommunitiesSkeleton />
    </CommunitiesShell>
  );
}
