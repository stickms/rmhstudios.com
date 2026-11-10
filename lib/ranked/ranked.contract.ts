/**
 * Contracts for /api/ranked/** (redesign audit C1, batch 8): the overview, a
 * game's ladder, issuing a challenge and acting on one. Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { RankedChallengeRow, RankedOverview } from '@/lib/ranked.server';
import type { RankTier } from '@/lib/ranked/tiers';

/** The viewer's ratings plus pending / active challenges (the games list alone when signed out). */
export const getRankedOverviewApi = endpoint<{ res: RankedOverview }>()({
  method: 'GET',
  path: '/api/ranked',
});

/** Issue a challenge. `opponent` is a user id or handle. */
export const createRankedChallengeApi = endpoint<{
  body: { game: string; opponent: string };
  res: { success: true; id: string };
}>()({ method: 'POST', path: '/api/ranked' });

export interface RankedLadderRow {
  rank: number;
  rating: number;
  tier: RankTier;
  wins: number;
  losses: number;
  draws: number;
  /** The route can answer `null` for a season entry whose account is gone; callers render rows as present. */
  user: RankedChallengeRow['user'];
}

/** A game's ladder. The query is the schema's output, so the default scope is spelled out by callers. */
export const getRankedLadderApi = endpoint<{
  params: { game: string };
  query: { scope: 'season' | 'lifetime' };
  res: { game: string; gameName: string; scope: 'season' | 'lifetime'; leaderboard: RankedLadderRow[] };
}>()({ method: 'GET', path: '/api/ranked/$game/leaderboard' });

export type RankedChallengeAction =
  | { action: 'accept' }
  | { action: 'decline' }
  | { action: 'report'; result: 'win' | 'loss' | 'draw' };

/** Accept / decline (opponent only) or report a result (either participant). */
export const actOnRankedChallengeApi = endpoint<{
  params: { id: string };
  body: RankedChallengeAction;
  res: { success: true };
}>()({ method: 'POST', path: '/api/ranked/challenge/$id' });
