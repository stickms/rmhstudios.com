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
import { type LucideIcon, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { MarketColumn } from '@/components/market/MarketColumn';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { getShopData } from '@/lib/shop/list.server';
import { browse } from '@/lib/market/market.server';
import { cn } from '@/lib/utils';
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
      { name: 'description', content: 'Membership tiers, the cosmetics shop, and the player marketplace — all in one place.' },
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
    (next: StoreTab) => {
      void navigate({ to: '/store', search: { tab: next }, replace: true });
    },
    [navigate],
  );

  // Roving keyboard navigation for the tablist (WAI-ARIA tabs pattern):
  // ←/→ move between tabs, Home/End jump to the ends, and focus follows.
  const onTabsKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const idx = STORE_TABS.indexOf(tab);
      let next = idx;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % STORE_TABS.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp')
        next = (idx - 1 + STORE_TABS.length) % STORE_TABS.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = STORE_TABS.length - 1;
      else return;
      e.preventDefault();
      const nextId = STORE_TABS[next];
      setTab(nextId);
      requestAnimationFrame(() => document.getElementById(`store-tab-${nextId}`)?.focus());
    },
    [tab, setTab],
  );

  const tabs: { id: StoreTab; label: string; icon: LucideIcon }[] = [
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

        <div className="border-b border-site-border">
          <div
            className="flex gap-1 px-2"
            role="tablist"
            aria-label={t('store-title', { defaultValue: 'Store' })}
            onKeyDown={onTabsKeyDown}
          >
            {tabs.map(({ id, label, icon: Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  id={`store-tab-${id}`}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={`store-panel-${id}`}
                  tabIndex={active ? 0 : -1}
                  onClick={() => setTab(id)}
                  className={cn(
                    'relative inline-flex items-center gap-2 px-4 py-3 text-sm font-semibold transition-colors',
                    active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                  {active && (
                    <span
                      className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-site-accent"
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'shop' && (
          <div role="tabpanel" id="store-panel-shop" aria-labelledby="store-tab-shop">
            <MembershipPanel currentTier={currentTier} returnPath="/store" coinShopAnchorId="coins-shop" />
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
