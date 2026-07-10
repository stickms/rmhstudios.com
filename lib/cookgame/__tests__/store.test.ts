// lib/cookgame/__tests__/store.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useCookgameStore } from '../store';
import { TEND_COOLDOWN_MS, DRY_COOLDOWN_MS } from '../cultivation';
import { rankForXp, xpForRecipe } from '../progression';
import { propertyEffects } from '../property';
import { KEY_PRICES, NIGHT_WINDOW } from '../shops';
import { DAY_LENGTH_MS } from '../timeOfDay';
import { DEPLETE_PER_UNIT } from '../demand';

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

describe('cookgame store — stash cap + income', () => {
  beforeEach(reset);

  it('buyBase refuses when it would exceed the stash cap', () => {
    const cap = propertyEffects(0).stashCap; // 60 at tier 0
    // fill baseStock to the cap
    useCookgameStore.setState((s) => ({
      cash: 99999,
      inventory: { ...s.inventory, baseStock: [{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: cap }] },
    }));
    expect(useCookgameStore.getState().buyBase('greenstart', 10)).toBe(false);
    expect(useCookgameStore.getState().inventory.baseStock[0].units).toBe(cap);
  });

  it('a higher property tier raises the cap so the same buy succeeds', () => {
    const cap = propertyEffects(0).stashCap;
    useCookgameStore.setState((s) => ({
      cash: 99999, ownedPropertyTier: 1, // cap 150
      inventory: { ...s.inventory, baseStock: [{ baseId: 'greenstart', qualityMult: 1, bonusEffects: [], units: cap }] },
    }));
    expect(useCookgameStore.getState().buyBase('greenstart', 10)).toBe(true);
  });

  it('packageBench refuses (no-op) when the batch would overflow the stash cap', () => {
    const cap = propertyEffects(0).stashCap; // 60 at tier 0
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        workProduct: { baseId: 'greenstart', effects: [], qualityMult: 1 },
        packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: cap - 4 }], // +5 would overflow
      },
    }));
    expect(useCookgameStore.getState().packageBench()).toBe(false);
    const s = useCookgameStore.getState();
    expect(s.inventory.workProduct).not.toBeNull();        // batch left on the bench
    expect(s.inventory.packaged[0].units).toBe(cap - 4);    // nothing packaged
  });

  it('tickPassiveIncome adds cash only when the tier has income', () => {
    const st = useCookgameStore.getState();
    st.tickPassiveIncome(10);
    expect(useCookgameStore.getState().cash).toBe(150); // tier 0: no income
    useCookgameStore.setState({ ownedPropertyTier: 1, cash: 0 }); // 0.5/s
    useCookgameStore.getState().tickPassiveIncome(10);
    expect(useCookgameStore.getState().cash).toBe(5); // 0.5 * 10
  });
});

describe('cookgame store — property', () => {
  beforeEach(reset);

  it('buyProperty buys the next tier only, gated by rank + cash, and grows plots', () => {
    const st = useCookgameStore.getState();
    // tier 1 needs rank 1 (xp 100) + 500 cash
    expect(st.buyProperty(1)).toBe(false); // rank 0, no cash
    useCookgameStore.setState({ xp: 100, cash: 1000 });
    expect(useCookgameStore.getState().buyProperty(2)).toBe(false); // can't skip to tier 2
    expect(useCookgameStore.getState().buyProperty(1)).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.ownedPropertyTier).toBe(1);
    expect(s.cash).toBe(500);
    expect(s.inventory.plots.length).toBe(propertyEffects(1).plots); // grew to 6
  });

  it('owning a faster-cooldown property lets a plot be tended sooner', () => {
    useCookgameStore.setState((s) => ({ inventory: { ...s.inventory, inputs: { seed_couchlock: 1, nutrient: 1 } } }));
    const st = useCookgameStore.getState();
    st.plantPlot(0, 'couchlock', 0);
    // tier 0 (cooldownMult 1): half cooldown is not enough
    expect(st.tendPlot(0, TEND_COOLDOWN_MS / 2)).toBe(false);
    // jump to a property tier with cooldownMult <= 0.5-ish via tier 3 (0.7) won't be enough at half;
    // instead verify the wiring by setting tier 3 and using a smaller elapsed that 0.7x permits:
    useCookgameStore.setState({ ownedPropertyTier: 3 }); // cooldownMult 0.7
    expect(st.tendPlot(0, TEND_COOLDOWN_MS * 0.7)).toBe(true); // 0.7x gate met exactly
  });
});

