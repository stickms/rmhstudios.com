/**
 * Contracts for /api/tournaments/$id/pickem (redesign audit C1, batch 5).
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { PickRole } from '@/lib/competitive/pickem';

export interface PickemView {
  open: boolean;
  complete: boolean;
  pickerCount: number;
  mine: { role: PickRole; entrantId: string }[];
  leaderboard: { user: { name?: string | null } | null; points: number }[];
}

/** The viewer's card plus the leaderboard (single-elimination only; 404 otherwise). */
export const getPickemApi = endpoint<{
  params: { id: string };
  res: PickemView;
}>()({ method: 'GET', path: '/api/tournaments/$id/pickem' });

/** Replaces the viewer's card while registration is open. */
export const setPickemApi = endpoint<{
  params: { id: string };
  body: { picks: { role: string; entrantId: string }[] };
  res: { ok: true };
}>()({ method: 'PUT', path: '/api/tournaments/$id/pickem' });
