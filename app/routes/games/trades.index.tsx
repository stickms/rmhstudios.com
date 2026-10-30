import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { listTrades } from '@/lib/cards/trades.server';
import { TradesPage } from '@/components/steam/TradesPage';
import { noindexHead } from '@/lib/seo';

const fetchTrades = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  if (!session) return null;
  return listTrades(session.user.id);
});

export const Route = createFileRoute('/games/trades/')({
  head: () => noindexHead('Trade Offers'),
  loader: async () => {
    const data = await fetchTrades();
    if (!data) throw redirect({ href: '/login?callbackURL=%2Fgames%2Ftrades' });
    return data;
  },
  component: TradesRoute,
});

function TradesRoute() {
  return <TradesPage data={Route.useLoaderData()} />;
}
