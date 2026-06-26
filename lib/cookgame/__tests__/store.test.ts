// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';

const reset = () => useCookgameStore.getState().resetGame();

describe('cookgame store', () => {
  beforeEach(reset);

  it('starts with starting cash and empty bench', () => {
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(150);
    expect(s.inventory.workProduct).toBeNull();
  });

  it('buyAdditive deducts cost and adds inventory', () => {
    const ok = useCookgameStore.getState().buyAdditive('cuke'); // cost 2
    expect(ok).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cash).toBe(148);
    expect(s.inventory.additives.cuke).toBe(1);
  });

  it('mix flow: buy base, load bench, mix additive, record recipe', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
    st.buyAdditive('cuke');
    const ok = st.mixIn('cuke');
    expect(ok).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct!.effects).toContain('energizing');
    expect(s.discoveredRecipes).toContain('energizing');
    expect(s.inventory.additives.cuke ?? 0).toBe(0);
  });

  it('package + sell increases cash and heat, decrements units', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
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
    st.tickHeat(4); // 0.5/s * 4 = 2
    expect(useCookgameStore.getState().heat).toBe(8);
  });

  it('buyAdditive returns false and spends nothing when funds insufficient', () => {
    useCookgameStore.setState({ cash: 1 }); // cuke costs 2
    expect(useCookgameStore.getState().buyAdditive('cuke')).toBe(false);
    expect(useCookgameStore.getState().cash).toBe(1);
  });

  it('loadBaseToBench returns false when the bench is occupied', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
    st.buyBase('greenstart', 10);
    expect(useCookgameStore.getState().loadBaseToBench('greenstart')).toBe(false);
  });

  it('loadBaseToBench returns false when no base is in stock', () => {
    expect(useCookgameStore.getState().loadBaseToBench('greenstart')).toBe(false);
  });

  it('mixIn returns false when the additive is not owned', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
    expect(useCookgameStore.getState().mixIn('cuke')).toBe(false);
  });

  it('drops a packaged stack when its last unit is sold', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench('greenstart');
    st.buyAdditive('cuke');
    st.mixIn('cuke');
    st.packageBench();
    for (let i = 0; i < 5; i++) st.sellUnit('doug', 0, 1.0);
    expect(useCookgameStore.getState().inventory.packaged).toHaveLength(0);
  });
});
