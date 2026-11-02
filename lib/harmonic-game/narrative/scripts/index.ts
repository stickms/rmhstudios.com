/**
 * The script registry. Each chapter adds `scripts/ch<N>.ts` exporting `CH<N>_SCRIPTS` and one line
 * here. Ids are unique across all files (checked by `narrative.test.ts`).
 */
import type { DialogueScript } from '../types';
import { CH1_SCRIPTS } from './ch1';
import { DEV_SCRIPTS } from './dev';

export const ALL_SCRIPTS: DialogueScript[] = [...DEV_SCRIPTS, ...CH1_SCRIPTS];

const byId = new Map<string, DialogueScript>(ALL_SCRIPTS.map((s) => [s.id, s]));

export function findScript(id: string): DialogueScript | undefined {
  return byId.get(id.trim());
}
