/**
 * The economy, pinned.
 *
 * Two kinds of test here. The first kind asserts that the source and upgrade
 * tables still match Cookie Clicker's, because those numbers are the balance
 * and a well-meaning tweak to one of them silently changes how long the game
 * is. The second kind asserts the properties that make an idle game *correct*
 * rather than merely tuned: purchases never overspend, a long absence is
 * simulated exactly once, and nothing anywhere produces a NaN.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../store';
import { applyTick, applyVigil } from '../tick';
import {
  computeAscensionGrace,
  computeDevotion,
  computeGraceEarned,
  computeGrossJps,
  computeJps,
  computeMaxAffordable,
  computeSourceCost,
  computeSourceCostN,
  computeSourceJps,
  computeTouch,
  computeVigil,
} from '../engine';
import {
  doAscend,
  doBuyBlessing,
  doBuySource,
  doLevelSource,
  doStrikeAllSinners,
  doTouch,
} from '../actions';
import { auditTrophies } from '../trophies';
import { SOURCES, SOURCE_MAP, COST_GROWTH } from '../data/sources';
import { BLESSINGS, BLESSING_MAP } from '../data/blessings';
import { TROPHIES, DEVOTION_PER_TROPHY } from '../data/trophies';
import { LEGACY, LEGACY_MAP, GRACE_DIVISOR } from '../data/legacy';
import { advanceManna, MANNA_RIPEN_MS, levelCost } from '../minigames/manna';
import { advanceGarden, SEED_MAP, unlockedPlots } from '../minigames/garden';
import { advanceExchange, GOODS, priceBand } from '../minigames/exchange';
import { advanceSinners, SINNER_APPETITE, sinnerPayout } from '../minigames/sinners';
import { formatNumber } from '../numbers';
import type { GameState, SourceId } from '../types';

const fresh = (): GameState => ({ ...createInitialState(), initialized: true });

/* ══════════════════════════════════════════════════════════════════════════
   The tables
   ══════════════════════════════════════════════════════════════════════════ */

describe('sources', () => {
  it("keeps Cookie Clicker's building ladder for the first twenty tiers", () => {
    // If one of these ever needs to change, the whole curve needs re-tuning —
    // that is the point of asserting them.
    const canonical: [SourceId, number, number][] = [
      ['acolyte', 15, 0.1],
      ['devotee', 100, 1],
      ['grove', 1_100, 8],
      ['quarry', 12_000, 47],
      ['chrismworks', 130_000, 260],
      ['almshouse', 1_400_000, 1_400],
      ['sanctuary', 20_000_000, 7_800],
      ['scriptorium', 330_000_000, 44_000],
      ['pilgrimFleet', 5_100_000_000, 260_000],
      ['reliquary', 75_000_000_000, 1_600_000],
      ['heavensGate', 1e12, 1e7],
      ['hourglass', 14e12, 65e6],
      ['raptureEngine', 170e12, 430e6],
      ['prism', 2.1e15, 2.9e9],
      ['fatebinder', 26e15, 21e9],
      ['mandala', 310e15, 150e9],
      ['apocrypha', 71e18, 1.1e12],
      ['paradise', 12e21, 8.3e12],
      ['oversoul', 1.9e24, 64e12],
      ['beloved', 540e24, 510e12],
    ];

    for (const [id, cost, jps] of canonical) {
      expect(SOURCE_MAP[id].baseCost, `${id} cost`).toBe(cost);
      expect(SOURCE_MAP[id].baseJps, `${id} jps`).toBe(jps);
    }
  });

  it('stays monotonic past the end of the known table', () => {
    for (let i = 1; i < SOURCES.length; i++) {
      expect(SOURCES[i]!.baseCost).toBeGreaterThan(SOURCES[i - 1]!.baseCost);
      expect(SOURCES[i]!.baseJps).toBeGreaterThan(SOURCES[i - 1]!.baseJps);
    }
  });

  it('opens exactly four minigames, one per gating source', () => {
    const gated = SOURCES.filter((s) => s.minigame).map((s) => s.minigame);
    expect(gated.sort()).toEqual(['choir', 'exchange', 'garden', 'hours']);
  });
});

