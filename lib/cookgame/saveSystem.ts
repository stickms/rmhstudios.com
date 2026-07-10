import type { InventoryState, BaseStockEntry, RecipeMeta, BuyerDynamicState } from './types';
import { emptyPlot } from './cultivation';
import { initialBuyerStates } from './demand';

export const STORAGE_KEY = 'cookgame-save-v1'; // storage key unchanged; payload self-describes version
export const CURRENT_VERSION = 4 as const;
const MAX_PAYLOAD = 200 * 1024;

export interface SaveV4 {
  version: 4;
  cash: number;
  heat: number;
  xp: number;
  ownedPropertyTier: number;
  keys: string[];
  clock: number;
  discoveredEffects: string[];
  recipeMeta: Record<string, RecipeMeta>;
  currentDistrict: string;
  buyerState: Record<string, BuyerDynamicState>;
  inventory: InventoryState;
  discoveredRecipes: string[];
}
export type SaveState = SaveV4;

const PHASE3_DEFAULTS = () => ({
  xp: 0, ownedPropertyTier: 0, keys: [] as string[], clock: 0,
  discoveredEffects: [] as string[],
  recipeMeta: {} as Record<string, RecipeMeta>,
  currentDistrict: 'suburbs',
  buyerState: initialBuyerStates(),
});

export function createNewSave(): SaveV4 {
  return {
    version: CURRENT_VERSION,
    cash: 150,
    heat: 0,
    ...PHASE3_DEFAULTS(),
    inventory: {
      additives: {}, inputs: {}, baseStock: [],
      plots: [emptyPlot(), emptyPlot(), emptyPlot()],
      dryingRack: [], workProduct: null, packaged: [],
    },
    discoveredRecipes: [],
  };
}

export function serializeSave(save: SaveV4): string {
  return JSON.stringify(save);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV1(p: any): any | null {
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
  const rawBases: Record<string, number> = p.inventory.rawBases ?? {};
  const baseStock: BaseStockEntry[] = Object.entries(rawBases)
    .filter(([, n]) => (n as number) > 0)
    .map(([baseId, n]) => ({ baseId: baseId as BaseStockEntry['baseId'], qualityMult: 1, bonusEffects: [], units: n as number }));
  return {
    version: 2,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV2(p: any): SaveV4 | null {
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (!p.inventory || !Array.isArray(p.discoveredRecipes)) return null;
  const inv = p.inventory;
  if (!Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
  if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
  if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
  return {
    version: CURRENT_VERSION,
    cash: p.cash, heat: p.heat,
    ...PHASE3_DEFAULTS(),
    inventory: inv,
    discoveredRecipes: p.discoveredRecipes,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function migrateV3(p: any): SaveV4 | null {
  // v3 shape was already validated when written; re-validate the load-bearing fields.
  if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
  if (typeof p.xp !== 'number' || typeof p.clock !== 'number' || typeof p.ownedPropertyTier !== 'number') return null;
  if (!Array.isArray(p.keys) || !Array.isArray(p.discoveredEffects) || !Array.isArray(p.discoveredRecipes)) return null;
  if (typeof p.recipeMeta !== 'object' || p.recipeMeta === null || Array.isArray(p.recipeMeta)) return null;
  if (typeof p.currentDistrict !== 'string') return null;
  const inv = p.inventory;
  if (!inv || !Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
  if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
  if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
  return { ...p, version: CURRENT_VERSION, buyerState: initialBuyerStates() } as SaveV4;
}

export function parseSave(raw: string | null): SaveV4 | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw);
    if (p.version === 1) { const v2 = migrateV1(p); return v2 ? migrateV2(v2) : null; }
    if (p.version === 2) return migrateV2(p);
    if (p.version === 3) return migrateV3(p);
    if (p.version !== CURRENT_VERSION) return null;
    // v4 validation
    if (typeof p.cash !== 'number' || typeof p.heat !== 'number') return null;
    if (typeof p.xp !== 'number' || typeof p.clock !== 'number' || typeof p.ownedPropertyTier !== 'number') return null;
    if (!Array.isArray(p.keys) || !Array.isArray(p.discoveredEffects) || !Array.isArray(p.discoveredRecipes)) return null;
    if (typeof p.recipeMeta !== 'object' || p.recipeMeta === null || Array.isArray(p.recipeMeta)) return null;
    if (typeof p.currentDistrict !== 'string') return null;
    if (typeof p.buyerState !== 'object' || p.buyerState === null || Array.isArray(p.buyerState)) return null;
    const inv = p.inventory;
    if (!inv || !Array.isArray(inv.baseStock) || !Array.isArray(inv.plots) || !Array.isArray(inv.dryingRack)) return null;
    if (typeof inv.inputs !== 'object' || inv.inputs === null || Array.isArray(inv.inputs)) return null;
    if (typeof inv.additives !== 'object' || inv.additives === null || Array.isArray(inv.additives)) return null;
    return p as SaveV4;
  } catch {
    return null;
  }
}

export function saveGame(save: SaveV4): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const json = serializeSave(save);
    if (json.length > MAX_PAYLOAD) return false;
    localStorage.setItem(STORAGE_KEY, json);
    return true;
  } catch { return false; }
}

export function loadGame(): SaveV4 | null {
  if (typeof localStorage === 'undefined') return null;
  return parseSave(localStorage.getItem(STORAGE_KEY));
}
