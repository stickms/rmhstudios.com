import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getMarket } from '@/lib/cards/market.server';
import { MarketPage } from '@/components/steam/MarketPage';
import { noindexHead } from '@/lib/seo';

const fetchMarket = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return getMarket(session?.user.id ?? null);
});

export const Route = createFileRoute('/games/market/')({
  head: () => noindexHead('Community Market'),
  loader: () => fetchMarket(),
  component: MarketRoute,
});

function MarketRoute() {
  return <MarketPage data={Route.useLoaderData()} />;
}
