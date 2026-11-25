/**
 * RMHHomes — price-change rules (pure, client-safe).
 *
 * The drop rule, the percent, the 30-day window and the 7-day notice rule live here so the two writers (an
 * author's edit and a scraper run), the browse filter and the cards agree on them.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** A drop is a new price below the old one by at least this many percent. */
export const MIN_DROP_PERCENT = 1;
/** "Reduced" and the browse filter look back this many days. */
export const REDUCED_WINDOW_DAYS = 30;
/** A member hears about a drop on one listing at most once in this many days. */
export const NOTICE_INTERVAL_DAYS = 7;
/** Rows the history shows. */
export const HISTORY_LIMIT = 20;
/** Favouriters told about one drop, at most. */
export const MAX_NOTIFIED_FAVOURITERS = 1000;

export type PriceChangeSource = 'author' | 'feed';

/** Whether the price really changed (prices are whole cents; an equal price is not a change). */
export function isPriceChange(oldCents: number, newCents: number): boolean {
  return Number.isFinite(oldCents) && Number.isFinite(newCents) && oldCents !== newCents;
}

/** A drop: new below old by at least 1%. Integer arithmetic, so 1% exactly counts. */
export function isPriceDrop(oldCents: number, newCents: number): boolean {
  if (!(oldCents > 0) || !(newCents >= 0) || newCents >= oldCents) return false;
  return (oldCents - newCents) * 100 >= oldCents * MIN_DROP_PERCENT;
}

/** The change as a percent of the old price, to one decimal (-6.7 for 1,500 to 1,400). 0 when the old price is 0. */
export function percentChange(oldCents: number, newCents: number): number {
  if (!(oldCents > 0)) return 0;
  const pct = Math.round(((newCents - oldCents) / oldCents) * 1000) / 10;
  return pct === 0 ? 0 : pct;
}

/** The start of the "Reduced" window. */
export function reducedSince(now: Date | number): Date {
  const ms = typeof now === 'number' ? now : now.getTime();
  return new Date(ms - REDUCED_WINDOW_DAYS * DAY_MS);
}

/** Whether a drop recorded at `droppedAt` is still inside the window. */
export function isReducedWithin(droppedAt: Date | string | null | undefined, now: Date | number): boolean {
  if (!droppedAt) return false;
  const at = new Date(droppedAt).getTime();
  if (!Number.isFinite(at)) return false;
  const since = reducedSince(now).getTime();
  const end = typeof now === 'number' ? now : now.getTime();
  return at >= since && at <= end;
}

/** How much cheaper the listing is, in cents, when the last change was a drop; otherwise null. */
export function reducedByCents(oldCents: number, newCents: number): number | null {
  return isPriceDrop(oldCents, newCents) ? oldCents - newCents : null;
}

/** The earliest time a member who was told at `noticeAt` may be told again. */
export function nextNoticeAt(noticeAt: Date | null | undefined): Date | null {
  return noticeAt ? new Date(noticeAt.getTime() + NOTICE_INTERVAL_DAYS * DAY_MS) : null;
}

/** Whether a favourite may be sent a drop notice now (never told, or last told 7 or more days ago). */
export function mayNotifyDrop(noticeAt: Date | null | undefined, now: Date | number): boolean {
  const next = nextNoticeAt(noticeAt);
  if (!next) return true;
  const ms = typeof now === 'number' ? now : now.getTime();
  return ms >= next.getTime();
}

/** The cut-off for a conditional update: a row whose `priceNoticeAt` is null or at or before this may be told. */
export function noticeCutoff(now: Date | number): Date {
  const ms = typeof now === 'number' ? now : now.getTime();
  return new Date(ms - NOTICE_INTERVAL_DAYS * DAY_MS);
}

/** One recorded change as the history endpoint returns it. */
export interface PriceChange {
  id: string;
  /** Whole USD dollars. */
  oldPrice: number;
  newPrice: number;
  /** Percent change to one decimal; negative for a drop. */
  percent: number;
  source: PriceChangeSource;
  changedAt: string;
}
