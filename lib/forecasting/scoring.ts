/**
 * Forecast scoring for seasons (G5) and calibration profiles (G7). Pure and
 * client-safe. A member's forecast on a market is the implied P(YES) after
 * their latest trade (`lastP`); positions that predate that column fall back
 * to the average price paid, and a mixed legacy position is skipped.
 */
export interface PositionLike {
  lastP: number | null;
  yesShares: number;
  noShares: number;
  spent: number;
}

const EPS = 0.5;

export function positionForecast(pos: PositionLike): number | null {
  if (pos.lastP != null && Number.isFinite(pos.lastP)) return Math.min(1, Math.max(0, pos.lastP));
  const yes = pos.yesShares > EPS;
  const no = pos.noShares > EPS;
  if (yes === no) return null;
  if (yes) return Math.min(1, Math.max(0, pos.spent / pos.yesShares));
  return Math.min(1, Math.max(0, 1 - pos.spent / pos.noShares));
}

/** Points for one market: positive when the forecast beats a coin flip, 100 max. */
export function marketPoints(p: number, outcomeYes: boolean): number {
  const o = outcomeYes ? 1 : 0;
  return (0.25 - (p - o) ** 2) * 100;
}

export interface SeasonScore {
  userId: string;
  points: number;
  scored: number;
  brier: number;
}

/** Fold per-market forecasts into a ranked leaderboard (points desc, then more markets). */
export function rankSeason(
  rows: readonly { userId: string; p: number; outcomeYes: boolean }[],
): SeasonScore[] {
  const by = new Map<string, { points: number; sq: number; n: number }>();
  for (const r of rows) {
    const e = by.get(r.userId) ?? { points: 0, sq: 0, n: 0 };
    e.points += marketPoints(r.p, r.outcomeYes);
    e.sq += (r.p - (r.outcomeYes ? 1 : 0)) ** 2;
    e.n++;
    by.set(r.userId, e);
  }
  return [...by.entries()]
    .map(([userId, e]) => ({
      userId,
      points: Math.round(e.points * 10) / 10,
      scored: e.n,
      brier: e.sq / e.n,
    }))
    .sort((a, b) => b.points - a.points || b.scored - a.scored);
}