describe('prices', () => {
  it('grows each copy by 1.15', () => {
    expect(computeSourceCost('acolyte', 0)).toBe(15);
    expect(computeSourceCost('acolyte', 1)).toBe(Math.ceil(15 * COST_GROWTH));
    expect(computeSourceCost('acolyte', 10)).toBe(Math.ceil(15 * COST_GROWTH ** 10));
  });

  it('sums n copies the same way a loop would', () => {
    // The closed form is what runs sixty times a second; the loop is what a
    // person would write. Compared relatively, because at 1e23 a double's
    // own granularity is ~1e7 and an absolute tolerance would be meaningless.
    for (const owned of [0, 7, 63, 300]) {
      for (const n of [1, 5, 37]) {
        let loop = 0;
        for (let i = 0; i < n; i++)
          loop += SOURCE_MAP.devotee.baseCost * COST_GROWTH ** (owned + i);
        const closed = computeSourceCostN('devotee', owned, n);
        // Tolerance is "one joy, or a double's own granularity at this
        // magnitude, whichever is larger" — the closed form rounds once at
        // the end, and at 1e23 the gap between representable doubles is ~1e7.
        expect(Math.abs(closed - Math.ceil(loop))).toBeLessThanOrEqual(Math.max(1, loop * 1e-9));
      }
    }
  });

  it('never lets "max" overspend, and never leaves an affordable copy behind', () => {
    for (const joy of [0, 14, 15, 99, 1e6, 1e12, 1e30]) {
      for (const owned of [0, 42, 380]) {
        const n = computeMaxAffordable('acolyte', owned, joy);
        expect(computeSourceCostN('acolyte', owned, n)).toBeLessThanOrEqual(joy);
        expect(computeSourceCostN('acolyte', owned, n + 1)).toBeGreaterThan(joy);
      }
    }
  });
});

describe('blessings', () => {
  it('gives every source ten doubling tiers on the canonical price ladder', () => {
    const requirement = [1, 5, 25, 50, 100, 150, 200, 250, 300, 350];
    const price = [10, 100, 500, 5e4, 5e6, 5e8, 5e11, 5e14, 5e17, 5e20];

    for (const source of SOURCES) {
      for (let tier = 0; tier < 10; tier++) {
        const def = BLESSING_MAP[`${source.id}_t${tier + 1}`];
        expect(def, `${source.id} tier ${tier + 1}`).toBeTruthy();
        expect(def!.sourceMultiplier).toEqual({ id: source.id, factor: 2 });
        expect(def!.cost).toBe(source.baseCost * price[tier]!);
        expect(def!.unlock.source).toEqual({ id: source.id, count: requirement[tier]! });
      }
    }
  });

  it('has no duplicate ids and no dangling prerequisites', () => {
    const ids = BLESSINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const blessing of BLESSINGS) {
      if (blessing.unlock.requires) {
        expect(BLESSING_MAP[blessing.unlock.requires], blessing.id).toBeTruthy();
      }
    }
  });

  it('turns ten tiers into a ×1024 source', () => {
    let state = fresh();
    state = { ...state, sources: { ...state.sources, devotee: 1 } };
    const before = computeSourceJps(state, 'devotee');

    for (let tier = 1; tier <= 10; tier++) {
      state = { ...state, blessings: new Set([...state.blessings, `devotee_t${tier}`]) };
    }
    expect(computeSourceJps(state, 'devotee') / before).toBeCloseTo(1024, 5);
  });
});

