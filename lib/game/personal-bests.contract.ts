/**
 * Contracts for /api/games/$id/personal-bests (sprint 05 #04). Client-safe: types come from the zod
 * schemas by `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { clearedPersonalBestsSchema, personalBestsSchema } from '@/lib/game/personal-bests-schema';

/** The caller's own record history in one game, newest first. */
export const getPersonalBestsApi = endpoint<{
  res: z.infer<typeof personalBestsSchema>;
}>()({
  method: 'GET',
  path: '/api/games/$id/personal-bests',
});

/** Clear the caller's history in one game. The best on the board is not touched. */
export const clearPersonalBestsApi = endpoint<{
  res: z.infer<typeof clearedPersonalBestsSchema>;
}>()({
  method: 'DELETE',
  path: '/api/games/$id/personal-bests',
});
