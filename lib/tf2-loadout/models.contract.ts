/**
 * Contracts for the JSON side of the TF2 model channel (redesign audit C1, batch 10): which
 * items have a 3D model, and the index of the game's own animation clips. The GLBs behind
 * the same prefix are binary and are loaded by the three.js loader, not by `api()`.
 * Client-safe.
 */
import { endpoint } from '@/lib/contract/endpoint';

/** The defindexes that have a GLB model. */
export const listTf2LoadoutModelsApi = endpoint<{ res: { ids: string[] } }>()({
  method: 'GET',
  path: '/api/tf2-loadout/models',
});

/** The animation clips each class has (`v` is the model builder version, a cache buster). 404 before a sync. */
export interface Tf2AnimIndex {
  clips: Record<string, string[]>;
}

export const getTf2AnimIndexApi = endpoint<{
  query: { v: number };
  res: Tf2AnimIndex;
}>()({ method: 'GET', path: '/api/tf2-loadout/models/anims.json' });
