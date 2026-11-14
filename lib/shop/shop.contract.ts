/**
 * Contracts for /api/shop/** and /api/history/** (redesign audit C1, batch 2).
 * Client-safe: types only, by `import type`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { HistoryEntityType } from '@/lib/history/constants';
import type { HistoryView } from '@/lib/history/history.server';
import type { SHOP_ITEMS } from '@/lib/shop/catalog';

export type ShopListItem =
  (typeof SHOP_ITEMS)[number] & {
    owned: boolean;
    equipped: boolean;
  };

/** The catalog plus, when signed in, the balance and which items are owned/equipped. */
export const getShopApi =
  endpoint<{
    res: {
      coins: number;
      items: ShopListItem[];
      signedIn: boolean;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/shop',
    },
  );

/**
 * Buy a cosmetic. 400 `Not enough coins`, 403 `Requires the … plan`,
 * 409 `You already own this item`. This route authenticates by hand, so it
 * is not bound with `implement()`; the contract is what the client calls through.
 */
export const purchaseShopItemApi =
  endpoint<{
    body: {
      itemId: string;
    };
    res: {
      success: true;
      newBalance: number;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/shop/purchase',
    },
  );

export const equipShopItemApi =
  endpoint<{
    body: {
      itemId: string;
      equipped: boolean;
    };
    res: {
      success: true;
      equipped: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/shop/equip',
    },
  );

/* ── Watch history ────────────────────────────────────────────────────────── */

export interface HistoryPage {
  items: HistoryView[];
  nextCursor:
    | string
    | null;
  paused: boolean;
}

export const listHistoryApi =
  endpoint<{
    query: {
      type?: HistoryEntityType;
      cursor?: string;
    };
    res: HistoryPage;
  }>()(
    {
      method:
        'GET',
      path: '/api/history',
    },
  );

export const setHistoryPausedApi =
  endpoint<{
    body: {
      paused: boolean;
    };
    res: {
      paused: boolean;
    };
  }>()(
    {
      method:
        'PUT',
      path: '/api/history',
    },
  );

export const clearHistoryApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/history',
    },
  );

export const removeHistoryEntryApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/history/$id',
    },
  );
