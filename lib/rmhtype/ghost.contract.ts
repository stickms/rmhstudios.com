/** Contracts for the RMHType ghost endpoints. Client-safe: types only. */
import { endpoint } from '@/lib/contract/endpoint';

export interface RmhTypeGhost {
  passageId: string;
  wpm: number;
  timeMs: number;
  samples: number[];
}

/** The caller's own best-run ghost for a passage, or `null` when there is none. */
export const getRmhTypeGhostApi = endpoint<{
  res: { ghost: RmhTypeGhost | null };
}>()({
  method: 'GET',
  path: '/api/rmhtype/ghosts/$passageId',
});

/** Delete every ghost the caller has. */
export const clearRmhTypeGhostsApi = endpoint<{
  res: { deleted: number };
}>()({
  method: 'DELETE',
  path: '/api/rmhtype/ghosts',
});
