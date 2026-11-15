/**
 * Contracts for /api/streak (redesign audit C1, batch 4). Client-safe: the
 * shape mirrors `StreakState` in `lib/streak.server.ts`, which the routes return.
 */
import { endpoint } from '@/lib/contract/endpoint';

export interface StreakStateView {
  current: number;
  longest: number;
  totalCheckIns: number;
  checkedInToday: boolean;
  /** Coins granted by this call (0 if already checked in). */
  reward: number;
  freezeTokens: number;
  /** Freeze tokens consumed by this check-in to bridge missed days. */
  freezeUsed: number;
}

export const getStreakApi =
  endpoint<{
    res: StreakStateView;
  }>()(
    {
      method:
        'GET',
      path: '/api/streak',
    },
  );

/** Today's check-in (idempotent per day). */
export const checkInStreakApi =
  endpoint<{
    res: StreakStateView;
  }>()(
    {
      method:
        'POST',
      path: '/api/streak',
    },
  );
