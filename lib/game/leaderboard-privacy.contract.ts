/**
 * Contracts for /api/settings/leaderboard-privacy (sprint 05 #01). Client-safe: types come from the
 * zod schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { leaderboardPrivacySchema, setLeaderboardPrivacyBody } from '@/lib/game/leaderboard-privacy-schema';

type LeaderboardPrivacy = z.infer<typeof leaderboardPrivacySchema>;

export const getLeaderboardPrivacyApi = endpoint<{ res: LeaderboardPrivacy }>()({
  method: 'GET',
  path: '/api/settings/leaderboard-privacy',
});

export const setLeaderboardPrivacyApi = endpoint<{
  body: z.infer<typeof setLeaderboardPrivacyBody>;
  res: LeaderboardPrivacy;
}>()({ method: 'PUT', path: '/api/settings/leaderboard-privacy' });