describe('cookgame store — keys + district', () => {
  beforeEach(reset);
  it('buyKey deducts cash and adds the key once', () => {
    useCookgameStore.setState({ cash: 1000 });
    const st = useCookgameStore.getState();
    expect(st.buyKey('docks_key')).toBe(true);
    const s = useCookgameStore.getState();
    expect(s.keys).toContain('docks_key');
    expect(s.cash).toBe(1000 - KEY_PRICES.docks_key);
    expect(st.buyKey('docks_key')).toBe(false); // already owned
  });
  it('buyKey refuses when broke or unknown', () => {
    expect(useCookgameStore.getState().buyKey('docks_key')).toBe(false); // 150 < 250
    useCookgameStore.setState({ cash: 9999 });
    expect(useCookgameStore.getState().buyKey('nope')).toBe(false);
  });
  it('setCurrentDistrict updates the field', () => {
    useCookgameStore.getState().setCurrentDistrict('downtown');
    expect(useCookgameStore.getState().currentDistrict).toBe('downtown');
  });
});

describe('tickClock', () => {
  beforeEach(() => useCookgameStore.getState().resetGame());

  it('advances the clock by dtMs', () => {
    useCookgameStore.getState().tickClock(1500);
    expect(useCookgameStore.getState().clock).toBe(1500);
  });

  it('wraps at the end of the day', () => {
    useCookgameStore.setState({ clock: DAY_LENGTH_MS - 200 });
    useCookgameStore.getState().tickClock(500);
    expect(useCookgameStore.getState().clock).toBe(300);
  });
});

describe('Vera night-only selling', () => {
  beforeEach(reset); // reuse the file's existing `reset` helper

  it('vera is night-windowed', async () => {
    const { BUYERS } = await import('../content');
    expect(BUYERS.find((b) => b.id === 'vera')?.timeWindow).toEqual(NIGHT_WINDOW);
  });

  it('refuses to sell to vera during the day', () => {
    // Give the player a packaged unit to sell.
    useCookgameStore.setState((s) => ({
      clock: 0.5 * DAY_LENGTH_MS, // noon
      inventory: {
        ...s.inventory,
        packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }],
      },
    }));
    const proceeds = useCookgameStore.getState().sellUnit('vera', 0, 1);
    expect(proceeds).toBe(0);
    expect(useCookgameStore.getState().inventory.packaged[0].units).toBe(1); // unchanged
  });

  it('sells to vera at night', () => {
    useCookgameStore.setState((s) => ({
      clock: 0.9 * DAY_LENGTH_MS, // night
      inventory: {
        ...s.inventory,
        packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }],
      },
    }));
    const proceeds = useCookgameStore.getState().sellUnit('vera', 0, 1);
    expect(proceeds).toBeGreaterThan(0);
  });
});

describe('journal tracking', () => {
  beforeEach(reset);

  it('mixIn records discovered effects and best value', () => {
    const store = useCookgameStore.getState();
    // Stock a base and an additive, load to bench, mix.
    store.buyBase('greenstart', 10);
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, additives: { ...s.inventory.additives, cuke: 1 } },
    }));
    useCookgameStore.getState().loadBaseToBench(0);
    useCookgameStore.getState().mixIn('cuke'); // cuke => 'energizing'

    const s = useCookgameStore.getState();
    expect(s.discoveredEffects).toContain('energizing');
    const key = s.discoveredRecipes[0];
    expect(s.recipeMeta[key]?.bestValue).toBeGreaterThan(0);
  });

  it('loadBaseToBench discovers a base bonus effect without mixing', () => {
    // couchlock carries the 'sedating' bonus effect.
    useCookgameStore.setState((s) => ({
      inventory: {
        ...s.inventory,
        baseStock: [{ baseId: 'couchlock', qualityMult: 1, bonusEffects: ['sedating'], units: 1 }],
      },
    }));
    useCookgameStore.getState().loadBaseToBench(0);
    expect(useCookgameStore.getState().discoveredEffects).toContain('sedating');
  });
});

