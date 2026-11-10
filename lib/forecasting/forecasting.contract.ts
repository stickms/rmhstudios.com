/** Contracts for the /api/forecasting reads (redesign audit C1). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';

export interface CalibrationBucket {
  from: number;
  to: number;
  count: number;
  meanForecast: number;
  observed: number;
}
export interface Calibration {
  n: number;
  brier: number;
  skill: number;
  buckets: CalibrationBucket[];
  enough: boolean;
}
export interface SeasonSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  marketCount: number;
}
export interface SeasonBoard {
  season: SeasonSummary;
  resolvedCount: number;
  leaderboard: {
    userId: string;
    points: number;
    scored: number;
    brier: number;
    user: { name: string | null; handle: string | null } | null;
  }[];
}

/** The caller's own calibration profile. */
export const calibrationApi = endpoint<{ res: { calibration: Calibration | null } }>()({
  method: 'GET',
  path: '/api/forecasting/calibration',
});

/** Season list plus one season's leaderboard (newest by default). */
export const seasonsApi = endpoint<{
  query: { id?: string | undefined };
  res: { seasons: SeasonSummary[]; board: SeasonBoard | null };
}>()({ method: 'GET', path: '/api/forecasting/seasons' });
