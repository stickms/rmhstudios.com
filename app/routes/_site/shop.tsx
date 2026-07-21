import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { auth } from '@/lib/auth';
import { getShopData } from '@/lib/shop/list.server';

// Prefetch the shop catalog (+ the viewer's coins/inventory) server-side so it's
// present at first paint / prefetched on intent instead of fetched on mount.
const fetchShop = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  return { shop: await getShopData(session?.user.id ?? null) };
});

export const Route = createFileRoute('/_site/shop')({
  head: () => ({ meta: [{ title: 'Shop | RMH Studios' }] }),
  loader: () => fetchShop(),
  component: ShopPage,
});

function ShopPage() {
  const { shop } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <ShopColumn initialData={shop} showHero />
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
