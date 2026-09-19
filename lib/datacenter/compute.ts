/**
 * What RMH Datacenter sells, and for how much (W2). Pure and client-safe.
 *
 * ## Why this is priced in a file rather than a table
 *
 * A price list is a product decision made a few times a year, not member data.
 * Putting it in a row means an admin screen, a migration and a cache for
 * something that changes less often than the code around it does. If a price
 * ever needs to move hourly, L4's live-ops console is where that belongs.
 *
 * ## How the prices were chosen
 *
 * Compute is the one sink whose price can be set honestly, because providing
 * it costs the platform real money. Each pack is priced so that a member
 * buying it costs the platform meaningfully less than the coins are worth at
 * the shop's own rates — the point is to remove coins from circulation (W7),
 * not to sell AI at a loss to whoever farms the most.
 */

/** A thing you can buy from the datacenter. */
export interface ComputePack {
  id: string;
  /** English name; the page runs its own `t()` keys. */
  name: string;
  coins: number;
  /** Extra AI allowance, micro-dollars. Matches `AiUsage.costMicros`. */
  aiMicros: number;
  imageGens: number;
  librarySlots: number;
}

export const COMPUTE_PACKS: readonly ComputePack[] = [
  {
    id: 'burst',
    name: 'Burst',
    coins: 500,
    aiMicros: 250_000, // doubles the free tier's month
    imageGens: 10,
    librarySlots: 0,
  },
  {
    id: 'rack',
    name: 'Rack',
    coins: 2_000,
    aiMicros: 1_200_000,
    imageGens: 50,
    librarySlots: 5,
  },
  {
    id: 'hall',
    name: 'Hall',
    coins: 7_500,
    aiMicros: 5_000_000,
    imageGens: 200,
    librarySlots: 25,
  },
] as const;

export function packById(id: string): ComputePack | undefined {
  return COMPUTE_PACKS.find((p) => p.id === id);
}

/**
 * Most packs a member may hold in one month.
 *
 * A ceiling rather than a rationing device: without one, somebody with a large
 * balance can convert it into an unbounded provider bill in a single afternoon,
 * and the first anybody knows is the invoice. This is the same argument
 * `MONTHLY_BUDGET_MICROS` makes, applied to the thing that raises it.
 */
export const MAX_PACKS_PER_MONTH = 10;

/** `YYYY-MM` for a date, in UTC — the window a grant belongs to. */
export function monthKey(at: Date = new Date()): string {
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Sum a member's grants for display and for the budget. */
export function totalGrants(
  grants: readonly { aiMicros: number; imageGens: number; librarySlots: number }[],
): { aiMicros: number; imageGens: number; librarySlots: number } {
  return grants.reduce(
    (acc, g) => ({
      aiMicros: acc.aiMicros + g.aiMicros,
      imageGens: acc.imageGens + g.imageGens,
      librarySlots: acc.librarySlots + g.librarySlots,
    }),
    { aiMicros: 0, imageGens: 0, librarySlots: 0 },
  );
}

/**
 * A capacity reading, 0–1, for a meter on the datacenter page.
 *
 * Clamped, because a meter that can read 140% is a meter nobody believes. Over
 * capacity reads as full — which is true, and is the thing the member needs to
 * know.
 */
export function utilisation(used: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(1, Math.max(0, used / capacity));
}
