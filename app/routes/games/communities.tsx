import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { listCommunities } from '@/lib/communities.server';
import { CommunitiesPage } from '@/components/steam/CommunitiesPage';
import { noindexHead } from '@/lib/seo';

const fetchCommunities = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return listCommunities({ userId: session?.user.id ?? null });
});

export const Route = createFileRoute('/games/communities')({
  // /communities is the indexed directory.
  head: () => noindexHead('Communities'),
  loader: () => fetchCommunities(),
  component: CommunitiesRoute,
});

function CommunitiesRoute() {
  return <CommunitiesPage communities={Route.useLoaderData()} />;
}
