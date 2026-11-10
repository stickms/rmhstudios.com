/**
 * Contracts for the /api/altair/** reads and the solo-run start/status calls
 * (redesign audit C1, batch 6). Client-safe. `run/finish` (a keepalive body that
 * can outlive the page) and `score` (a legacy beacon) stay raw fetches.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { IssuedRun } from '@features/altair/engine/solo/issue.server';

export interface AltairLeaderboardEntry {
  username: string;
  bestTime: number;
  totalKills: number;
  totalXP: number;
  totalGold: number;
  totalTimeSurvived: number;
  gamesPlayed: number;
}

/** The top ten for a category (`time` when `type` is absent or unknown). */
export const getAltairLeaderboardApi = endpoint<{
  query: { type?: string | undefined };
  res: AltairLeaderboardEntry[];
}>()({ method: 'GET', path: '/api/altair/leaderboard' });

/** The highest Heat tier the caller may start (0 when signed out). */
export const getAltairHeatApi = endpoint<{ res: { unlocked: number; max: number } }>()({
  method: 'GET',
  path: '/api/altair/heat',
});

/** Ask the server to issue a seeded single-player run. */
export const startAltairRunApi = endpoint<{
  body: { classId: string; doubleTime?: boolean | undefined; heat?: number | undefined };
  res: IssuedRun;
}>()({ method: 'POST', path: '/api/altair/run/start' });

/** Where a submitted run is: submitted | verified | rejected | unverified. */
export const getAltairRunStatusApi = endpoint<{
  query: { runId: string };
  res: { status: string; coins: number };
}>()({ method: 'GET', path: '/api/altair/run/status' });
