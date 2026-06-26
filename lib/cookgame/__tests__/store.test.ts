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
