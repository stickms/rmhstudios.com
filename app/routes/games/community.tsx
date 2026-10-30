import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getCommunityHome } from '@/lib/games/community.server';
import { CommunityHome } from '@/components/steam/CommunityHome';
import { noindexHead } from '@/lib/seo';

const fetchHome = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return getCommunityHome(session?.user.id ?? null);
});

export const Route = createFileRoute('/games/community')({
  head: () => noindexHead('Community'),
  loader: () => fetchHome(),
  component: CommunityRoute,
});

function CommunityRoute() {
  return <CommunityHome data={Route.useLoaderData()} />;
}
