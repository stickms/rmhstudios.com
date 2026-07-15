// Client-safe tunables shared by wager matches and tournaments. Kept out of the
// `.server` modules so the UI can import limits for validation/display.

/** Minimum coins a player can stake on a wager. */
export const MIN_WAGER_STAKE = 5;
/** Maximum coins a player can stake on a wager. */
export const MAX_WAGER_STAKE = 100_000;

/** Rake taken from a settled wager pot, in basis points (250 = 2.5%). Sink. */
export const WAGER_RAKE_BPS = 250;

/** How long an unaccepted challenge stays open before it auto-refunds. */
export const WAGER_DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24h
export const WAGER_MIN_EXPIRY_MS = 5 * 60 * 1000; // 5m
export const WAGER_MAX_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d

/** Tournament sizing + economics. */
export const MIN_TOURNAMENT_PLAYERS = 2;
export const MAX_TOURNAMENT_PLAYERS = 64;
export const MAX_TOURNAMENT_ENTRY_FEE = 100_000;
export const MAX_TOURNAMENT_SEED = 1_000_000;
/** Rake taken from a tournament prize pool, in basis points. Sink. */
export const TOURNAMENT_RAKE_BPS = 500; // 5%

/**
 * Prize distribution by placement, in basis points of the post-rake pool, keyed
 * by entrant count bucket. Must each sum to 10_000. The bracket engine picks the
 * closest bucket <= entrant count.
 */
export const TOURNAMENT_PAYOUT_SPLITS: Record<number, number[]> = {
  2: [10_000], // winner takes all
  4: [7_000, 3_000], // 1st / 2nd
  8: [6_000, 3_000, 1_000], // 1st / 2nd / semis
  16: [5_000, 2_500, 1_250, 1_250],
};

/** Compute a rake amount (floored) from a pot and bps. */
export function rakeOf(pot: number, bps: number): number {
  return Math.floor((pot * bps) / 10_000);
}
