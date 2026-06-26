import type { InventoryState, BaseStockEntry } from './types';
import { emptyPlot } from './cultivation';

export const STORAGE_KEY = 'cookgame-save-v1'; // storage key unchanged; payload self-describes version
export const CURRENT_VERSION = 2 as const;
const MAX_PAYLOAD = 200 * 1024;

export interface SaveV2 {
  version: 2;
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
}
export type SaveState = SaveV2;

export function createNewSave(): SaveV2 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    inventory: {
      additives: {}, inputs: {}, baseStock: [],
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [], workProduct: null, packaged: [],
    },
    discoveredRecipes: [],
  };
}

export function serializeSave(save: SaveV2): string {
  return JSON.stringify(save);
}

function migrateV1(p: any): SaveV2 | null {
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
  const rawBases: Record<string, number> = p.inventory.rawBases ?? {};
  const baseStock: BaseStockEntry[] = Object.entries(rawBases)
    .filter(([, n]) => (n as number) > 0)
    .map(([baseId, n]) => ({ baseId: baseId as BaseStockEntry['baseId'], qualityMult: 1, bonusEffects: [], units: n as number }));
  return {
    version: CURRENT_VERSION,
    cash: p.cash,
    heat: p.heat,
    inventory: {
      additives: p.inventory.additives ?? {},
      inputs: {},
      baseStock,
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [],
      workProduct: p.inventory.workProduct ?? null,
      packaged: p.inventory.packaged ?? [],
    },
    discoveredRecipes: p.discoveredRecipes,
  };
}

export function parseSave(raw: string | null): SaveV2 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.version === 1) return migrateV1(p);
    if (p.version !== CURRENT_VERSION) return null;
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
    return p as SaveV2;
  } catch {
    return null;
  }
}

export function saveGame(save: SaveV2): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const json = serializeSave(save);
    if (json.length > MAX_PAYLOAD) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch { return false; }
}

export function loadGame(): SaveV2 | null {
  if (typeof localStorage === 'undefined') return null;
  return parseSave(localStorage.getItem(STORAGE_KEY));
}
