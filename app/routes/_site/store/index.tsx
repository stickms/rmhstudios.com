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
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { MarketColumn } from '@/components/market/MarketColumn';
import { LiquidTabs, type LiquidTab } from '@/components/ui/liquid-tabs';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
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
    <>
      <AnimatedMain
        className="relative isolate min-h-screen w-full min-w-0 pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <MobileTopBar title={t('store-title', { defaultValue: 'Store' })} />

        {/* §15.1: a proper floating "Store" page-title capsule (PageLayout-style)
            on desktop — the store previously had no title above the tabs. It is
            NON-sticky on purpose: the Shop/Market panels each own a sticky section
            header (ColumnHeader top-2), so a sticky page title here would stack on
            top of them (§15.5 one-sticky-group rule). Mobile keeps MobileTopBar. */}
        <div className="mx-2 mt-2 hidden rounded-site glass-chrome px-4 py-3 shadow-site-sm md:mx-3 md:mt-3 md:block">
          <h1 className="font-(family-name:--site-font-display) text-2xl font-semibold tracking-[-0.022em] text-site-text">
            {t('store-title', { defaultValue: 'Store' })}
          </h1>
        </div>

        {/* §16.2: Shop/Market as the shared LiquidTabs sheet, placed BELOW the
            page-title capsule (was bespoke tablist markup). `?tab=` mirroring,
            roving nav and the aria-controls tabpanel wiring (idBase="store" →
            `store-tab-*` / `store-panel-*`) are byte-identical to before. */}
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
      </AnimatedMain>
      {/* Trailing gutter to match the blog/library layout */}
      <div className="hidden lg:block w-4 shrink-0" />
    </>
  );
}
