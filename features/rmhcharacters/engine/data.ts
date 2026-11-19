/**
 * Lazy access to the rules data. Each system's data is a few hundred KB of
 * text, so it ships as its own chunk and is fetched the first time a character
 * of that system is opened, never with the roster.
 */
import type { Dnd5eData, GameSystem, Pf2eData } from './types';

let dnd5e: Promise<Dnd5eData> | null = null;
let pf2e: Promise<Pf2eData> | null = null;

export function loadDnd5e(): Promise<Dnd5eData> {
  dnd5e ??= import('./dnd5e/data/index').then((m) => m.DND5E_DATA);
  return dnd5e;
}

export function loadPf2e(): Promise<Pf2eData> {
  pf2e ??= import('./pf2e/data/index').then((m) => m.PF2E_DATA);
  return pf2e;
}

export type SystemData<S extends GameSystem> = S extends 'dnd5e' ? Dnd5eData : Pf2eData;

export const SYSTEM_LABEL: Record<GameSystem, string> = {
  dnd5e: 'D&D 5e (2024)',
  pf2e: 'Pathfinder 2e (Remaster)',
};