describe('trophies and devotion', () => {
  it('has no duplicate ids', () => {
    const ids = TROPHIES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pays 4% Devotion per trophy, and nothing for shadow trophies', () => {
    const state = fresh();
    expect(computeDevotion(state)).toBe(0);

    const withThree = { ...state, trophies: new Set(['joy_0', 'joy_1', 'joy_2']) };
    expect(computeDevotion(withThree)).toBeCloseTo(3 * DEVOTION_PER_TROPHY, 10);

    const withShadow = { ...withThree, trophies: new Set([...withThree.trophies, 'shadow_hoard']) };
    expect(computeDevotion(withShadow)).toBeCloseTo(3 * DEVOTION_PER_TROPHY, 10);
  });

  it('awards the same trophies however many times the audit runs', () => {
    let state = fresh();
    state = { ...state, lifetimeJoy: 1e9, totalTouches: 1200 };
    const once = auditTrophies(state);
    const twice = auditTrophies(once);
    expect([...twice.trophies].sort()).toEqual([...once.trophies].sort());
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Prestige
   ══════════════════════════════════════════════════════════════════════════ */

describe('grace', () => {
  it('is the cube root of lifetime joy over a trillion', () => {
    expect(computeGraceEarned(0)).toBe(0);
    expect(computeGraceEarned(GRACE_DIVISOR)).toBe(1);
    expect(computeGraceEarned(8 * GRACE_DIVISOR)).toBe(2);
    expect(computeGraceEarned(1000 * GRACE_DIVISOR)).toBe(10);
    expect(computeGraceEarned(1e21)).toBe(computeGraceEarned(1e21));
    expect(computeGraceEarned(1e21)).toBe(Math.floor(Math.cbrt(1e9)));
  });

  it('does nothing to your rate until a Communion rung is bought', () => {
    const base = { ...fresh(), grace: 500, sources: { ...fresh().sources, devotee: 10 } };
    const before = computeGrossJps(base);

    const withLadder = { ...base, legacy: new Set(['ladder']) };
    expect(computeGrossJps(withLadder)).toBeCloseTo(before, 6);

    const withCommunion = { ...base, legacy: new Set(['ladder', 'communion_1']) };
    // 5% of 500 Grace, at 1% each, is +25%.
    expect(computeGrossJps(withCommunion) / before).toBeCloseTo(1.25, 6);
  });

  it('reaches exactly 100% of Grace once all five Communions are held', () => {
    const share = LEGACY.filter((l) => l.graceShare).reduce((sum, l) => sum + l.graceShare!, 0);
    expect(share).toBeCloseTo(1, 10);
  });

  it('has no dangling prerequisites on the Ladder', () => {
    for (const rung of LEGACY) {
      for (const required of rung.requires ?? []) {
        expect(LEGACY_MAP[required], rung.id).toBeTruthy();
      }
    }
  });

  it('keeps Manna levels through an ascension and hands over the Grace', () => {
    let state = fresh();
    state = {
      ...state,
      lifetimeJoy: 1000 * GRACE_DIVISOR,
      runJoy: 1000 * GRACE_DIVISOR,
      joy: 5e9,
      sources: { ...state.sources, devotee: 40 },
      sourceLevels: { ...state.sourceLevels, grove: 4, sanctuary: 2 },
      blessings: new Set(['devotee_t1']),
    };

    const expected = computeAscensionGrace(state);
    expect(expected).toBe(10);

    const after = doAscend(state);
    expect(after.grace).toBe(10);
    expect(after.ascensions).toBe(1);
    expect(after.sourceLevels.grove).toBe(4);
    expect(after.sourceLevels.sanctuary).toBe(2);
    // The run itself is gone.
    expect(after.sources.devotee).toBe(0);
    expect(after.blessings.size).toBe(0);
    expect(after.runJoy).toBe(0);
    // Lifetime joy is never reset — the prestige formula depends on it.
    expect(after.lifetimeJoy).toBe(state.lifetimeJoy);
  });

  it('refuses to ascend for nothing', () => {
    const state = fresh();
    expect(computeAscensionGrace(state)).toBe(0);
    expect(doAscend(state)).toBe(state);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Manna
   ══════════════════════════════════════════════════════════════════════════ */

describe('manna', () => {
  it('ripens roughly once every twenty hours', () => {
    const { manna, ripened } = advanceManna(createInitialState().manna, MANNA_RIPEN_MS, 1, () => 0);
    expect(ripened).toBeGreaterThanOrEqual(1);
    expect(manna.held).toBe(ripened);
  });

  it('ripens the right number across a week away, not just one', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    // A fixed roll keeps every manna "plain", so the count is exact.
    const { ripened } = advanceManna(createInitialState().manna, week, 1, () => 0);
    expect(ripened).toBe(Math.floor(week / MANNA_RIPEN_MS));
  });

  it('charges level+1 to raise a source, and opens its minigame at level one', () => {
    let state = fresh();
    state = { ...state, manna: { ...state.manna, held: 3 } };
    expect(levelCost(0)).toBe(1);

    state = doLevelSource(state, 'grove');
    expect(state.sourceLevels.grove).toBe(1);
    expect(state.manna.held).toBe(2);
    expect(state.garden.unlocked).toBe(true);

    // Level two costs two.
    state = doLevelSource(state, 'grove');
    expect(state.sourceLevels.grove).toBe(2);
    expect(state.manna.held).toBe(0);

    // And with nothing left, nothing happens.
    expect(doLevelSource(state, 'grove')).toBe(state);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Minigames
   ══════════════════════════════════════════════════════════════════════════ */

describe('the garden', () => {
  it('does nothing until it is unlocked', () => {
    const garden = createInitialState().garden;
    expect(advanceGarden(garden, 60 * 60 * 1000, 1).garden).toBe(garden);
  });

  it('grows a sown plot to maturity over its stated time', () => {
    const base = createInitialState().garden;
    const index = [...unlockedPlots(1)][0]!;
    const plots = base.plots.map((p, i) =>
      i === index ? { seed: 'wheat' as const, growth: 0, age: 0 } : p,
    );

    const { garden } = advanceGarden(
      { ...base, unlocked: true, plots },
      SEED_MAP.wheat.tickSeconds * 1000,
      1,
      () => 1, // never crossbreed, never weed
    );

    expect(garden.plots[index]!.growth).toBeGreaterThanOrEqual(100);
  });

  it('opens more beds as the Grove is raised', () => {
    expect(unlockedPlots(1).size).toBe(4);
    expect(unlockedPlots(2).size).toBe(9);
    expect(unlockedPlots(5).size).toBe(36);
    expect(unlockedPlots(50).size).toBe(36);
  });

  it('survives a nine-hour absence without exploding', () => {
    const base = createInitialState().garden;
    const { garden } = advanceGarden(
      {
        ...base,
        unlocked: true,
        plots: base.plots.map(() => ({ seed: 'vine' as const, growth: 0, age: 0 })),
      },
      9 * 60 * 60 * 1000,
      5,
    );
    expect(garden.plots).toHaveLength(36);
    for (const plot of garden.plots) expect(Number.isFinite(plot.growth)).toBe(true);
  });
});

describe('the exchange', () => {
  it('keeps every price inside its band, however long you are away', () => {
    let exchange = { ...createInitialState().exchange, unlocked: true };
    exchange = advanceExchange(exchange, 30 * 24 * 60 * 60 * 1000, 5);

    for (const good of GOODS) {
      const band = priceBand(good.id, 5);
      const line = exchange.goods[good.id];
      expect(line.price).toBeGreaterThanOrEqual(band.low);
      expect(line.price).toBeLessThanOrEqual(band.high);
      expect(Number.isFinite(line.price)).toBe(true);
      expect(line.history).toHaveLength(32);
    }
  });

  it('moves at all — a market that never changes is not a market', () => {
    const start = { ...createInitialState().exchange, unlocked: true };
    const after = advanceExchange(start, 6 * 60 * 60 * 1000, 2);
    const moved = GOODS.some((g) => after.goods[g.id].price !== start.goods[g.id].price);
    expect(moved).toBe(true);
  });
});

describe('sinners', () => {
  it('drinks five percent of the rate each, once latched', () => {
    const latched = [
      { id: 1, swallowed: 0, arrival: 1, angle: 0, penitent: false },
      { id: 2, swallowed: 0, arrival: 1, angle: 90, penitent: false },
    ];
    // Spawning is suppressed with a roll that never fires.
    const { swallowed } = advanceSinners(
      latched,
      10,
      100,
      1,
      1,
      () => 0,
      () => 1,
    );
    expect(swallowed).toBeCloseTo(2 * SINNER_APPETITE * 100 * 10, 6);
  });

  it('hands everything back, with interest, when struck', () => {
    let state = fresh();
    state = {
      ...state,
      rapture: 1,
      sinners: [
        { id: 1, swallowed: 1000, arrival: 1, angle: 0, penitent: false },
        { id: 2, swallowed: 500, arrival: 1, angle: 90, penitent: true },
      ],
    };
    const before = state.joy;
    const after = doStrikeAllSinners(state);

    // 1000 × 1.1 for the ordinary one, 500 × 3 for the penitent.
    expect(after.joy - before).toBeCloseTo(1000 * 1.1 + 500 * 3, 6);
    expect(after.sinners).toHaveLength(0);
    expect(after.sinnersStruck).toBe(2);
  });

  it('pays a penitent Sinner triple', () => {
    const ordinary = { id: 1, swallowed: 100, arrival: 1, angle: 0, penitent: false };
    const penitent = { ...ordinary, penitent: true };
    expect(sinnerPayout(penitent, 1) / sinnerPayout(ordinary, 1)).toBeCloseTo(3 / 1.1, 6);
  });

  it('never spawns while at peace', () => {
    const { sinners } = advanceSinners(
      [],
      3600,
      100,
      0,
      1,
      () => 1,
      () => 0,
    );
    expect(sinners).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The loop
   ══════════════════════════════════════════════════════════════════════════ */

describe('the tick', () => {
  it('earns the rate, and nothing else', () => {
    let state = fresh();
    state = { ...state, sources: { ...state.sources, devotee: 10 }, lastTick: 1_000_000 };
    const rate = computeJps(state);

    const after = applyTick(state, 1_000_000 + 10_000);
    expect(after.joy).toBeCloseTo(rate * 10, 4);
    expect(after.lifetimeJoy).toBeCloseTo(rate * 10, 4);
    expect(after.runJoy).toBeCloseTo(rate * 10, 4);
  });

  it('never produces a NaN, however strange the state', () => {
    let state = fresh();
    state = {
      ...state,
      sources: Object.fromEntries(SOURCES.map((s) => [s.id, 400])) as Record<SourceId, number>,
      blessings: new Set(BLESSINGS.map((b) => b.id)),
      trophies: new Set(TROPHIES.map((t) => t.id)),
      legacy: new Set(LEGACY.map((l) => l.id)),
      grace: 1e6,
      rapture: 3,
      lastTick: 1_000_000,
    };

    const after = applyTick(state, 1_000_000 + 16);
    expect(Number.isFinite(after.joy)).toBe(true);
    expect(Number.isFinite(computeJps(after))).toBe(true);
    expect(Number.isFinite(computeTouch(after))).toBe(true);
    expect(formatNumber(computeGrossJps(after))).not.toMatch(/NaN/);
  });

  it('clamps a single step, so a slept tab does not integrate an hour at once', () => {
    let state = fresh();
    state = { ...state, sources: { ...state.sources, devotee: 10 }, lastTick: 1_000_000 };
    const rate = computeJps(state);

    const after = applyTick(state, 1_000_000 + 3_600_000);
    // 60 seconds of income, not 3600 — the rest belongs to the vigil.
    expect(after.joy).toBeCloseTo(rate * 60, 4);
  });
});

describe('the vigil', () => {
  const withVigilTerms = (): GameState => {
    const state = fresh();
    return {
      ...state,
      sources: { ...state.sources, devotee: 100 },
      // gates_3 plus the vigil blessings gets efficiency to 1 and the window wide.
      legacy: new Set(['ladder', 'gates_1', 'gates_2', 'gates_3']),
      blessings: new Set(['vigil_1', 'vigil_2', 'vigil_3', 'vigil_4']),
    };
  };

  it('caps income by the vigil window but not by the absence', () => {
    const base = fresh();
    const state = { ...base, sources: { ...base.sources, devotee: 100 }, lastSaved: 0 };
    const { hours, efficiency } = computeVigil(state);
    expect(hours).toBe(2);
    expect(efficiency).toBeCloseTo(0.2, 6);

    const rate = computeGrossJps(state);
    // Away for a day; only two hours of it counts.
    const result = applyVigil(state, 24 * 3600 * 1000);
    expect(result.joy).toBeCloseTo(rate * hours * 3600 * efficiency, 2);
  });

  it('widens with the Ladder', () => {
    const state = withVigilTerms();
    const { hours, efficiency } = computeVigil(state);
    expect(hours).toBeGreaterThan(100);
    expect(efficiency).toBe(1);
  });

  it('runs the Sinners for the whole absence, capped income or not', () => {
    const base = fresh();
    const state: GameState = {
      ...base,
      sources: { ...base.sources, devotee: 100 },
      rapture: 3,
      sinners: [{ id: 1, swallowed: 0, arrival: 1, angle: 0, penitent: false }],
      lastSaved: 0,
    };

    // Both absences are past the two-hour income window, so the income is
    // identical and it is the Sinners that make the longer one worth more —
    // which is the entire design.
    const short = applyVigil(state, 4 * 3600 * 1000);
    const long = applyVigil(state, 24 * 3600 * 1000);

    expect(long.joy).toBeCloseTo(short.joy, 2);
    expect(long.sinnerJoy).toBeGreaterThan(short.sinnerJoy * 5);
  });

  it('ripens manna and grows the garden across the whole absence', () => {
    const base = fresh();
    const index = [...unlockedPlots(1)][0]!;
    const state: GameState = {
      ...base,
      sourceLevels: { ...base.sourceLevels, grove: 1 },
      garden: {
        ...base.garden,
        unlocked: true,
        plots: base.garden.plots.map((p, i) =>
          i === index ? { seed: 'wheat' as const, growth: 0, age: 0 } : p,
        ),
      },
      lastSaved: 0,
    };

    const result = applyVigil(state, 40 * 3600 * 1000);
    expect(result.manna).toBeGreaterThanOrEqual(1);
    expect(result.state.garden.plots[index]!.growth).toBeGreaterThanOrEqual(100);
  });

  it('reports nothing for a blink', () => {
    const state = { ...fresh(), lastSaved: 1_000 };
    const result = applyVigil(state, 1_500);
    expect(result.seconds).toBe(0);
    expect(result.joy).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Actions
   ══════════════════════════════════════════════════════════════════════════ */

describe('actions', () => {
  it('refuse rather than half-apply when they cannot happen', () => {
    const state = fresh();
    expect(doBuySource(state, 'devotee', 1)).toBe(state);
    expect(doBuyBlessing(state, 'devotee_t1')).toBe(state);
    expect(doBuyBlessing(state, 'no-such-blessing')).toBe(state);
  });

  it('charges exactly what the price says', () => {
    const state = { ...fresh(), joy: 1_000_000 };
    const cost = computeSourceCostN('devotee', 0, 10);
    const after = doBuySource(state, 'devotee', 10);
    expect(after.joy).toBe(1_000_000 - cost);
    expect(after.sources.devotee).toBe(10);
  });

  it('pays out a hand offering, and counts it', () => {
    const state = fresh();
    const gain = computeTouch(state);
    const after = doTouch(state, 5_000);
    expect(after.joy).toBeCloseTo(gain, 6);
    expect(after.totalTouches).toBe(1);
  });

  it('rewards a sustained burst of offerings', () => {
    let state = fresh();
    let now = 10_000;
    // Eight in under three seconds crosses the fervour threshold.
    for (let i = 0; i < 7; i++) state = doTouch(state, (now += 100));
    const beforeEighth = state.joy;
    state = doTouch(state, (now += 100));
    const eighth = state.joy - beforeEighth;

    const single = computeTouch(fresh());
    expect(eighth).toBeCloseTo(single * 1.5, 5);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Numbers
   ══════════════════════════════════════════════════════════════════════════ */

describe('formatting', () => {
  it('keeps small numbers exact and large ones legible', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(15)).toBe('15');
    expect(formatNumber(999)).toBe('999');
    expect(formatNumber(1_000)).toBe('1.000 K');
    expect(formatNumber(1_500_000)).toBe('1.500 M');
    expect(formatNumber(1e12)).toBe('1.000 T');
  });

  it('has a name for every magnitude the game can reach', () => {
    for (let exponent = 3; exponent <= 210; exponent += 3) {
      const text = formatNumber(10 ** exponent);
      expect(text, `1e${exponent}`).not.toMatch(/undefined|NaN/);
    }
  });
});
