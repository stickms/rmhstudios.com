/** Contracts for buying and cancelling market listings (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { Rarity, ShopItemKind } from '@/lib/shop/catalog';

/** 200 SOLD, or 202 HELD (flagged for review, no coins moved). */
export const buyListingApi = endpoint<{
  res:
    | { success: true; status: 'SOLD'; itemId: string; price: number }
    | { status: 'HELD'; message: string };
}>()({ method: 'POST', path: '/api/market/listings/$id/buy' });

export const cancelListingApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/market/listings/$id',
});

export interface MarketListingView {
  id: string;
  itemId: string;
  priceCoins: number;
  /**
   * HELD = frozen for admin review after an anomalously priced buy. The API only
   * returns HELD listings to their own seller. Absent on older payloads (ACTIVE).
   */
  status?: 'ACTIVE' | 'HELD';
  createdAt: string;
  item: {
    id: string;
    name: string;
    kind: ShopItemKind;
    rarity: Rarity;
    data: { color?: string; gradient?: string; emoji?: string };
  } | null;
  seller: { id: string; name: string | null; handle: string | null; image: string | null };
}

/** The sold-price history that rides along when a browse is filtered to one item. */
export interface PriceHistoryView {
  sales: { price: number; at: string }[];
  count: number;
  low: number | null;
  high: number | null;
  average: number | null;
}

/** Browse active listings (public; a signed-in seller also sees their own HELD ones). */
export const browseListingsApi = endpoint<{
  query: { sort?: 'recent' | 'price_asc' | 'price_desc'; item?: string };
  res: { listings: MarketListingView[]; history: PriceHistoryView | null };
}>()({ method: 'GET', path: '/api/market/listings' });

/** List one of your tradable items. A refusal answers `{ error, code }`. */
export const createListingApi = endpoint<{
  body: { itemId: string; priceCoins: number };
  res: { success: true; listing: unknown };
}>()({ method: 'POST', path: '/api/market/listings' });
