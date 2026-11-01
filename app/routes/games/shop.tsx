import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequestSession } from '@/lib/auth-session.server';
import { getShopData } from '@/lib/shop/list.server';
import { ShopPage } from '@/components/steam/ShopPage';
import { noindexHead } from '@/lib/seo';

const fetchShop = createServerFn({ method: 'GET' }).handler(async () => {
  const session = await getRequestSession();
  return getShopData(session?.user.id ?? null);
});

export const Route = createFileRoute('/games/shop')({
  // /store?tab=shop is the indexed page for the same catalog.
  head: () => noindexHead('Points shop'),
  loader: () => fetchShop(),
  component: ShopRoute,
});

function ShopRoute() {
  return <ShopPage data={Route.useLoaderData()} />;
}
