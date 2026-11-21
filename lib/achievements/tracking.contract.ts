/** Contracts for /api/achievements/tracked (feature 19). Client-safe: types only, no zod at runtime. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { trackedState } from '@/lib/achievements/tracking-schema';

type TrackedState =
  z.infer<
    typeof trackedState
  >;

/** The caller's tracked achievements. */
export const getTrackedAchievementsApi =
  endpoint<{
    res: TrackedState;
  }>()(
    {
      method:
        'GET',
      path: '/api/achievements/tracked',
    },
  );

/**
 * Track one. Idempotent. 404 for an unknown or secret id, 409 `{ error, code: 'unlocked' }` once it is unlocked and
 * 409 `{ error, code: 'limit' }` when five are already tracked.
 */
export const trackAchievementApi =
  endpoint<{
    res: TrackedState;
  }>()(
    {
      method:
        'PUT',
      path: '/api/achievements/tracked/$achievementId',
    },
  );

/** Stop tracking one. Idempotent. */
export const untrackAchievementApi =
  endpoint<{
    res: TrackedState;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/achievements/tracked/$achievementId',
    },
  );
