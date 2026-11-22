/**
 * Loadout presets (C6) — client-safe schema and limits.
 *
 * Fortnite's locker, for the cosmetics `UserInventory` already equips: save the
 * look you are wearing under a name, switch back to it in one tap.
 */
import { z } from 'zod';

export const LOADOUT_MAX_PRESETS = 10;

export const saveLoadoutSchema = z.object({
  name: z.string().trim().min(1).max(40),
});

export interface LoadoutItemView {
  id: string;
  name: string;
  kind: string;
  /** Still in the member's inventory. A sold or traded item is skipped on apply. */
  owned: boolean;
}

export interface LoadoutView {
  id: string;
  name: string;
  items: LoadoutItemView[];
  /** True when every item in the preset is currently equipped (and nothing else is). */
  active: boolean;
}
