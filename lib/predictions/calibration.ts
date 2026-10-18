/**
 * Forecaster calibration — pure and client-safe.
 * Feature idea G7 in docs/plans/2026-10-12-feature-ideas-every-surface.md.
 *
 * Metaculus and Manifold both show a member's calibration: of the things you
 * said were 70% likely, did about 70% happen? Profit alone rewards whoever
 * had the most coins to move the LMSR price; calibration rewards being right
 * about how sure to be, which is the skill a prediction market exists to
 * surface.
 *
 * Inputs are a member's probability at the time they last traded each
 * resolved binary market (the implied probability of the side they hold) and
 * the outcome. Outputs:
 *
 *   • Brier score — mean squared error, 0 is perfect, 0.25 is a coin flip.
 *   • A calibration curve — forecasts bucketed into deciles, each with the
 *     mean forecast and the observed frequency. Perfect calibration is the
 *     diagonal; the UI draws both.
 *   • A Brier skill score against always answering 50%, which is the number
 *     that is honest to put on a leaderboard (raw Brier rewards forecasting
 *     only easy questions).
 *
 * A curve with fewer than MIN_FOR_PROFILE forecasts is reported but flagged,
 * because three lucky calls is not a calibration profile.
 */

export interface Forecast {
  /** Probability assigned to YES, 0–1. */
  p: number;
  /** Did YES happen? */
  outcome: boolean;
}

export interface Bucket {
  /** Inclusive lower edge, e.g. 0.7 for the 70–80% bucket. */
  from: number;
  to: number;
  count: number;
  meanForecast: number;
  observed: number;
}

export interface Calibration {
  n: number;
  brier: number;
  /** 1 − brier / 0.25. Positive beats a coin flip. */
  skill: number;
  buckets: Bucket[];
  enough: boolean;
}

export const MIN_FOR_PROFILE = 20;
const BINS = 10;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export function calibrate(forecasts: readonly Forecast[]): Calibration {
  const valid = forecasts.filter((f) => Number.isFinite(f.p));
  const n = valid.length;
  if (n === 0) return { n: 0, brier: 0, skill: 0, buckets: [], enough: false };

  let sq = 0;
  const sums = Array.from({ length: BINS }, () => ({ count: 0, p: 0, yes: 0 }));
  for (const f of valid) {
    const p = clamp01(f.p);
    const o = f.outcome ? 1 : 0;
    sq += (p - o) ** 2;
    const bin = Math.min(BINS - 1, Math.floor(p * BINS));
    const s = sums[bin]!;
    s.count++;
    s.p += p;
    s.yes += o;
  }
  const brier = sq / n;
  const buckets = sums.flatMap((s, i) =>
    s.count === 0
      ? []
      : [
          {
            from: i / BINS,
            to: (i + 1) / BINS,
            count: s.count,
            meanForecast: s.p / s.count,
            observed: s.yes / s.count,
          },
        ],
  );
  return { n, brier, skill: 1 - brier / 0.25, buckets, enough: n >= MIN_FOR_PROFILE };
}
