// lib/cookgame/store.ts
import { create } from 'zustand';
import type { AdditiveId, BaseId, BuyerId, InputId, InventoryState, Product, BaseStockEntry, CookSession } from './types';
import { cookQuality, cookOutput, DIAL_COUNT } from './chemistry';
import { ADDITIVES, BUYERS, INPUTS, GROWABLE } from './content';
import { mix, effectSetKey } from './effects';
import { buyerOffer, applyHeatOnSale, decayHeat, packageProduct } from './economy';
import { SaveState, CURRENT_VERSION, createNewSave, saveGame, loadGame } from './saveSystem';
import {
  plantPlot as cPlant, canTend, tendPlot as cTend,
  harvestPlot as cHarvest, canCollect, collectDried as cCollect,
} from './cultivation';

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

  cookSession: CookSession | null;
  startCook: (baseId: BaseId) => boolean;
  setDial: (i: number, value: number) => void;
  submitCook: () => number;
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
  buyInput: (id: InputId) => boolean;
  plantPlot: (plotIndex: number, strainKey: string, now: number) => boolean;
  tendPlot: (plotIndex: number, now: number) => boolean;
  harvestPlot: (plotIndex: number, now: number) => boolean;
  collectDried: (batchIndex: number, now: number) => boolean;
}

const fromSave = (s: SaveState) => ({
  cash: s.cash, heat: s.heat, inventory: s.inventory, discoveredRecipes: s.discoveredRecipes,
});

export const useCookgameStore = create<CookgameState>((set, get) => ({
  ...fromSave(createNewSave()),
  nearbyInteractable: null,
  activeOverlay: null,
  playerPosition: [0, 1, 0],
  cookSession: null,

  startCook: (baseId) => {
    const { inventory } = get();
    if ((inventory.inputs.reagent ?? 0) <= 0) return false;
    const raw = Array.from({ length: DIAL_COUNT }, () => Math.random());
    const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
    const target = raw.map((v) => v / rawSum);
    set({
      inventory: { ...inventory, inputs: { ...inventory.inputs, reagent: inventory.inputs.reagent - 1 } },
      cookSession: { baseId, target, dials: Array.from({ length: DIAL_COUNT }, () => 0) },
    });
    return true;
  },

  setDial: (i, value) => {
    const { cookSession } = get();
    if (!cookSession) return;
    const v = Math.max(0, Math.min(1, value));
    set({ cookSession: { ...cookSession, dials: cookSession.dials.map((d, idx) => (idx === i ? v : d)) } });
  },

  submitCook: () => {
    const { cookSession, inventory } = get();
    if (!cookSession) return 0;
    const q = cookQuality(cookSession.dials, cookSession.target);
    set({
      cookSession: null,
      inventory: { ...inventory, baseStock: mergeStock(inventory.baseStock, cookOutput(cookSession.baseId, q)) },
    });
    return q;
  },

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
  resetGame: () => set({ ...fromSave(createNewSave()), nearbyInteractable: null, activeOverlay: null, cookSession: null }),

  buyInput: (id) => {
    const { cash, inventory } = get();
    const cost = INPUTS[id].cost;
    if (cash < cost) return false;
    set({
      cash: cash - cost,
      inventory: { ...inventory, inputs: { ...inventory.inputs, [id]: (inventory.inputs[id] ?? 0) + 1 } },
    });
    return true;
  },

  plantPlot: (plotIndex, strainKey, now) => {
    const { inventory } = get();
    const g = GROWABLE[strainKey];
    const plot = inventory.plots[plotIndex];
    if (!g || !plot || plot.stage !== 'empty') return false;
    if ((inventory.inputs[g.seedId] ?? 0) <= 0 || (inventory.inputs.nutrient ?? 0) <= 0) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? cPlant(p, g.baseId, now) : p));
    set({
      inventory: {
        ...inventory, plots,
        inputs: { ...inventory.inputs, [g.seedId]: inventory.inputs[g.seedId] - 1, nutrient: inventory.inputs.nutrient - 1 },
      },
    });
    return true;
  },

  tendPlot: (plotIndex, now) => {
    const { inventory } = get();
    const plot = inventory.plots[plotIndex];
    if (!plot || !canTend(plot, now)) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? cTend(p, now) : p));
    set({ inventory: { ...inventory, plots } });
    return true;
  },

  harvestPlot: (plotIndex, now) => {
    const { inventory } = get();
    const plot = inventory.plots[plotIndex];
    if (!plot) return false;
    const res = cHarvest(plot, now);
    if (!res) return false;
    const plots = inventory.plots.map((p, i) => (i === plotIndex ? res.plot : p));
    set({ inventory: { ...inventory, plots, dryingRack: [...inventory.dryingRack, res.wet] } });
    return true;
  },

  collectDried: (batchIndex, now) => {
    const { inventory } = get();
    const batch = inventory.dryingRack[batchIndex];
    if (!batch || !canCollect(batch, now)) return false;
    const entry = cCollect(batch);
    const dryingRack = inventory.dryingRack.filter((_, i) => i !== batchIndex);
    set({ inventory: { ...inventory, dryingRack, baseStock: mergeStock(inventory.baseStock, entry) } });
    return true;
  },
}));
