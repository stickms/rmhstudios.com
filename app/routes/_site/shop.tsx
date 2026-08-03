import { createFileRoute } from '@tanstack/react-router';
import { buildCanonical, buildMeta } from '@/lib/seo';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { ContextRail } from '@/components/feed/ContextRail';
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
  head: () => ({
    meta: buildMeta({
      title: 'Shop | RMH Studios',
      description:
        'Spend coins on profile cosmetics, name colours, avatar frames and badges in the RMH Studios shop.',
      path: '/shop',
    }),
    links: [buildCanonical('/shop')],
  }),
  loader: () => fetchShop(),
  component: ShopPage,
});

function ShopPage() {
  const { shop } = Route.useLoaderData();
  return (
    <>
      <AnimatedMain className="w-full min-w-0 pb-dock">
        <ShopColumn initialData={shop} showHero />
      </AnimatedMain>
      <ContextRail reserve />
    </>
  );
}
