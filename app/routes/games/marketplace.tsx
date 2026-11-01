import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { browse } from '@/lib/market/market.server';
import type { MarketListingView } from '@/components/market/ListingCard';
import { MarketplacePage } from '@/components/steam/MarketplacePage';
import { noindexHead } from '@/lib/seo';

const fetchMarketplace = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  const listings = await browse({ sort: 'recent' });
  return {
    listings: listings as unknown as MarketListingView[],
    viewerId: session?.user.id ?? null,
  };
});

export const Route = createFileRoute('/games/marketplace')({
  // /store?tab=market is the main-site copy; listings change by the minute.
  head: () => noindexHead('Player marketplace'),
  loader: () => fetchMarketplace(),
  component: MarketplaceRoute,
});

function MarketplaceRoute() {
  const { listings, viewerId } = Route.useLoaderData();
  return <MarketplacePage listings={listings} viewerId={viewerId} />;
}
