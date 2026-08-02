/**
 * The two new mechanics, tested where they actually live: in the pure rules.
 *
 * Neither the globe field's renderer nor the lane's solver is exercised here —
 * one needs a canvas and the other needs a GPU. What IS here is everything a
 * bug would be cheap to ship in and expensive to find: the price ladder, the
 * multiplier stack, the ascension carry-over, the save round-trip, the two
 * clocks the boost runs on, and the geometry that decides whether an eight-globe
 * field still fits inside the stage.
 */
import { describe, it, expect } from 'vitest';
import { createInitialState } from '../store';
import type { GameState, SourceId } from '../types';
import { SOURCES } from '../data/sources';
import { GLOBES, MAX_GLOBES, globeCost, nextGlobe } from '../data/globes';
import {
  BOWL_BOOST_SECONDS,
  BOWL_COOLDOWN_SECONDS,
  BOWL_MAX_MULTIPLIER,
  BOWL_PINS,
  advanceBowl,
  bowlBallRadius,
  bowlMultiplier,
  bowlReady,
  createBowl,
  finishFrame,
} from '../bowling';
import {
  computeGlobeMultiplier,
  computeGlobeTouchMultiplier,
  computeGlobeVisible,
  computeGlobes,
  computeGrossJps,
  computeKeptGlobes,
  computeMultipliers,
  computeTouch,
} from '../engine';
import { doAscend, doBuyGlobe, doFinishFrame, doTouch } from '../actions';
import { applyTick, applyVigil } from '../tick';
import { readSave, stateToSave } from '../persistence';
import { LANE_WIDTH, PIN_SPOTS, countStanding, pinStanding, release } from '../lane';
import { MAX_PINS, hubRadius, layoutGlobes, placePins } from '../orbit';

