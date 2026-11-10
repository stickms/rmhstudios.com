/** Contracts for Gabriel's Horn reads and the house-rule balancer (redesign audit C1, batch 7). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { HornLeaderboardRow } from '@/app/routes/api/gabriels-horn/leaderboard';
import type { HouseRuleProposal } from '@/app/routes/api/gabriels-horn/house-rule';

export const hornLeaderboardApi = endpoint<{
  query: { limit?: number };
  res: { rows: HornLeaderboardRow[] };
}>()({ method: 'GET', path: '/api/gabriels-horn/leaderboard' });

/** Ask the balancer (model, or the deterministic fallback) to propose rule changes. */
export const proposeHouseRuleApi = endpoint<{
  body: { prompt: string; current: unknown; state: unknown };
  res: HouseRuleProposal;
}>()({ method: 'POST', path: '/api/gabriels-horn/house-rule' });

/** The signed-in player's career table-read (a guest gets 401). */
export const getTableReadApi = endpoint<{
  res: { career: Record<string, number> | null };
}>()({ method: 'GET', path: '/api/gabriels-horn/table-read' });