describe('recipe meta actions', () => {
  beforeEach(reset);

  it('setRecipeName stores a trimmed name', () => {
    useCookgameStore.getState().setRecipeName('a+b', '  Night Fuel  ');
    expect(useCookgameStore.getState().recipeMeta['a+b'].name).toBe('Night Fuel');
  });

  it('an empty name clears the name but keeps other meta', () => {
    useCookgameStore.setState({ recipeMeta: { 'a+b': { name: 'X', bestValue: 50 } } });
    useCookgameStore.getState().setRecipeName('a+b', '   ');
    const m = useCookgameStore.getState().recipeMeta['a+b'];
    expect(m.name).toBeUndefined();
    expect(m.bestValue).toBe(50);
  });

  it('toggleRecipeFavorite flips the flag', () => {
    useCookgameStore.getState().toggleRecipeFavorite('a+b');
    expect(useCookgameStore.getState().recipeMeta['a+b'].favorite).toBe(true);
    useCookgameStore.getState().toggleRecipeFavorite('a+b');
    expect(useCookgameStore.getState().recipeMeta['a+b'].favorite).toBe(false);
  });

  it('setRecipeName on an unknown key with an empty name creates no ghost entry', () => {
    useCookgameStore.getState().setRecipeName('a+b', '   ');
    expect(useCookgameStore.getState().recipeMeta['a+b']).toBeUndefined();
  });
});

describe('dynamic demand', () => {
  beforeEach(reset);

  function giveSellable() {
    // One packaged unit with no effects (so it never matches a preference) sold to 'doug'.
    useCookgameStore.setState((s) => ({
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }] },
    }));
  }

  it('selling depletes the buyer demand and grants reputation', () => {
    giveSellable();
    const before = useCookgameStore.getState().buyerState['doug'];
    expect(before.demand).toBe(1);
    expect(before.reputation).toBe(0);
    useCookgameStore.getState().sellUnit('doug', 0, 1);
    const after = useCookgameStore.getState().buyerState['doug'];
    expect(after.demand).toBeCloseTo(1 - DEPLETE_PER_UNIT, 9);
    expect(after.reputation).toBeGreaterThan(0);
  });

  it('a saturated buyer pays less than a fresh buyer for the same product', () => {
    giveSellable();
    const fresh = useCookgameStore.getState().sellUnit('doug', 0, 1);
    // Saturate doug, then sell an identical unit.
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], demand: 0 } },
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }] },
    }));
    const saturated = useCookgameStore.getState().sellUnit('doug', 0, 1);
    expect(saturated).toBeLessThan(fresh);
  });

  it('tickDemand restocks a depleted buyer over time', () => {
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], demand: 0 } },
    }));
    useCookgameStore.getState().tickDemand(10000);
    expect(useCookgameStore.getState().buyerState['doug'].demand).toBeGreaterThan(0);
  });

  it('restocks continuously but does not roll preference drift before the drift interval', () => {
    reset();
    // Deplete doug so restock has visible work; capture its preference.
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], demand: 0.5 } },
    }));
    const pref0 = useCookgameStore.getState().buyerState['doug'].preferredEffect;
    useCookgameStore.getState().tickDemand(999); // < DRIFT_INTERVAL_MS (1000): no drift roll occurs
    const doug = useCookgameStore.getState().buyerState['doug'];
    expect(doug.demand).toBeGreaterThan(0.5);          // restock ran
    expect(doug.preferredEffect).toBe(pref0);          // drift was gated (deterministic — no roll happened)
  });

  it('price preference premium follows the dynamic (drifted) preferred effect', () => {
    reset();
    // Force doug's dynamic preference to 'spicy' (his static pref is 'energizing').
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], preferredEffect: 'spicy' } },
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: ['spicy'] }, units: 1 }] },
    }));
    const withPref = useCookgameStore.getState().sellUnit('doug', 0, 1);
    // Reset and sell an identical product WITHOUT the dynamic preferred effect.
    reset();
    useCookgameStore.setState((s) => ({
      buyerState: { ...s.buyerState, doug: { ...s.buyerState['doug'], preferredEffect: 'spicy' } },
      inventory: { ...s.inventory, packaged: [{ product: { baseId: 'greenstart', effects: [] }, units: 1 }] },
    }));
    const without = useCookgameStore.getState().sellUnit('doug', 0, 1);
    expect(withPref).toBeGreaterThan(without);
  });
});
