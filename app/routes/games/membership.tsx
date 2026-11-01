import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { MembershipPage } from '@/components/steam/MembershipPage';
import { noindexHead } from '@/lib/seo';

const fetchTier = createServerFn({ method: 'GET' }).handler(async (): Promise<{ tier: Tier | null }> => {
  const session = await getRequestSession();
  return { tier: session ? await getUserTier(session.user.id) : null };
});

export const Route = createFileRoute('/games/membership')({
  // /store?tab=membership is the indexed pricing page.
  head: () => noindexHead('Membership'),
  loader: () => fetchTier(),
  component: MembershipRoute,
});

function MembershipRoute() {
  return <MembershipPage currentTier={Route.useLoaderData().tier} />;
}
