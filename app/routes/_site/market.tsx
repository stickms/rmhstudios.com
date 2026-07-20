import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Store, Tag } from 'lucide-react';
import { AnimatedMain } from '@/components/feed/AnimatedMain';
import { WIDE_NO_RIGHT_SIDEBAR_WIDTH } from '@/lib/layout-width';
import { ColumnHeader } from '@/components/feed/ColumnHeader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';
import { auth } from '@/lib/auth';
import { browse } from '@/lib/market/market.server';
import { getShopItem } from '@/lib/shop/catalog';
import { ListingCard, type MarketListingView } from '@/components/market/ListingCard';
import { SellSheet } from '@/components/market/SellSheet';

interface PriceHistoryView {
  sales: { price: number; at: string }[];
  count: number;
  low: number | null;
  high: number | null;
  average: number | null;
}

// Prefetch the active marketplace so the grid is present at first paint. Also
// resolves the viewer id (for own-listing / buy affordances) server-side.
const fetchMarket = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
  const listings = await browse({ sort: 'recent' });
  return { listings: listings as unknown as MarketListingView[], viewerId: session?.user.id ?? null };
});

export const Route = createFileRoute('/_site/market')({
  head: () => ({ meta: [{ title: 'Marketplace | RMH Studios' }] }),
  loader: () => fetchMarket(),
  component: MarketPage,
});

/** Tiny inline SVG sparkline of recent sale prices. */
function Sparkline({ sales }: { sales: { price: number }[] }) {
  if (sales.length < 2) return null;
  const w = 160;
  const h = 36;
  const prices = sales.map((s) => s.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const step = w / (prices.length - 1);
  const points = prices
    .map((p, i) => `${(i * step).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <polyline
        points={points}
        fill="none"
        stroke="var(--site-accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MarketPage() {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const { listings: initial, viewerId } = Route.useLoaderData();

  const [listings, setListings] = useState<MarketListingView[]>(initial);
  const [sort, setSort] = useState<'recent' | 'price_asc' | 'price_desc'>('recent');
  const [itemFilter, setItemFilter] = useState<string>('');
  const [history, setHistory] = useState<PriceHistoryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);

  const currentUserId = session?.user.id ?? viewerId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ sort });
      if (itemFilter) qs.set('item', itemFilter);
      const res = await fetch(`/api/market/listings?${qs.toString()}`, { credentials: 'include' });
      const data = await res.json().catch(() => ({ listings: [] }));
      setListings(data.listings ?? []);
      setHistory(data.history ?? null);
    } finally {
      setLoading(false);
    }
  }, [sort, itemFilter]);

  // Refetch on filter/sort change (skip the very first render — loader seeded it).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    load();
  }, [load]);

  const onDone = useCallback((id: string) => {
    setListings((prev) => prev.filter((l) => l.id !== id));
  }, []);

  // Items that currently have listings — a manageable filter set.
  const filterOptions = useMemo(() => {
    const ids = Array.from(new Set(initial.map((l) => l.itemId)));
    return ids
      .map((id) => ({ id, name: getShopItem(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initial]);

  const filteredName = itemFilter ? (getShopItem(itemFilter)?.name ?? itemFilter) : null;

  return (
    <>
      <AnimatedMain
        className="w-full min-w-0 border-r border-site-border pb-dock"
        targetWidth={WIDE_NO_RIGHT_SIDEBAR_WIDTH}
      >
        <ColumnHeader
          icon={Store}
          title={t('market-title', { defaultValue: 'Marketplace' })}
          actions={
            session ? (
              <Button size="sm" variant="accent" onClick={() => setSellOpen(true)}>
                <Tag className="h-4 w-4" /> {t('market-sell', { defaultValue: 'Sell' })}
              </Button>
            ) : undefined
          }
        />

        <div className="flex flex-wrap items-center gap-2 border-b border-site-border px-4 py-3">
          <Select
            value={itemFilter}
            onChange={(e) => setItemFilter(e.target.value)}
            aria-label={t('market-filter-item', { defaultValue: 'Filter by item' })}
            className="h-9 w-auto min-w-[10rem] flex-1"
          >
            <option value="">{t('market-all-items', { defaultValue: 'All items' })}</option>
            {filterOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            aria-label={t('market-sort', { defaultValue: 'Sort listings' })}
            className="h-9 w-auto min-w-[9rem]"
          >
            <option value="recent">{t('market-sort-recent', { defaultValue: 'Newest' })}</option>
            <option value="price_asc">{t('market-sort-price-asc', { defaultValue: 'Price: low to high' })}</option>
            <option value="price_desc">{t('market-sort-price-desc', { defaultValue: 'Price: high to low' })}</option>
          </Select>
        </div>

        {itemFilter && history && history.count > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-site-border px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold uppercase tracking-wider text-site-text-dim">
                {t('market-history-heading', { name: filteredName, defaultValue: '{{name}} · recent sales' })}
              </p>
              <p className="text-xs text-site-text-muted">
                {t('market-history-stats', {
                  count: history.count,
                  low: history.low?.toLocaleString(),
                  high: history.high?.toLocaleString(),
                  avg: history.average?.toLocaleString(),
                  defaultValue: '{{count}} sales · low {{low}} · avg {{avg}} · high {{high}}',
                })}
              </p>
            </div>
            <Sparkline sales={history.sales} />
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Spinner />
          </div>
        ) : listings.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Store}
              title={t('market-empty-title', { defaultValue: 'No listings yet' })}
              description={t('market-empty-desc', {
                defaultValue:
                  'Nothing is for sale right now. If you own tradable cosmetics, be the first to list one.',
              })}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
            {listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                isOwn={!!currentUserId && listing.seller.id === currentUserId}
                canBuy={!!currentUserId && listing.seller.id !== currentUserId}
                onDone={onDone}
              />
            ))}
          </div>
        )}
      </AnimatedMain>
      <div className="hidden lg:block w-4 shrink-0" />

      <SellSheet open={sellOpen} onOpenChange={setSellOpen} onListed={load} />
    </>
  );
}
