/**
 * MarketColumn — the player-to-player marketplace surface.
 *
 * The "Market" tab of `/store`. Anatomy: a filter row (item, sort, and Sell at its end), the
 * recent-sales line when one item is picked, then the same product grid the shop draws, each tile
 * opening `ListingDialog`, which holds the one action. Owns the client state and the refetch
 * against `/api/market/listings`; SSR data is seeded by the route loader
 * (`browse({ sort: 'recent' })`, the viewer id and the viewer's balance).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { useSession } from '@/components/Providers';
import { getShopItem } from '@/lib/shop/catalog';
import { ListingDialog, sellerLabel } from '@/components/market/ListingDialog';
import { CoinAmount } from '@/components/shop/CoinAmount';
import { ItemPicture } from '@/components/shop/ItemPicture';
import { PRODUCT_GRID, ProductTile } from '@/components/shop/ProductTile';
import { RarityMark } from '@/components/shop/RarityMark';
import { WatchControl } from '@/components/discovery/WatchControl';
import { SellSheet } from '@/components/market/SellSheet';
import { api } from '@/lib/contract/client';
import { browseListingsApi,
  type MarketListingView,
  type PriceHistoryView,
} from '@/lib/market/market.contract';


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

export function MarketColumn({
  initialListings,
  viewerId,
  coins,
}: {
  initialListings: MarketListingView[];
  viewerId: string | null;
  /** The viewer's coin balance; null when signed out. */
  coins: number | null;
}) {
  const { t } = useTranslation('site');
  const { data: session } = useSession();
  const router = useRouter();

  const [listings, setListings] = useState<MarketListingView[]>(initialListings);
  const [sort, setSort] = useState<'recent' | 'price_asc' | 'price_desc'>('recent');
  const [itemFilter, setItemFilter] = useState<string>('');
  const [history, setHistory] = useState<PriceHistoryView | null>(null);
  const [loading, setLoading] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const currentUserId = session?.user.id ?? viewerId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(browseListingsApi, {
        query: itemFilter ? { sort, item: itemFilter } : { sort },
      }).catch(() => ({ listings: [] as MarketListingView[], history: null }));
      setListings(data.listings ?? []);
      setHistory(data.history ?? null);
    } finally {
      setLoading(false);
    }
  }, [sort, itemFilter]);

  // Refetch on filter/sort change (skip the very first render — props seeded it).
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    load();
  }, [load]);

  // A buy or a cancel moves coins and inventory, which the header's balance and the Shop tab read
  // from the route loader.
  const onDone = useCallback(
    (id: string) => {
      setOpenId(null);
      setListings((prev) => prev.filter((l) => l.id !== id));
      void router.invalidate();
    },
    [router],
  );

  // Items that currently have listings — a manageable filter set.
  const filterOptions = useMemo(() => {
    const ids = Array.from(new Set(initialListings.map((l) => l.itemId)));
    return ids
      .map((id) => ({ id, name: getShopItem(id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [initialListings]);

  const filteredName = itemFilter ? (getShopItem(itemFilter)?.name ?? itemFilter) : null;
  const open = openId ? (listings.find((l) => l.id === openId) ?? null) : null;

  return (
    <div className="flex flex-col gap-4 pt-4">
      <div data-slot="page-controls" className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Select
          value={itemFilter}
          onChange={(e) => setItemFilter(e.target.value)}
          aria-label={t('market-filter-item', { defaultValue: 'Filter by item' })}
          className="w-auto min-w-36"
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
          className="w-auto min-w-36"
        >
          <option value="recent">{t('market-sort-recent', { defaultValue: 'Newest' })}</option>
          <option value="price_asc">
            {t('market-sort-price-asc', { defaultValue: 'Price: low to high' })}
          </option>
          <option value="price_desc">
            {t('market-sort-price-desc', { defaultValue: 'Price: high to low' })}
          </option>
        </Select>
        {session ? (
          <Button variant="default" className="ms-auto" onClick={() => setSellOpen(true)}>
            {t('market-sell-item', { defaultValue: 'Sell an item' })}
          </Button>
        ) : null}
      </div>

      {itemFilter ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-site-border py-3">
          {history && history.count > 0 ? (
            <div className="flex min-w-0 items-center gap-4">
              <div className="min-w-0">
                <p className="t-body truncate font-medium text-site-text">
                  {t('market-history-heading', {
                    name: filteredName,
                    defaultValue: '{{name}} · recent sales',
                  })}
                </p>
                <p className="t-meta">
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
          ) : (
            <p className="t-body text-site-text-muted">
              {t('market-history-none', {
                name: filteredName,
                defaultValue: '{{name}} has no recorded sales yet.',
              })}
            </p>
          )}
          <WatchControl kind="market" targetId={itemFilter} />
        </div>
      ) : null}

      {loading ? (
        <div className="flex justify-center py-20">
          <Spinner />
        </div>
      ) : listings.length === 0 ? (
        <EmptyState
          title={t('market-empty-title', { defaultValue: 'No listings yet' })}
          description={t('market-empty-text', {
            defaultValue: 'Nothing is for sale right now. If you own a tradable cosmetic, list it.',
          })}
          action={
            session ? (
              <Button variant="default" onClick={() => setSellOpen(true)}>
                {t('market-sell-item', { defaultValue: 'Sell an item' })}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={PRODUCT_GRID}>
          {listings.map((listing) => {
            const isOwn = !!currentUserId && listing.seller.id === currentUserId;
            return (
              <ProductTile
                key={listing.id}
                onOpen={() => setOpenId(listing.id)}
                picture={
                  <ItemPicture kind={listing.item?.kind ?? null} art={listing.item?.data ?? {}} />
                }
                name={listing.item?.name ?? listing.itemId}
                detail={listing.item ? <RarityMark rarity={listing.item.rarity} /> : undefined}
                trailing={<CoinAmount amount={listing.priceCoins} className="text-site-text" />}
                footer={
                  listing.status === 'HELD' ? (
                    t('market-under-review', { defaultValue: 'Under review' })
                  ) : isOwn ? (
                    t('market-your-listing', { defaultValue: 'Your listing' })
                  ) : (
                    <span dir="ltr">
                      {sellerLabel(listing, t('market-seller', { defaultValue: 'Seller' }))}
                    </span>
                  )
                }
              />
            );
          })}
        </div>
      )}

      <ListingDialog
        listing={open}
        onOpenChange={(next) => {
          if (!next) setOpenId(null);
        }}
        viewerId={currentUserId}
        coins={currentUserId ? coins : null}
        onDone={onDone}
      />
      <SellSheet open={sellOpen} onOpenChange={setSellOpen} onListed={load} />
    </div>
  );
}
