/**
 * Tournament seeding (s05-18), the pure part: how a field of entrants is put in
 * seed order before the bracket is built. Client-safe (no database, no zod).
 *
 * The bracket engines take entrant ids ordered by seed, so seeding is a
 * function from the field to that order. `orderEntrants` is the whole policy;
 * the server loads its inputs inside the start lock (`seeding.server.ts`).
 */

import { isRankedGame } from '@/lib/ranked/elo';

/** Sign-up order (the default), rating, a random shuffle at start, or the host's own order. */
export const SEEDING_METHODS = ['join', 'rating', 'random', 'manual'] as const;
export type SeedingMethod = (typeof SEEDING_METHODS)[number];

export function isSeedingMethod(value: unknown): value is SeedingMethod {
  return (SEEDING_METHODS as readonly unknown[]).includes(value);
}

/** Rating seeding needs Elo ratings, which only the ranked games have; elsewhere everyone would count as 1000. */
export function ratingSeedingAvailable(gameId: string): boolean {
  return isRankedGame(gameId);
}

/** The rating of a member with none yet: the `EloRating.rating` model default. */
export const DEFAULT_RATING = 1000;

/** A random integer in `[0, maxExclusive)`. Injected so tests are deterministic. */
export type Rng = (maxExclusive: number) => number;

/** Uniform integer from `crypto.getRandomValues`, by rejection so there is no modulo bias. */
export const cryptoRng: Rng = (maxExclusive) => {
  if (!Number.isInteger(maxExclusive) || maxExclusive < 1 || maxExclusive > 2 ** 32) {
    throw new RangeError('maxExclusive must be an integer from 1 to 2^32');
  }
  const limit = 2 ** 32 - (2 ** 32 % maxExclusive);
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % maxExclusive;
  }
};

export interface SeedEntrant {
  id: string;
  userId: string;
}

/**
 * Put `entrants` (given in sign-up order) in seed order, first seed first.
 *
 * - `join`: unchanged.
 * - `rating`: highest rating first; a member missing from `ratings` counts as
 *   `DEFAULT_RATING`; equal ratings keep sign-up order.
 * - `random`: a Fisher-Yates shuffle drawing from `rng`.
 * - `manual`: `manualOrder` (entrant ids) first, exactly as given; ids that are
 *   not in the field or repeat are skipped, and anyone not placed follows in
 *   sign-up order.
 */
export function orderEntrants<E extends SeedEntrant>(
  method: SeedingMethod,
  entrants: readonly E[],
  ratings: ReadonlyMap<string, number> = new Map(),
  manualOrder: readonly string[] = [],
  rng: Rng = cryptoRng,
): E[] {
  switch (method) {
    case 'join':
      return [...entrants];
    case 'rating': {
      const rating = (e: E) => ratings.get(e.userId) ?? DEFAULT_RATING;
      // Array.prototype.sort is stable, so equal ratings keep sign-up order.
      return [...entrants].sort((a, b) => rating(b) - rating(a));
    }
    case 'random': {
      const out = [...entrants];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    }
    case 'manual': {
      const byId = new Map(entrants.map((e) => [e.id, e] as const));
      const placed = new Set<string>();
      const out: E[] = [];
      for (const id of manualOrder) {
        const e = byId.get(id);
        if (!e || placed.has(id)) continue;
        placed.add(id);
        out.push(e);
      }
      for (const e of entrants) if (!placed.has(e.id)) out.push(e);
      return out;
    }
  }
}

/** The host's stored order as an id list: entrants with a `manualSeed`, lowest first, ties by sign-up order. */
export function manualOrderOf(entrants: readonly { id: string; manualSeed: number | null }[]): string[] {
  return entrants
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.manualSeed != null)
    .sort((a, b) => (a.e.manualSeed as number) - (b.e.manualSeed as number) || a.i - b.i)
    .map(({ e }) => e.id);
}

/** What the pre-start view shows: the entrants in the order the start would seed them. */
export interface SeedingView {
  method: SeedingMethod;
  /** The caller is the host or an admin: they see (and may change) a manual order. */
  canManage: boolean;
  entrants: {
    /** `TournamentEntrant.id`. */
    id: string;
    /** The Elo rating for the tournament's game (`rating` method only; null when unrated or not shown). */
    rating: number | null;
    /** The seed the start would give now; null when it is not knowable (random) or not visible (a manual order, to non-hosts). */
    projectedSeed: number | null;
  }[];
}