/** A save deep enough that everything under test has something to work on. */
function rich(over: Partial<GameState> = {}): GameState {
  const base = createInitialState();
  return {
    ...base,
    initialized: true,
    joy: 1e24,
    peakJoy: 1e24,
    runJoy: 1e24,
    lifetimeJoy: 1e30,
    sources: Object.fromEntries(SOURCES.map((s, i) => [s.id, 60 - i])) as Record<SourceId, number>,
    ...over,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Globes
   ══════════════════════════════════════════════════════════════════════════ */

describe('the globe ladder', () => {
  it('has one globe per index, priced strictly upward, with the first free', () => {
    expect(GLOBES).toHaveLength(MAX_GLOBES);
    expect(GLOBES.map((g) => g.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(GLOBES[0]!.cost).toBe(0);
    for (let i = 1; i < GLOBES.length; i++) {
      expect(GLOBES[i]!.cost).toBeGreaterThan(GLOBES[i - 1]!.cost);
    }
  });

  it('offers exactly one globe at a time, and nothing past the last', () => {
    expect(nextGlobe(1)?.index).toBe(2);
    expect(nextGlobe(7)?.index).toBe(8);
    expect(nextGlobe(MAX_GLOBES)).toBeNull();
    // Infinity rather than a throw or a zero: every caller compares it against
    // joy, and this makes "no" the answer without a bounds check of its own.
    expect(globeCost(MAX_GLOBES)).toBe(Infinity);
  });

  it('lands each globe in the same region of the run as a source tier', () => {
    // A globe should arrive near a source tier rather than in a dead patch, so
    // the purchase competes with something. Each price sits within an order of
    // magnitude of some source's first copy.
    for (const globe of GLOBES.slice(1)) {
      const nearest = SOURCES.reduce((best, s) =>
        Math.abs(Math.log10(s.baseCost) - Math.log10(globe.cost)) <
        Math.abs(Math.log10(best.baseCost) - Math.log10(globe.cost))
          ? s
          : best,
      );
      expect(Math.abs(Math.log10(nearest.baseCost) - Math.log10(globe.cost))).toBeLessThan(2.2);
    }
  });
});

describe('what the globes are worth', () => {
  it('compounds ×1.5 a globe on the rate and ×1.25 by hand', () => {
    expect(computeGlobeMultiplier(rich({ globes: 1 }))).toBeCloseTo(1);
    expect(computeGlobeMultiplier(rich({ globes: 3 }))).toBeCloseTo(2.25);
    expect(computeGlobeMultiplier(rich({ globes: 8 }))).toBeCloseTo(1.5 ** 7, 5);
    expect(computeGlobeTouchMultiplier(rich({ globes: 8 }))).toBeCloseTo(1.25 ** 7, 5);
  });

  it('reaches the rate and the hand, and is itemised rather than folded in', () => {
    const one = rich({ globes: 1 });
    const four = rich({ globes: 4 });
    expect(computeGrossJps(four) / computeGrossJps(one)).toBeCloseTo(1.5 ** 3, 5);
    expect(computeTouch(four) / computeTouch(one)).toBeCloseTo(1.25 ** 3, 5);

    const m = computeMultipliers(four);
    expect(m.globes).toBeCloseTo(1.5 ** 3, 5);
    // The breakdown must actually multiply out to the total, or the panel that
    // shows it is lying about where a number came from.
    const product =
      m.blessings *
      m.devotion *
      m.grace *
      m.legacy *
      m.garden *
      m.choir *
      m.buffs *
      m.globes *
      m.bowl;
    expect(m.total).toBeCloseTo(product, 8);
  });

  it('clamps a hand-edited holding to the set that exists', () => {
    expect(computeGlobes(rich({ globes: 0 }))).toBe(1);
    expect(computeGlobes(rich({ globes: -4 }))).toBe(1);
    expect(computeGlobes(rich({ globes: 900 }))).toBe(MAX_GLOBES);
    expect(computeGlobes(rich({ globes: Number.NaN }))).toBe(1);
  });
});

describe('buying a globe', () => {
  it('takes the price, hands over the globe, and says so', () => {
    const before = rich({ globes: 1, joy: globeCost(1) });
    const after = doBuyGlobe(before);
    expect(after.globes).toBe(2);
    expect(after.globesBought).toBe(1);
    expect(after.joy).toBe(0);
    expect(after.notices.at(-1)?.title).toBe(GLOBES[1]!.name);
  });

  it('refuses when the joy is not there, and when the set is complete', () => {
    const poor = rich({ globes: 1, joy: globeCost(1) - 1 });
    expect(doBuyGlobe(poor)).toBe(poor);
    const full = rich({ globes: MAX_GLOBES, joy: Infinity });
    expect(doBuyGlobe(full)).toBe(full);
  });

  it('shows the next one only once it is within reach', () => {
    const cost = globeCost(1);
    expect(computeGlobeVisible(rich({ globes: 1, peakJoy: cost / 8 }))).toBe(false);
    expect(computeGlobeVisible(rich({ globes: 1, peakJoy: cost / 2 }))).toBe(true);
    expect(computeGlobeVisible(rich({ globes: MAX_GLOBES, peakJoy: Infinity }))).toBe(false);
  });
});

describe('globes through an ascension', () => {
  it('takes them all back when no Orbit rung has been bought', () => {
    const state = rich({ globes: 6, lifetimeJoy: 1e30, runJoy: 1e30 });
    expect(computeKeptGlobes(state)).toBe(1);
    expect(doAscend(state).globes).toBe(1);
  });

  it('keeps one more per Orbit rung, and never more than are owned', () => {
    const two = rich({ globes: 6, legacy: new Set(['orbit_1']) });
    expect(computeKeptGlobes(two)).toBe(2);

    const all = rich({ globes: 6, legacy: new Set(['orbit_1', 'orbit_2', 'orbit_3']) });
    expect(computeKeptGlobes(all)).toBe(4);
    expect(doAscend({ ...all, lifetimeJoy: 1e30, runJoy: 1e30 }).globes).toBe(4);

    // Three rungs but only two globes: you cannot keep what you never had.
    const thin = rich({ globes: 2, legacy: new Set(['orbit_1', 'orbit_2', 'orbit_3']) });
    expect(computeKeptGlobes(thin)).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The Bowl
   ══════════════════════════════════════════════════════════════════════════ */

describe('what a frame is worth', () => {
  it('runs from ×1 at nothing to ×4 at a clean rack, linearly', () => {
    expect(bowlMultiplier(0)).toBe(1);
    expect(bowlMultiplier(5)).toBeCloseTo(2.5);
    expect(bowlMultiplier(BOWL_PINS)).toBe(BOWL_MAX_MULTIPLIER);
    // A count outside the rack cannot buy more than a clean rack.
    expect(bowlMultiplier(40)).toBe(BOWL_MAX_MULTIPLIER);
    expect(bowlMultiplier(-3)).toBe(1);
  });

  it('starts both clocks, and only locks the hands when something went down', () => {
    const good = finishFrame(createBowl(), 7, 4);
    expect(good.multiplier).toBeCloseTo(3.1);
    expect(good.remaining).toBe(BOWL_BOOST_SECONDS);
    expect(good.cooldown).toBe(BOWL_COOLDOWN_SECONDS);
    expect(good.strikes).toBe(0);

    // A gutter frame costs the day but leaves the hands free: an hour of ×1
    // that you also cannot tap through would be strictly worse than not
    // bowling, and a mechanic nobody should ever use is not a mechanic.
    const gutter = finishFrame(createBowl(), 0, 0);
    expect(gutter.remaining).toBe(0);
    expect(gutter.multiplier).toBe(1);
    expect(gutter.cooldown).toBe(BOWL_COOLDOWN_SECONDS);

    expect(finishFrame(createBowl(), 10, 10).strikes).toBe(1);
    // Ten across two balls is a spare: it pays the same and is not a strike.
    expect(finishFrame(createBowl(), 10, 6).strikes).toBe(0);
  });

  it('grows the ball with the globes, without ever filling the lane', () => {
    expect(bowlBallRadius(1)).toBeLessThan(bowlBallRadius(8));
    // However many globes, the widest ball still has room to miss on both
    // sides — an investment that made a strike automatic would end the
    // mechanic.
    expect(bowlBallRadius(MAX_GLOBES) * 2).toBeLessThan(LANE_WIDTH * 0.35);
    // And it stops growing past the set, whatever a save claims.
    expect(bowlBallRadius(400)).toBe(bowlBallRadius(8));
  });
});

describe('the lane clocks', () => {
  it('counts both down, and drops the multiplier the moment the boost ends', () => {
    const running = finishFrame(createBowl(), 10, 10);
    const later = advanceBowl(running, BOWL_BOOST_SECONDS - 10);
    expect(later.remaining).toBe(10);
    expect(later.multiplier).toBe(BOWL_MAX_MULTIPLIER);

    const spent = advanceBowl(later, 20);
    expect(spent.remaining).toBe(0);
    expect(spent.multiplier).toBe(1);
    // The day keeps running underneath it.
    expect(spent.cooldown).toBeCloseTo(BOWL_COOLDOWN_SECONDS - BOWL_BOOST_SECONDS - 10);
  });

  it('opens the lane again only when the day is up and no boost is running', () => {
    const fresh = createBowl();
    expect(bowlReady(fresh, 1e9)).toBe(true);
    // …but not before the mechanic is unlocked at all.
    expect(bowlReady(fresh, 10)).toBe(false);

    const used = finishFrame(fresh, 8, 5);
    expect(bowlReady(used, 1e9)).toBe(false);
    expect(bowlReady(advanceBowl(used, BOWL_COOLDOWN_SECONDS), 1e9)).toBe(true);
  });
});

describe('the boost in play', () => {
  it('multiplies the rate and refuses the hand', () => {
    const idle = rich();
    const boosted = { ...idle, bowl: finishFrame(createBowl(), 10, 10) };
    expect(computeGrossJps(boosted) / computeGrossJps(idle)).toBeCloseTo(BOWL_MAX_MULTIPLIER, 5);

    // The refusal is the price of the hour, and it is enforced in the action so
    // that every caller — the store, the Steward, anything later — obeys it.
    const struck = doTouch(boosted);
    expect(struck).toBe(boosted);
    expect(doTouch(idle).totalTouches).toBe(1);
  });

  it('is counted down by the live tick', () => {
    const state = { ...rich(), bowl: finishFrame(createBowl(), 10, 10), lastTick: 1_000 };
    const ticked = applyTick(state, 6_000);
    expect(ticked.bowl.remaining).toBeCloseTo(BOWL_BOOST_SECONDS - 5);
    expect(ticked.bowl.cooldown).toBeCloseTo(BOWL_COOLDOWN_SECONDS - 5);
  });

  it('is spent by an absence, and pays for only the part of it that overlapped', () => {
    const bowl = finishFrame(createBowl(), 10, 10);
    const away = {
      ...rich(),
      bowl,
      // Long vigil terms, so the cap is not what this test is measuring.
      legacy: new Set(['gates_1', 'gates_2', 'gates_3']),
      lastSaved: 0,
    };
    // Four hours away against a one-hour boost.
    const result = applyVigil(away, 4 * 3600 * 1000, 0);
    expect(result.state.bowl.remaining).toBe(0);
    expect(result.state.bowl.cooldown).toBeCloseTo(BOWL_COOLDOWN_SECONDS - 4 * 3600);

    // …and the payout is four hours at base plus ONE hour of the extra ×3,
    // never four hours at ×4.
    const unboosted = applyVigil({ ...away, bowl: createBowl() }, 4 * 3600 * 1000, 0);
    const ratio = result.joy / unboosted.joy;
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(1.8);
  });

  it('will not bank a second frame off one cooldown', () => {
    const ready = rich({ bowl: createBowl() });
    const first = doFinishFrame(ready, 9, 6);
    expect(first.bowl.frames).toBe(1);
    // The alley is a long-lived component with a simulation inside it; a settle
    // that resolves after the state moved on must not hand out another hour.
    const second = doFinishFrame(first, 10, 10);
    expect(second.bowl.frames).toBe(1);
    expect(second.bowl.lastPins).toBe(9);
    expect(second.showBowl).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The lane's geometry
   ══════════════════════════════════════════════════════════════════════════ */

describe('the rack and the release', () => {
  it('stands ten pins in the standard triangle', () => {
    expect(PIN_SPOTS).toHaveLength(BOWL_PINS);
    const rows = new Map<string, number>();
    for (const [, z] of PIN_SPOTS) rows.set(z.toFixed(4), (rows.get(z.toFixed(4)) ?? 0) + 1);
    expect([...rows.values()].sort()).toEqual([1, 2, 3, 4]);
    // Every spot is on the boards.
    for (const [x] of PIN_SPOTS) expect(Math.abs(x)).toBeLessThan(LANE_WIDTH / 2);
  });

  it('releases a ball that is on the lane, rolling rather than skidding', () => {
    for (const aim of [-1, -0.4, 0, 0.4, 1]) {
      const shot = release(aim, 0.7, 0, 4);
      expect(Math.abs(shot.position[0]) + shot.radius).toBeLessThanOrEqual(LANE_WIDTH / 2);
      expect(shot.position[1]).toBeGreaterThan(shot.radius);
      // Spun about x at exactly the rate that rolls it: releasing with no roll
      // makes the ball skid the whole lane and robs the hook of its contact.
      expect(shot.angular[0]).toBeCloseTo(shot.velocity[2] / shot.radius, 6);
    }
  });

  it('clamps a slider that overshoots rather than throwing an impossible ball', () => {
    const wild = release(9, 9, -9, 4);
    const edge = release(1, 1, -1, 4);
    expect(wild.position).toEqual(edge.position);
    expect(wild.velocity).toEqual(edge.velocity);
    expect(wild.angular).toEqual(edge.angular);
  });
});

describe('counting the deck', () => {
  const upright = { x: 0, y: 0, z: 0, w: 1 };
  const onSpot = { x: 0, y: 0.19, z: 18 };

  it('counts a standing pin, and a pin knocked past the tipping angle', () => {
    expect(pinStanding(upright, onSpot)).toBe(true);
    // ~40° about z: past the 35° a human scorer has already called down.
    const tipped = { x: 0, y: 0, z: Math.sin(0.35), w: Math.cos(0.35) };
    expect(pinStanding(tipped, onSpot)).toBe(false);
    // …and one that is merely leaning is still up.
    const leaning = { x: 0, y: 0, z: Math.sin(0.12), w: Math.cos(0.12) };
    expect(pinStanding(leaning, onSpot)).toBe(true);
  });

  it('counts a pin that left the deck, however it is oriented', () => {
    expect(pinStanding(upright, { x: 0, y: 0.02, z: 18 })).toBe(false);
    expect(pinStanding(upright, { x: 2.4, y: 0.19, z: 18 })).toBe(false);
  });

  it('sums a rack', () => {
    const rack = PIN_SPOTS.map(([x, z], i) => ({
      rotation: upright,
      translation: { x, y: i < 3 ? 0.01 : 0.19, z: 18 + z },
    }));
    expect(countStanding(rack)).toBe(7);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The field
   ══════════════════════════════════════════════════════════════════════════ */

describe('laying out the field', () => {
  it('fits every globe inside the stage, at every count', () => {
    for (let n = 1; n <= MAX_GLOBES; n++) {
      const places = layoutGlobes(n, 0);
      expect(places).toHaveLength(n);
      for (const place of places) {
        // The stage is square and measured from its middle, so the half-width
        // is 0.5. Nothing may hang outside it.
        expect(Math.hypot(place.cx, place.cy) + place.r).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('never overlaps a satellite with the hub, and makes room when one arrives', () => {
    expect(hubRadius(1)).toBeGreaterThan(hubRadius(2));
    for (let n = 2; n <= MAX_GLOBES; n++) {
      const [hub, ...satellites] = layoutGlobes(n, 0);
      for (const s of satellites) {
        const gap = Math.hypot(s.cx - hub!.cx, s.cy - hub!.cy) - s.r - hub!.r;
        // They are allowed to touch — the field should look packed — but never
        // to sit inside one another.
        expect(gap).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('never overlaps two satellites either, even at a full ring', () => {
    const satellites = layoutGlobes(MAX_GLOBES, 0).slice(1);
    for (let i = 0; i < satellites.length; i++) {
      for (let j = i + 1; j < satellites.length; j++) {
        const a = satellites[i]!;
        const b = satellites[j]!;
        expect(Math.hypot(a.cx - b.cx, a.cy - b.cy)).toBeGreaterThan(a.r + b.r);
      }
    }
  });

  it('spins the ring without changing what is in it', () => {
    const still = layoutGlobes(5, 0);
    const turned = layoutGlobes(5, 90);
    expect(turned).toHaveLength(still.length);
    expect(turned[0]).toEqual(still[0]);
    for (let i = 1; i < still.length; i++) {
      expect(turned[i]!.r).toBe(still[i]!.r);
      expect(Math.hypot(turned[i]!.cx, turned[i]!.cy)).toBeCloseTo(
        Math.hypot(still[i]!.cx, still[i]!.cy),
        8,
      );
    }
  });
});

describe('placing the congregation', () => {
  const owned = Object.fromEntries(SOURCES.map((s) => [s.id, 5])) as Record<SourceId, number>;

  it('puts nothing on the field for a temple that owns nothing', () => {
    expect(placePins({}, 4)).toEqual([]);
  });

  it('caps the field, and keeps the deepest sources when it has to choose', () => {
    const pins = placePins(owned, 1);
    expect(pins.length).toBeLessThanOrEqual(MAX_PINS);
    // The top of the ladder is what a mature temple wants to look at.
    const deepest = SOURCES.at(-1)!.id;
    expect(pins.some((p) => p.id === deepest)).toBe(true);
  });

  it('spreads the congregation as globes are bought, and populates every one', () => {
    for (const globes of [1, 2, 4, 8]) {
      const pins = placePins(owned, globes);
      const used = new Set(pins.map((p) => p.globe));
      expect(used.size).toBe(globes);
      for (const globe of used) expect(globe).toBeLessThan(globes);
    }
  });

  it('gives every pin a place on the unit sphere', () => {
    for (const pin of placePins(owned, 3)) {
      expect(Math.hypot(pin.bx, pin.by, pin.bz)).toBeCloseTo(1, 6);
    }
  });

  it('is deterministic — the same temple draws the same field twice', () => {
    expect(placePins(owned, 5)).toEqual(placePins(owned, 5));
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The save
   ══════════════════════════════════════════════════════════════════════════ */

describe('the save', () => {
  it('carries the globes and the lane through a round trip', () => {
    const before = rich({
      globes: 5,
      globesBought: 4,
      bowl: advanceBowl(finishFrame(createBowl(), 8, 5), 120),
    });
    const after = readSave(JSON.parse(JSON.stringify(stateToSave(before))))!;
    expect(after.globes).toBe(5);
    expect(after.globesBought).toBe(4);
    expect(after.bowl).toEqual(before.bowl);
  });

  it('reads a v2 save as one globe and a lane nobody has used', () => {
    const v2 = { ...stateToSave(rich({ globes: 6 })), version: 2 as const };
    delete (v2 as Record<string, unknown>).globes;
    delete (v2 as Record<string, unknown>).globesBought;
    delete (v2 as Record<string, unknown>).bowl;

    const after = readSave(v2)!;
    expect(after.globes).toBe(1);
    expect(after.globesBought).toBe(0);
    expect(after.bowl).toEqual(createBowl());
  });

  it('refuses a hand-edited boost that would run for thirty years at ×900', () => {
    const save = stateToSave(rich());
    const after = readSave({
      ...save,
      globes: 4_000,
      bowl: {
        ...createBowl(),
        remaining: 1e9,
        multiplier: 900,
        cooldown: -50,
        bestPins: 99,
      },
    })!;
    expect(after.globes).toBe(MAX_GLOBES);
    expect(after.bowl!.remaining).toBe(BOWL_BOOST_SECONDS);
    expect(after.bowl!.multiplier).toBe(BOWL_MAX_MULTIPLIER);
    expect(after.bowl!.cooldown).toBe(0);
    expect(after.bowl!.bestPins).toBe(BOWL_PINS);
  });
});
