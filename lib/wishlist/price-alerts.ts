/**
 * Wishlist price-drop alerts (C8) — the pure decision, no I/O.
 *
 * Steam's wishlist emails, for store and market items. The daily job gathers the
 * facts about one wishlist entry and asks this function whether the member
 * should hear about it, and under what dedupe key. Keeping the decision pure is
 * what makes "notified once, not every day" testable: the key is the whole
 * contract.
 *
 * Reasons, in priority order — a member gets at most ONE notification per entry
 * per run, the most informative one:
 *
 *   price-drop   the price is lower than the last one this entry saw;
 *   target-met   the price is at or under the member's own target price;
 *   daily-shop   the item is in today's rotating shop.
 *
 * Dedupe keys: `drop:<price>` / `target:<price>` / `daily:<YYYY-MM-DD>`. An entry
 * remembers its last alert key, so the same price level or the same day never
 * alerts twice, while a further drop (a new price) or a later daily-shop
 * appearance (a new date) does.
 */

export type AlertReason = 'price-drop' | 'target-met' | 'daily-shop';

export interface AlertFacts {
  /** Current price in coins, or null when there is none (no live market listing). */
  currentPrice: number | null;
  /** The price this entry saw last time, or null on its first look. */
  lastSeenPrice: number | null;
  targetPrice: number | null;
  inDailyShop: boolean;
  /** UTC `YYYY-MM-DD`. */
  dateKey: string;
  /** The member already owns the item — nothing to tell them. */
  owned: boolean;
  lastAlertKey: string | null;
}

export interface AlertDecision {
  reason: AlertReason;
  key: string;
}

export function decideAlert(f: AlertFacts): AlertDecision | null {
  if (f.owned) return null;

  const candidates: AlertDecision[] = [];
  if (f.currentPrice !== null) {
    if (f.lastSeenPrice !== null && f.currentPrice < f.lastSeenPrice) {
      candidates.push({ reason: 'price-drop', key: `drop:${f.currentPrice}` });
    }
    if (f.targetPrice !== null && f.currentPrice <= f.targetPrice) {
      candidates.push({ reason: 'target-met', key: `target:${f.currentPrice}` });
    }
  }
  if (f.inDailyShop) candidates.push({ reason: 'daily-shop', key: `daily:${f.dateKey}` });

  return candidates.find((c) => c.key !== f.lastAlertKey) ?? null;
}

/** The notification text for a decision. */
export function alertPreview(reason: AlertReason, itemName: string, price: number | null): string {
  switch (reason) {
    case 'price-drop':
      return `${itemName} dropped to ${price} coins`;
    case 'target-met':
      return `${itemName} is at ${price} coins — within your target price`;
    case 'daily-shop':
      return `${itemName} is in today's shop`;
  }
}
