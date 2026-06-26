// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';

const reset = () => useCookgameStore.getState().resetGame();

describe('cookgame store — baseStock core', () => {
  beforeEach(reset);

  it('starts with starting cash and empty bench/stock', () => {
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(150);
    expect(s.inventory.workProduct).toBeNull();
    expect(s.inventory.baseStock).toEqual([]);
    expect(s.inventory.plots).toHaveLength(3);
  });

  it('buyBase adds/merges a baseStock entry', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.buyBase('greenstart', 10);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(130);
    expect(s.inventory.baseStock).toEqual([{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 2 }]);
  });

  it('buyAdditive deducts cost and adds inventory', () => {
    expect(useCookgameStore.getState().buyAdditive('cuke')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(148);
    expect(s.inventory.additives.cuke).toBe(1);
  });

  it('loadBaseToBench pulls one unit from a stock entry, seeding bonus effects + qualityMult', () => {
    const st = useCookgameStore.getState();
    // inject a quality couchlock stack
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, baseStock: [{ baseId: 'couchlock', qualityMult: 1.3, bonusEffects: ['sedating'], units: 2 }] },
    }));
    expect(st.loadBaseToBench(0)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct).toEqual({ baseId: 'couchlock', effects: ['sedating'], qualityMult: 1.3 });
    expect(s.inventory.baseStock[0].units).toBe(1);
  });

  it('mix flow: buy base, load bench, mix additive, record recipe', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke');
    expect(st.mixIn('cuke')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct!.effects).toContain('energizing');
    expect(s.discoveredRecipes).toContain('energizing');
  });

  it('package + sell increases cash and heat, decrements units', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke'); st.mixIn('cuke');
    st.packageBench();
    const before = useCookgameStore.getState();
    expect(before.inventory.packaged[0].units).toBe(5);
    const offer = st.sellUnit('doug', 0, 1.0);
    const after = useCookgameStore.getState();
    expect(offer).toBeGreaterThan(0);
    expect(after.cash).toBe(before.cash + offer);
    expect(after.heat).toBeGreaterThan(before.heat);
    expect(after.inventory.packaged[0].units).toBe(4);
  });

  it('tickHeat decays heat toward 0', () => {
    const st = useCookgameStore.getState();
    useCookgameStore.setState({ heat: 10 });
    st.tickHeat(4);
    expect(useCookgameStore.getState().heat).toBe(8);
  });
});

import { TEND_COOLDOWN_MS, DRY_COOLDOWN_MS } from '../cultivation';

describe('cookgame store — grow flow', () => {
  beforeEach(reset);

  const stockInputs = () => {
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, inputs: { seed_couchlock: 1, nutrient: 1 } },
    }));
  };

  it('buyInput deducts cost and adds an input', () => {
    expect(useCookgameStore.getState().buyInput('nutrient')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(147); // 150 - 3
    expect(s.inventory.inputs.nutrient).toBe(1);
  });

  it('plant requires seed + nutrient and consumes them', () => {
    const st = useCookgameStore.getState();
    expect(st.plantPlot(0, 'couchlock', 1000)).toBe(false); // no inputs yet
    stockInputs();
    expect(useCookgameStore.getState().plantPlot(0, 'couchlock', 1000)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.plots[0].stage).toBe('seedling');
    expect(s.inventory.inputs.seed_couchlock ?? 0).toBe(0);
    expect(s.inventory.inputs.nutrient ?? 0).toBe(0);
  });

  it('full grow: plant -> tend x2 -> harvest -> dry -> collect into baseStock', () => {
    stockInputs();
    const st = useCookgameStore.getState();
    st.plantPlot(0, 'couchlock', 0);
    expect(st.tendPlot(0, 1)).toBe(false); // too soon
    st.tendPlot(0, TEND_COOLDOWN_MS);
    st.tendPlot(0, 2 * TEND_COOLDOWN_MS);
    expect(useCookgameStore.getState().inventory.plots[0].stage).toBe('flowering');
    expect(st.harvestPlot(0, 3 * TEND_COOLDOWN_MS)).toBe(true);
    let s = useCookgameStore.getState();
    expect(s.inventory.plots[0].stage).toBe('empty');
    expect(s.inventory.dryingRack).toHaveLength(1);
    const dryAt = 3 * TEND_COOLDOWN_MS;
    expect(st.collectDried(0, dryAt + DRY_COOLDOWN_MS - 1)).toBe(false);
    expect(st.collectDried(0, dryAt + DRY_COOLDOWN_MS)).toBe(true);
    s = useCookgameStore.getState();
    expect(s.inventory.dryingRack).toHaveLength(0);
    expect(s.inventory.baseStock[0].baseId).toBe('couchlock');
    expect(s.inventory.baseStock[0].units).toBeGreaterThan(0);
  });
});
