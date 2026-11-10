/** Contracts for the Versecraft cloud save (redesign audit C1, batch 3). Client-safe. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
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
