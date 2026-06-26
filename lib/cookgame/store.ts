// lib/cookgame/store.ts
import { create } from 'zustand';
import type { AdditiveId, BaseId, BuyerId, InventoryState, Product, BaseStockEntry } from './types';
import { ADDITIVES, BUYERS } from './content';
import { mix, effectSetKey } from './effects';
import { buyerOffer, applyHeatOnSale, decayHeat, packageProduct } from './economy';
import { SaveState, CURRENT_VERSION, createNewSave, saveGame, loadGame } from './saveSystem';

function sameStock(a: BaseStockEntry, b: BaseStockEntry): boolean {
  return a.baseId === b.baseId && a.qualityMult === b.qualityMult &&
    a.bonusEffects.length === b.bonusEffects.length &&
    a.bonusEffects.every((e, i) => e === b.bonusEffects[i]);
}

function mergeStock(stock: BaseStockEntry[], entry: BaseStockEntry): BaseStockEntry[] {
  const i = stock.findIndex((s) => sameStock(s, entry));
  if (i === -1) return [...stock, entry];
  return stock.map((s, idx) => (idx === i ? { ...s, units: s.units + entry.units } : s));
}

interface CookgameState {
  cash: number;
  heat: number;
  inventory: InventoryState;
  discoveredRecipes: string[];
  nearbyInteractable: string | null;
  activeOverlay: string | null;
  playerPosition: [number, number, number];

  buyAdditive: (id: AdditiveId) => boolean;
  buyBase: (id: BaseId, price: number) => boolean;
  loadBaseToBench: (stockIndex: number) => boolean;
  mixIn: (additiveId: AdditiveId) => boolean;
  packageBench: () => boolean;
  sellUnit: (buyerId: BuyerId, packagedIndex: number, variance: number) => number;
  tickHeat: (dt: number) => void;
  setNearbyInteractable: (id: string | null) => void;
  setActiveOverlay: (id: string | null) => void;
  setPlayerPosition: (p: [number, number, number]) => void;
  saveNow: () => void;
  loadOrNew: () => void;
  resetGame: () => void;
}

const fromSave = (s: SaveState) => ({
  cash: s.cash, heat: s.heat, inventory: s.inventory, discoveredRecipes: s.discoveredRecipes,
});

export const useCookgameStore = create<CookgameState>((set, get) => ({
  ...fromSave(createNewSave()),
  nearbyInteractable: null,
  activeOverlay: null,
  playerPosition: [0, 1, 0],

  buyAdditive: (id) => {
    const { cash, inventory } = get();
    const cost = ADDITIVES[id].cost;
    if (cash < cost) return false;
    set({
      cash: cash - cost,
      inventory: { ...inventory, additives: { ...inventory.additives, [id]: (inventory.additives[id] ?? 0) + 1 } },
    });
    return true;
  },

  buyBase: (id, price) => {
    const { cash, inventory } = get();
    if (cash < price) return false;
    set({
      cash: cash - price,
      inventory: { ...inventory, baseStock: mergeStock(inventory.baseStock, { baseId: id, qualityMult: 1, bonusEffects: [], units: 1 }) },
    });
    return true;
  },

  loadBaseToBench: (stockIndex) => {
    const { inventory } = get();
    if (inventory.workProduct) return false;
    const entry = inventory.baseStock[stockIndex];
    if (!entry || entry.units <= 0) return false;
    const baseStock = inventory.baseStock
      .map((s, i) => (i === stockIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({
      inventory: {
        ...inventory,
        baseStock,
        workProduct: { baseId: entry.baseId, effects: [...entry.bonusEffects], qualityMult: entry.qualityMult },
      },
    });
    return true;
  },

  mixIn: (additiveId) => {
    const { inventory, discoveredRecipes } = get();
    if (!inventory.workProduct) return false;
    if ((inventory.additives[additiveId] ?? 0) <= 0) return false;
    const next: Product = mix(inventory.workProduct, additiveId);
    const key = effectSetKey(next.effects);
    set({
      inventory: {
        ...inventory,
        additives: { ...inventory.additives, [additiveId]: inventory.additives[additiveId] - 1 },
        workProduct: next,
      },
      discoveredRecipes: discoveredRecipes.includes(key) ? discoveredRecipes : [...discoveredRecipes, key],
    });
    return true;
  },

  packageBench: () => {
    const { inventory } = get();
    if (!inventory.workProduct) return false;
    set({
      inventory: { ...inventory, workProduct: null, packaged: [...inventory.packaged, packageProduct(inventory.workProduct)] },
    });
    return true;
  },

  sellUnit: (buyerId, packagedIndex, variance) => {
    const { inventory, cash, heat } = get();
    const stack = inventory.packaged[packagedIndex];
    const buyer = BUYERS.find((b) => b.id === buyerId);
    if (!stack || stack.units <= 0 || !buyer) return 0;
    const offer = buyerOffer(stack.product, buyer, heat, variance);
    const packaged = inventory.packaged
      .map((s, i) => (i === packagedIndex ? { ...s, units: s.units - 1 } : s))
      .filter((s) => s.units > 0);
    set({ cash: cash + offer, heat: applyHeatOnSale(heat), inventory: { ...inventory, packaged } });
    return offer;
  },

  tickHeat: (dt) => {
    const heat = get().heat;
    if (heat === 0) return; // avoid per-frame state churn (and autosave) on an idle tab
    set({ heat: decayHeat(heat, dt) });
  },
  setNearbyInteractable: (id) => set({ nearbyInteractable: id }),
  setActiveOverlay: (id) => set({ activeOverlay: id }),
  setPlayerPosition: (p) => set({ playerPosition: p }),

  saveNow: () => {
    const { cash, heat, inventory, discoveredRecipes } = get();
    saveGame({ version: CURRENT_VERSION, cash, heat, inventory, discoveredRecipes });
  },
  loadOrNew: () => set(fromSave(loadGame() ?? createNewSave())),
  resetGame: () => set({ ...fromSave(createNewSave()), nearbyInteractable: null, activeOverlay: null }),
}));
