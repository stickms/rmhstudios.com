/** Contracts for the Versecraft cloud save, progress and seed gallery fork (redesign audit C1, batches 3 and 10). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { forkSeedSchema } from '@/lib/versecraft/seed-gallery';
import type { versecraftSaveBody } from '@/lib/versecraft/save-schema';
import type { GameState } from '@/lib/versecraft/types';

export interface VersecraftProgressView {
  completedChapters: string[];
  unlockedEndings: string[];
  completedRoutes: string[];
  totalPoemsWritten: number;
  totalPlaytime: number;
}

/** The caller's cloud save and progress (both null before the first save). */
export const loadVersecraftSaveApi = endpoint<{
  res: { saveData: GameState | null; progress: VersecraftProgressView | null };
}>()({ method: 'GET', path: '/api/versecraft/save' });

/** Save the run. 400 `Missing or invalid saveData`; 413 `Payload too large` over 500KB. */
export const saveVersecraftApi = endpoint<{
  body: z.infer<typeof versecraftSaveBody>;
  res: { success: true; updatedAt: string };
}>()({ method: 'POST', path: '/api/versecraft/save' });

/** The caller's cloud progress (`progress: null` before the first save). */
export const getVersecraftProgressApi = endpoint<{
  res: { progress: VersecraftProgressView | null };
}>()({ method: 'GET', path: '/api/versecraft/progress' });

/** Count a "continue this story" on a gallery seed and get the seed to start from. 404 `not-found`. */
export const forkVersecraftSeedApi = endpoint<{
  body: z.infer<typeof forkSeedSchema>;
  res: { seed: string };
}>()({ method: 'POST', path: '/api/versecraft/seeds/fork' });
