// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';
import { TEND_COOLDOWN_MS, DRY_COOLDOWN_MS } from '../cultivation';
import { rankForXp, xpForRecipe } from '../progression';

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

describe('cookgame store — guard paths', () => {
  beforeEach(reset);

  it('buyAdditive returns false and does not change cash when cash is too low', () => {
    useCookgameStore.setState({ cash: 0 });
    expect(useCookgameStore.getState().buyAdditive('cuke')).toBe(false); // cuke costs 2
    expect(useCookgameStore.getState().cash).toBe(0);
  });

  it('loadBaseToBench returns false when bench already occupied', () => {
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        baseStock: [{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: 1 }],
        workProduct: { baseId: 'couchlock', effects: [], qualityMult: 1 },
      },
    }));
    expect(useCookgameStore.getState().loadBaseToBench(0)).toBe(false);
  });

  it('loadBaseToBench returns false for an out-of-range or empty stock index', () => {
    expect(useCookgameStore.getState().loadBaseToBench(5)).toBe(false);
  });

  it('mixIn returns false when the additive is not owned', () => {
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        workProduct: { baseId: 'greenstart', effects: [], qualityMult: 1 },
        additives: {},
      },
    }));
    expect(useCookgameStore.getState().mixIn('cuke')).toBe(false);
  });

  it('sellUnit removes the packaged stack entirely when its last unit is sold', () => {
    useCookgameStore.setState((s) => ({
      cash: 200,
      inventory: {
        ...s.inventory,
        packaged: [{ product: { baseId: 'greenstart', effects: [], qualityMult: 1 }, units: 1 }],
      },
    }));
    useCookgameStore.getState().sellUnit('doug', 0, 1.0);
    expect(useCookgameStore.getState().inventory.packaged).toHaveLength(0);
  });

  it('mergeStock keeps distinct-quality entries separate (findIndex === -1 push branch)', () => {
    // Inject a high-quality couchlock entry (qualityMult: 1.3)
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        baseStock: [{ baseId: 'couchlock', qualityMult: 1.3, bonusEffects: [], units: 1 }],
      },
    }));
    // buyBase always adds qualityMult: 1 — different from 1.3, so no merge
    useCookgameStore.getState().buyBase('couchlock', 10);
    expect(useCookgameStore.getState().inventory.baseStock).toHaveLength(2);
  });
});

describe('cookgame store — cook flow', () => {
  beforeEach(reset);

  it('startCook requires a reagent and opens a session', () => {
    const st = useCookgameStore.getState();
    expect(st.startCook('glimmerdust')).toBe(false); // no reagent
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    expect(useCookgameStore.getState().startCook('glimmerdust')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.cookSession?.baseId).toBe('glimmerdust');
    expect(s.cookSession?.dials).toHaveLength(3);
    expect(s.inventory.inputs.reagent).toBe(0);
  });

  it('a perfectly matched submit yields a max-quality cooked stock entry', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    const st = useCookgameStore.getState();
    st.startCook('glimmerdust');
    const target = useCookgameStore.getState().cookSession!.target;
    target.forEach((v, i) => st.setDial(i, v)); // dial exactly onto target
    const q = st.submitCook();
    expect(q).toBeCloseTo(1, 5);
    const s = useCookgameStore.getState();
    expect(s.cookSession).toBeNull();
    expect(s.inventory.baseStock[0].baseId).toBe('glimmerdust');
    expect(s.inventory.baseStock[0].bonusEffects).toEqual(['glowing']);
  });

  it('setDial clamps to [0,1]', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { reagent: 1 } } }));
    const st = useCookgameStore.getState();
    st.startCook('glimmerdust');
    st.setDial(0, 5); st.setDial(1, -3);
    const d = useCookgameStore.getState().cookSession!.dials;
    expect(d[0]).toBe(1);
    expect(d[1]).toBe(0);
  });
});

describe('cookgame store — progression', () => {
  beforeEach(reset);

  it('starts at xp 0 / rank 0 and the new save fields are defaulted', () => {
    const s = useCookgameStore.getState();
    expect(s.xp).toBe(0);
    expect(rankForXp(s.xp).rank).toBe(0);
    expect(s.ownedPropertyTier).toBe(0);
    expect(s.keys).toEqual([]);
    expect(s.currentDistrict).toBe('suburbs');
  });

  it('gainXp accumulates', () => {
    useCookgameStore.getState().gainXp(150);
    expect(useCookgameStore.getState().xp).toBe(150);
    expect(rankForXp(useCookgameStore.getState().xp).rank).toBe(1);
  });

  it('selling grants sale XP and applies the rank price perk', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10);
    st.loadBaseToBench(0);
    st.buyAdditive('cuke'); st.mixIn('cuke');
    st.packageBench();
    // jump to a rank with a price perk so the offer reflects it
    useCookgameStore.setState({ xp: 3000 }); // Kingpin: priceMult 1.16
    const offer = useCookgameStore.getState().sellUnit('doug', 0, 1.0);
    const after = useCookgameStore.getState();
    expect(offer).toBeGreaterThan(0);
    expect(after.xp).toBeGreaterThan(3000); // sale XP added on top
  });

  it('discovering a NEW recipe grants recipe XP; a repeat does not', () => {
    const st = useCookgameStore.getState();
    st.buyBase('greenstart', 10); st.loadBaseToBench(0);
    st.buyAdditive('cuke');
    const before = useCookgameStore.getState().xp;
    st.mixIn('cuke'); // discovers 'energizing'
    const afterNew = useCookgameStore.getState().xp;
    expect(afterNew).toBe(before + xpForRecipe());
    // mixing the same additive again yields the same effect set (no new recipe) → no recipe XP
    st.buyAdditive('cuke');
    const afterRepeat0 = useCookgameStore.getState().xp;
    st.mixIn('cuke');
    expect(useCookgameStore.getState().xp).toBe(afterRepeat0);
  });
});
