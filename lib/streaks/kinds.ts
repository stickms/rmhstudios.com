/**
 * The kinds of platform streak stored in the one `Streak` model (client-safe).
 *
 * A row is keyed `(userId, kind)`. Both kinds below are the same concept: a
 * count of consecutive UTC days on which the user did the thing, with the day
 * recorded as a "YYYY-MM-DD" key.
 *
 *  - `daily`  — the account check-in streak (`lib/streak.server.ts`). The only
 *               kind with freezes, which are bought with coins.
 *  - `arcade` — consecutive days with a completed arcade challenge
 *               (`lib/game/results.server.ts`).
 *
 * Streaks deliberately NOT stored here, because they are a different concept:
 *  - RMHType `bestStreak` / RMHBox `bestWinStreak`: consecutive match WINS,
 *    per difficulty for RMHType — not days.
 *  - Doctrine `currentStreak`: grows on every activity inside a rolling 24 h
 *    window (several per day), so it counts actions, not days.
 *  - RMHStudy `currentStreak`: measured in rolling 24 h windows from a
 *    timestamp, written by the socket hub and sorted by an indexed leaderboard
 *    on its own table; moving it means changing what users' study streaks
 *    read as, which is a product change, not a consolidation.
 *  - RMH Music's Daily streak: derived from scored dates, never stored.
 */

export const STREAK_KINDS = ['daily', 'arcade'] as const;
export type StreakKind = (typeof STREAK_KINDS)[number];

/** UTC day key ("YYYY-MM-DD") for an instant. */
export function dayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Whole days from day key `a` to day key `b` (b later ⇒ positive). */
export function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.round((db - da) / 86_400_000);
}

/** The prisma `where` for one streak row. */
export const streakKey = (userId: string, kind: StreakKind) => ({
  userId_kind: { userId, kind },
});
