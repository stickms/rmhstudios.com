/**
 * Coin-tip limits, with no dependencies. `lib/economy/tip-schema.ts` builds the
 * zod contract from these and re-exports them; code that only needs a number
 * (the `/tip` slash command in every conversation) imports them from here so
 * it does not bring zod along.
 */

/** Smallest tip. A tip of zero is a no-op that still writes a ledger row. */
export const TIP_MIN = 1;
/**
 * Largest single tip. Not a balance check — `transferCoins` enforces that
 * atomically inside the UPDATE — just a bound on one transaction, so a slipped
 * decimal point cannot move an entire balance in one click.
 */
export const TIP_MAX = 100_000;
/** Optional note cap. The textarea's `maxLength` reads this, not a literal. */
export const TIP_NOTE_MAX = 280;

/** What a tip can be attached to, for the "tipped your post" notification. */
export const TIP_ENTITY_TYPES = ['rmhark', 'profile'] as const;
export type TipEntityType = (typeof TIP_ENTITY_TYPES)[number];
