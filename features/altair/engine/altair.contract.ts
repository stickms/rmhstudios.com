/**
 * Contracts for the /api/altair/** calls (redesign audit C1, batches 6 and 10):
 * the reads, the solo-run start / finish / status calls, the meta-progression
 * sync and the legacy score intake. Client-safe. The keepalive sends (`run/finish`,
 * `meta`, `score`) pass `keepalive: true`; the unload `sendBeacon` for `score`
 * stays a beacon, which is not a fetch.
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
export const getAltairLeaderboardApi =
  endpoint<{
    query: {
      type?:
        | string
        | undefined;
    };
    res: AltairLeaderboardEntry[];
  }>()(
    {
      method:
        'GET',
      path: '/api/altair/leaderboard',
    },
  );

/** The highest Heat tier the caller may start (0 when signed out). */
export const getAltairHeatApi =
  endpoint<{
    res: {
      unlocked: number;
      max: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/altair/heat',
    },
  );

/** Ask the server to issue a seeded single-player run. */
export const startAltairRunApi =
  endpoint<{
    body: {
      classId: string;
      doubleTime?:
        | boolean
        | undefined;
      heat?:
        | number
        | undefined;
    };
    res: IssuedRun;
  }>()(
    {
      method:
        'POST',
      path: '/api/altair/run/start',
    },
  );

/** Where a submitted run is: submitted | verified | rejected | unverified. */
export const getAltairRunStatusApi =
  endpoint<{
    query: {
      runId: string;
    };
    res: {
      status: string;
      coins: number;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/altair/run/status',
    },
  );

/** The persisted meta-progression: what the client saves and what the server returns. */
export interface AltairMetaProgress {
  coins: number;
  upgrades: Record<
    string,
    number
  >;
  unlockedClasses: string[];
  doubleTimeUnlocked: boolean;
  classFirstClears: string[];
  totalRunsPlayed: number;
  bestTimeSurvived: number;
  bestKills: number;
  bossesDefeated: string[];
  bestiary: Record<
    string,
    {
      encountered: number;
      killed: number;
      killedBy: number;
    }
  >;
}

/** The caller's saved meta-progression (`data: null` before the first save). */
export const getAltairMetaApi =
  endpoint<{
    res: {
      data: AltairMetaProgress | null;
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/altair/meta',
    },
  );

/**
 * Save the meta-progression. The balance is a claim the server reconciles, so `coins`
 * in the reply is the authoritative one. Send `x-altair-verified-runs: 1` (and, for a
 * run the server could not verify, `x-altair-fallback-run`) as headers.
 */
export const saveAltairMetaApi =
  endpoint<{
    body: AltairMetaProgress;
    res: {
      success: true;
      coins: number;
      clamped: boolean;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/altair/meta',
    },
  );

/** Hand in a finished (or abandoned) run. Answers 202 `queued | inline | unverified`, 200 `duplicate`. */
export const finishAltairRunApi =
  endpoint<{
    body: {
      runId: string;
      log: {
        enc:
          | 'gzip-b64'
          | 'json';
        data: string;
      };
      claim: {
        victory: boolean;
        kills: number;
        level: number;
        finalCoins: number;
      };
    };
    res: {
      status?: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/altair/run/finish',
    },
  );

/** The legacy self-reported score intake (old clients and the unverified-run fallback). */
export const submitAltairScoreApi =
  endpoint<{
    body: {
      timeSurvived: number;
      kills: number;
      totalXP: number;
      gold?: number;
    };
    res: {
      success: true;
      linked?: true;
      created?: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/altair/score',
    },
  );
