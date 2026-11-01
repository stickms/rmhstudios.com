/** Tokens expiring within this many days are flagged "Expires soon". */
export const EXPIRING_SOON_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export type TokenExpiry = 'expired' | 'soon' | 'ok';

/** Where a token stands relative to `now`. A deadline of exactly `now` is expired. */
export function tokenExpiry(expiresAt: string | Date, now: Date = new Date()): TokenExpiry {
  const left = new Date(expiresAt).getTime() - now.getTime();
  if (Number.isNaN(left) || left <= 0) return 'expired';
  return left <= EXPIRING_SOON_DAYS * DAY_MS ? 'soon' : 'ok';
}
