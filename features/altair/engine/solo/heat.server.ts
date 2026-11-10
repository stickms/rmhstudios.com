/**
 * Which Heat tiers an account may start (features/altair/engine/data/heat.ts).
 *
 * The answer comes from the SERVER's own ledger of verified victories, never from a number the browser
 * sends: clearing tier N (a verified victory whose issued loadout had heat N) unlocks N+1. Tier 0 is
 * always open. No new column: Heat rides in the loadout JSON the server already stores per run.
 */
import { prisma } from '@/lib/prisma.server';
import { HEAT_MAX, unlockedHeat } from '@features/altair/engine/data/heat';

/** The highest tier among this account's verified victories, or null when it has none. */
export async function highestClearedHeat(userId: string): Promise<number | null> {
  // One aggregate in SQL: a long history of victories must not hide an older, higher clear.
  const rows = await prisma.$queryRaw<{ max: number | null }[]>`
    SELECT MAX(CASE WHEN loadout->>'heat' ~ '^[0-9]+$' THEN (loadout->>'heat')::int ELSE 0 END) AS max
    FROM altair_solo_run
    WHERE "userId" = ${userId} AND status IN ('verified') AND result->>'status' = 'victory'`;
  const max = rows[0]?.max;
  return typeof max === 'number' ? max : null;
}

/** The highest tier this account may start (0 when it has never won). */
export async function maxUnlockedHeat(userId: string): Promise<number> {
  const cleared = await highestClearedHeat(userId);
  return Math.min(HEAT_MAX, unlockedHeat(cleared === null ? [] : [cleared]));
}
