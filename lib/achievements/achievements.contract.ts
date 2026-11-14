/** Contract for a member's achievements (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { StripAchievement } from '@/lib/achievements/strip';

/** 404 `{ error }` for an unknown member. */
export const getUserAchievementsApi =
  endpoint<{
    res: {
      stats: {
        unlocked: number;
      };
      achievements: StripAchievement[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/achievements/$userId',
    },
  );
