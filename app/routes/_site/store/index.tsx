/**
 * /store — the combined Store.
 *
 * Merges what used to be three separate destinations — Membership (/pricing),
 * the cosmetics Shop (/shop), and the player-to-player Marketplace (/market) —
 * into a single tabbed page. The "Shop" tab leads with Membership (the reusable
 * `MembershipPanel`) above the coin-purchasable Shop catalog; the "Market" tab
 * hosts the player marketplace. The active tab is mirrored into the `?tab=`
 * search param so deep links (e.g. /store?tab=market) and back-navigation land
 * on the right surface.
 *
 * (Note: `/store/$userid` is a separate per-creator storefront route — leave
 * it untouched.)
 */
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { ShoppingBag, Store as StoreIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { PageLayout } from '@/components/feed/PageLayout';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { MarketColumn } from '@/components/market/MarketColumn';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { getShopData } from '@/lib/shop/list.server';
import { browse } from '@/lib/market/market.server';
import type { MarketListingView } from '@/components/market/ListingCard';

const STORE_TABS = ['shop', 'market'] as const;
type StoreTab = (typeof STORE_TABS)[number];

// Membership tier + shop catalog + active marketplace, all server-side so both
// tabs are present at first paint / prefetched on intent instead of fetching on
// mount.
const fetchStore = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const userId = session?.user?.id ?? null;
  const [tier, shop, listings] = await Promise.all([
    userId ? getUserTier(userId) : Promise.resolve('free' as Tier),
    getShopData(userId),
    browse({ sort: 'recent' }),
  ]);
  return {
    tier,
    shop,
    listings: listings as unknown as MarketListingView[],
    viewerId: userId,
  };
});

export const Route = createFileRoute('/_site/store/')({
  loader: () => fetchStore(),
  head: () => ({
    meta: [
      { title: 'Store — RMH Studios' },
      {
        name: 'description',
        content:
          'Membership tiers, the cosmetics shop, and the player marketplace — all in one place.',
      },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { tab?: StoreTab } => {
    const tab = search.tab;
    return STORE_TABS.includes(tab as StoreTab) ? { tab: tab as StoreTab } : {};
  },
  component: Store,
});

function Store() {
  const { t } = useTranslation('site');
  const { tier: currentTier, shop, listings, viewerId } = Route.useLoaderData();
  const { tab = 'shop' } = Route.useSearch();
  const navigate = useNavigate();

  const setTab = useCallback(
    (next: string) => {
      void navigate({ to: '/store', search: { tab: next as StoreTab }, replace: true });
    },
    [navigate],
  );

  const tabs: LiquidTab[] = [
    { id: 'shop', label: t('store-tab-shop', { defaultValue: 'Shop' }), icon: ShoppingBag },
    { id: 'market', label: t('store-tab-market', { defaultValue: 'Market' }), icon: StoreIcon },
  ];

  return (
    <PageLayout
      title={t('store-title', { defaultValue: 'Store' })}
      description={t('store-subtitle', {
        defaultValue: 'Membership, cosmetics you can buy with coins, and the player marketplace.',
      })}
    >
      {/* §16.2: Shop/Market as the shared LiquidTabs sheet, below the page title
          `PageLayout` renders (this page used to draw its own title capsule —
          the whole point of the shared header is that it doesn't have to).
          `?tab=` mirroring, roving nav and the aria-controls tabpanel wiring
          (idBase="store" → `store-tab-*` / `store-panel-*`) are unchanged. */}
      <div className="my-3 px-2 md:px-3">
        <LiquidTabs
          tabs={tabs}
          value={tab}
          onChange={setTab}
          idBase="store"
          fullWidth
          scroll
          aria-label={t('store-title', { defaultValue: 'Store' })}
        />
      </div>

      {tab === 'shop' && (
        <div role="tabpanel" id="store-panel-shop" aria-labelledby="store-tab-shop">
          <MembershipPanel
            currentTier={currentTier}
            headingLevel="h2"
            returnPath="/store"
            coinShopAnchorId="coins-shop"
          />
          <div id="coins-shop" className="scroll-mt-4 border-t border-site-border">
            <ShopColumn initialData={shop} />
          </div>
        </div>
      )}
      {tab === 'market' && (
        <div role="tabpanel" id="store-panel-market" aria-labelledby="store-tab-market">
          <MarketColumn initialListings={listings} viewerId={viewerId} />
        </div>
      )}
    </PageLayout>
  );
}
