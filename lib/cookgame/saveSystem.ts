import type { InventoryState } from './types';

export const STORAGE_KEY = 'cookgame-save-v1';
export const CURRENT_VERSION = 1 as const;
const MAX_PAYLOAD = 200 * 1024;

export interface SaveV1 {
  version: 1;
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
}

export function createNewSave(): SaveV1 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    inventory: { additives: {}, rawBases: {}, workProduct: null, packaged: [] },
    discoveredRecipes: [],
  };
}

export function serializeSave(save: SaveV1): string {
  return JSON.stringify(save);
}

export function parseSave(raw: string | null): SaveV1 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as Partial<SaveV1>;
    if (p.version !== CURRENT_VERSION) return null;
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
    return p as SaveV1;
  } catch {
    return null;
  }
}

// ── Browser wrappers (not unit-tested; guard for SSR) ──
export function saveGame(save: SaveV1): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const json = serializeSave(save);
    if (json.length > MAX_PAYLOAD) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch { return false; }
}

export function loadGame(): SaveV1 | null {
  if (typeof localStorage === 'undefined') return null;
  return parseSave(localStorage.getItem(STORAGE_KEY));
}
