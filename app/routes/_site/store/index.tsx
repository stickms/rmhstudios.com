/**
 * /store — the combined Store.
 *
 * Merges what used to be two separate destinations — Membership (/pricing) and
 * the cosmetics Shop (/shop) — into a single page. Membership leads at the top
 * (the reusable `MembershipPanel`), with the coin-purchasable Shop catalog
 * below. Surfaced as a single "Store" link in the sidebar.
 */
import { useTranslation } from 'react-i18next';
import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { getShopData } from '@/lib/shop/list.server';

// Membership tier + shop catalog, both server-side so the page is present at
// first paint / prefetched on intent instead of the shop fetching on mount.
const fetchStore = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers });
  const userId = session?.user?.id ?? null;
  const [tier, shop] = await Promise.all([
    userId ? getUserTier(userId) : Promise.resolve('free' as Tier),
    getShopData(userId),
  ]);
  return { tier, shop };
});

export const Route = createFileRoute('/_site/store/')({
  loader: () => fetchStore(),
  head: () => ({
    meta: [
      { title: 'Store — RMH Studios' },
      { name: 'description', content: 'Membership tiers and the cosmetics shop — all in one place.' },
    ],
  }),
  component: Store,
});

function Store() {
  const { t } = useTranslation('site');
  const { tier: currentTier, shop } = Route.useLoaderData();

  return (
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 overflow-hidden border-r border-site-border pb-16 md:pb-0"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('store-title', { defaultValue: 'Store' })} />
        <MembershipPanel currentTier={currentTier} returnPath="/store" coinShopAnchorId="coins-shop" />
        <div id="coins-shop" className="scroll-mt-4 border-t border-site-border">
          <ShopColumn initialData={shop} />
        </div>
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
