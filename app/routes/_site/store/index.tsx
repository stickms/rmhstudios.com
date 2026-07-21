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
import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { m as motion } from 'framer-motion';
import { type LucideIcon, ShoppingBag, Store as StoreIcon } from 'lucide-react';
import { auth } from '@/lib/auth';
import { getUserTier, type Tier } from '@/lib/entitlements';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { MobileTopBar } from '@/components/feed/MobileHeader';
import { MembershipPanel } from '@/components/membership/MembershipPanel';
import { ShopColumn } from '@/components/feed/ShopColumn';
import { MarketColumn } from '@/components/market/MarketColumn';
import { useLiquidMorph } from '@/components/ui/liquid-morph';
import { SPRING } from '@/lib/motion';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
  const reduced = useReducedMotion();
  // §15.1/§5.47: the active Shop/Market capsule flows between tabs with the
  // velocity squash + gooey trailing droplet, the same morph every converged
  // strip carries. Custom markup (not LiquidTabs) keeps the aria-controls
  // tabpanel wiring + ?tab= mirroring byte-identical.
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const { squashStyle, underlay } = useLiquidMorph({ capsuleRef, axis: 'x', reduced });

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

        {/* §15.1: Shop/Market as the unified sheet + flowing-capsule strip, placed
            BELOW the page-title capsule (was a bare bottom-underline marker). ?tab=
            mirroring, roving nav and aria-controls wiring are byte-identical. */}
        <div className="mt-3 px-2 md:px-3">
        <div
          className="glass-fill glass-bevel-sm relative flex w-fit items-center gap-1 rounded-full p-1"
          role="tablist"
          aria-label={t('store-title', { defaultValue: 'Store' })}
          onKeyDown={onTabsKeyDown}
        >
          {/* Goo underlay (§5.47) — capsule-only, behind the tabs; labels above. */}
          {underlay}
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
                  'relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors',
                  active ? 'text-site-accent' : 'text-site-text-muted hover:text-site-text',
                )}
              >
                {active && (
                  // Outer element owns the layoutId position morph; the inner span
                  // carries the material + velocity squash so scaling never fights
                  // the projection transform (§5.47).
                  <motion.span
                    ref={capsuleRef}
                    layoutId="store-tab-capsule"
                    aria-hidden
                    className="absolute inset-0 z-0"
                    transition={reduced ? { duration: 0 } : SPRING.snappy}
                  >
                    <motion.span
                      className="glass-liquid absolute inset-0 rounded-full bg-site-accent-dim shadow-[inset_0_1px_0_var(--site-glass-rim)]"
                      style={squashStyle}
                    />
                  </motion.span>
                )}
                <Icon className="relative z-1 h-4 w-4" aria-hidden="true" />
                <span className="relative z-1">{label}</span>
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
