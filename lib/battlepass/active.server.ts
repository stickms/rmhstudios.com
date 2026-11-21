/**
 * The running season, with its XP curve scaled to how the site actually plays.
 *
 * The scale is measured on the previous season: the 75th-percentile season XP
 * among players who earned any, divided by what the unscaled pass costs
 * (`BASE_SEASON_XP`), so a typical engaged player can finish the pass. A season
 * that has ended never changes (`awardXp` only writes the current season), so
 * the scale is fixed for the whole of the season it applies to, which is what
 * lets the claim endpoint trust a tier it re-derives. Rounded to 0.05 so a
 * late straggler write cannot move a threshold by a point.
 *
 * Season 1 is never a sample: until seasons were generated, its rows kept
 * collecting XP after it ended, so its totals are not one season's worth.
 * With no usable sample (too few players, or no rows), the scale is 1.
 */
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import {
  BASE_SEASON_XP,
  buildSeason,
  clampXpScale,
  seasonIdFor,
  seasonNumberAt,
  type Season,
} from '@/lib/battlepass/season';

/** Fewer players than this and the percentile says more about them than the site. */
const MIN_SAMPLE = 20;
const SCALE_TTL_MS = 6 * 60 * 60_000;

async function measureScale(previous: number): Promise<number> {
  if (previous < 2) return 1;
  const rows = await prisma.$queryRaw<{ p75: number | null; players: bigint }[]>`
    SELECT percentile_cont(0.75) WITHIN GROUP (ORDER BY "seasonXp")::float8 AS p75,
           COUNT(*) AS players
    FROM "user_season_progress"
    WHERE "seasonId" = ${seasonIdFor(previous)} AND "seasonXp" > 0`;
  const row = rows[0];
  if (!row || row.p75 == null || Number(row.players) < MIN_SAMPLE) return 1;
  return Math.round(clampXpScale(row.p75 / BASE_SEASON_XP) * 20) / 20;
}

/** The XP scale for season `n`, from season `n - 1`. */
export async function seasonXpScale(n: number): Promise<number> {
  // A failed read answers 1 for this request but is not remembered, so one bad
  // query cannot pin the wrong curve for hours.
  const scale = await cached(`battlepass:scale:${n}`, SCALE_TTL_MS, () => measureScale(n - 1).catch(() => null), {
    shouldCache: (v) => v != null,
  });
  return scale ?? 1;
}

/** The running season's full definition (tiers, rewards, scaled XP). */
export async function getActiveSeason(at: Date | number = Date.now()): Promise<Season> {
  const n = seasonNumberAt(at);
  return buildSeason(n, await seasonXpScale(n));
}
