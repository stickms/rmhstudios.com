/**
 * Leaderboard privacy — the pure half (sprint 05 #01).
 *
 * Who is left off a public game board is decided in `leaderboard-privacy.server.ts` (a member who
 * turned the switch off, and a member who is banned right now). What is done with that set is
 * here, with no database in it: the over-read that makes room for the hidden rows, the re-rank over
 * what remains, and the where-fragments the boards that filter in the query use.
 *
 * Rows with `userId: null` are legacy anonymous scores: they belong to no member, so nobody has
 * hidden them, and they stay listed.
 */

/** Most ids the hidden set holds. A board filters on at most this many. */
export const HIDDEN_ID_CAP = 5_000;

/** Most extra rows a board reads to make room for hidden ones. */
export const OVERFETCH_CAP = 200;

/** A board row that belongs to a member, or to nobody (a legacy anonymous score). */
export interface OwnedRow {
  userId: string | null;
}

/**
 * How many rows to read so `limit` survive after the hidden ones are dropped:
 * `limit + hidden`, never more than `limit + OVERFETCH_CAP`.
 */
export function fetchSize(limit: number, hiddenCount: number): number {
  return limit + Math.min(Math.max(hiddenCount, 0), OVERFETCH_CAP);
}

/**
 * Drop the hidden members from an ordered board and rank what is left from 1, with no gaps. Keeps
 * at most `take` rows. Rows with a null `userId` stay.
 */
export function excludeHidden<T extends OwnedRow>(
  rows: readonly T[],
  hidden: ReadonlySet<string>,
  take: number,
): Array<T & { rank: number }> {
  const kept: Array<T & { rank: number }> = [];
  for (const row of rows) {
    if (kept.length >= take) break;
    if (row.userId !== null && hidden.has(row.userId)) continue;
    kept.push({ ...row, rank: kept.length + 1 });
  }
  return kept;
}

/** Where-fragment for a table whose `userId` may be null: everything except the hidden members. */
export function notHiddenWhere(hidden: ReadonlySet<string>): {
  OR?: Array<{ userId: null } | { userId: { notIn: string[] } }>;
} {
  if (hidden.size === 0) return {};
  return { OR: [{ userId: null }, { userId: { notIn: [...hidden] } }] };
}

/** Where-fragment for a table whose `userId` is required: everything except the hidden members. */
export function userNotHiddenWhere(hidden: ReadonlySet<string>): {
  userId?: { notIn: string[] };
} {
  if (hidden.size === 0) return {};
  return { userId: { notIn: [...hidden] } };
}
