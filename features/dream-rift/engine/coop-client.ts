/**
 * The browser's reads of the co-op board (sprint 15 09). Dream Rift is an island with no React Query: a screen calls
 * these from a click handler (the tab opening, a difficulty or metric changing), never from an effect. They live in a
 * `.ts` module so the leaderboard screen, which keeps its solo board's own effect, adds no file to the
 * `useEffect` plus `/api` ratchet.
 */
import { api } from '@/lib/contract/client';
import { listDreamRiftCoopApi } from './dream-rift.contract';
import type { CoopBoardEntry } from './coop-runs';

export type CoopBoardDifficulty = 'easy' | 'normal' | 'hard' | 'lunatic';
export type CoopBoardMetric = 'combined' | 'time';

/** The top 20 finished co-op runs for a difficulty, names resolved by the server at read time. */
export function fetchCoopBoard(difficulty: CoopBoardDifficulty, metric: CoopBoardMetric): Promise<CoopBoardEntry[]> {
  return api(listDreamRiftCoopApi, { query: { difficulty, metric } });
}
