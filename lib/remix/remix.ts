/**
 * The remix graph (F10) — client-safe types and the revenue-share maths.
 *
 * `RemixEdge` records one fact: this work was derived from that one. The unique
 * constraint `(kind, derivedId)` means a work has exactly ONE parent, which is
 * what makes both interesting operations tractable — the ancestry walk
 * terminates, and "how much of this sale belongs upstream" is computable
 * without traversing a DAG.
 *
 * The share maths lives here, away from the database, because it is the part
 * that has to be provably total-bounded: no combination of chain depth and
 * price may ever route more coins upstream than the buyer paid.
 */

/** What can be remixed. Matches the `kind` values written to `RemixEdge`. */
export const REMIX_KINDS = ['build', 'theme', 'playlist', 'world', 'level'] as const;
export type RemixKind = (typeof REMIX_KINDS)[number];

/**
 * How far the ancestry walk will follow parents.
 *
 * A cap rather than a full walk because a deep chain is a page-weight problem:
 * a 200-deep lineage renders 200 breadcrumb links and issues 200 queries to
 * build them. Twenty is far past what a reader will look at and still bounds
 * the work. `truncated` on the result says whether anything was cut.
 */
export const MAX_ANCESTRY_DEPTH = 20;

/**
 * The share each ancestor level receives, nearest parent first.
 *
 * Decaying and finite on purpose. The direct parent did the work the remix is
 * built on; a great-great-grandparent's contribution is real but diffuse, and
 * paying it forever would make a long chain's tax approach the sale price. Three
 * levels totalling 17.5% is a deliberate ceiling — see `remixShares`, which
 * enforces it rather than trusting this table.
 */
export const REMIX_SHARE_RATES: readonly number[] = [0.1, 0.05, 0.025];

/** Hard ceiling on the fraction of a sale that may be routed upstream. */
export const MAX_TOTAL_REMIX_SHARE = 0.25;

export interface AncestorRef {
  /** The work's id at this level. */
  id: string;
  /** Who authored it — the payee for a revenue share. */
  authorId: string;
}

export interface RemixShare {
  userId: string;
  coins: number;
}

export interface Ancestry {
  /** Nearest parent first, farthest last. Empty for an original work. */
  ancestors: AncestorRef[];
  /** True when the chain was longer than `MAX_ANCESTRY_DEPTH`. */
  truncated: boolean;
}

/**
 * Split `price` into the payouts owed to a remix's ancestors.
 *
 * Guarantees, all of which are tested:
 *  - never pays `sellerId` (a kickback to yourself is a no-op that would still
 *    write two ledger rows and inflate reported earnings);
 *  - one payout per distinct author, even if the same person authored several
 *    links in the chain;
 *  - the total is bounded by `MAX_TOTAL_REMIX_SHARE * price` and can never
 *    exceed `price`, whatever the chain looks like;
 *  - integer coins only, and payouts that round to zero are dropped rather than
 *    written as empty rows.
 */
export function remixShares(
  price: number,
  ancestors: readonly AncestorRef[],
  sellerId: string,
): RemixShare[] {
  if (!Number.isFinite(price) || price <= 0) return [];

  const byUser = new Map<string, number>();
  for (let i = 0; i < ancestors.length && i < REMIX_SHARE_RATES.length; i++) {
    const { authorId } = ancestors[i];
    if (authorId === sellerId) continue;
    const coins = Math.floor(price * REMIX_SHARE_RATES[i]);
    if (coins <= 0) continue;
    byUser.set(authorId, (byUser.get(authorId) ?? 0) + coins);
  }

  const shares = [...byUser.entries()].map(([userId, coins]) => ({ userId, coins }));

  // The ceiling is enforced here rather than assumed from the rate table, so a
  // future edit to the rates cannot silently start over-paying. Scaling down
  // preserves the relative split.
  const cap = Math.floor(price * MAX_TOTAL_REMIX_SHARE);
  const total = shares.reduce((sum, s) => sum + s.coins, 0);
  if (total > cap) {
    const scale = cap / total;
    return shares
      .map((s) => ({ userId: s.userId, coins: Math.floor(s.coins * scale) }))
      .filter((s) => s.coins > 0);
  }

  return shares;
}

/** Total coins routed upstream for a sale — what the seller does NOT receive. */
export function totalRemixShare(shares: readonly RemixShare[]): number {
  return shares.reduce((sum, s) => sum + s.coins, 0);
}
