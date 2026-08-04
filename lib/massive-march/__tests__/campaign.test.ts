import { describe, expect, it } from 'vitest';

import {
  advanceClock,
  campaignIsNight,
  createCampaign,
  creditSolve,
  dayFraction,
  deposit,
  finish,
  fromSave,
  gateReady,
  refreshGate,
  skipSite,
  snapshot,
  solvedCount,
  totalDeposited,
  toSave,
} from '../campaign';
import { DAY_LENGTH_MS } from '../constants';
import type { PuzzleContext } from '../puzzles';
import { TOWERS } from '../world/sites';

/**
 * Progression, and the save that carries it between sessions.
 *
 * The gate tests are the important ones. A campaign that could be finished by
 * grinding the three easiest sites and walking past the synthesis would be a
 * different game from the one the design describes, and the only thing standing
 * between those two games is `gateReady`.
 */

function fresh() {
  return createCampaign({ seed: 99, variant: 'duo', name: 'A long walk' });
}

const emptyCtx: PuzzleContext = {
  now: 0,
  variant: 'duo',
  keys: new Set(),
  night: false,
  players: [],
};

describe('the clock', () => {
  it('starts mid-morning rather than in the dark', () => {
    const state = fresh();
    expect(campaignIsNight(state)).toBe(false);
    expect(dayFraction(state)).toBeGreaterThan(0.25);
    expect(dayFraction(state)).toBeLessThan(0.5);
  });

  it('comes back round to the same time after a full day', () => {
    const state = fresh();
    const start = dayFraction(state);
    for (let i = 0; i < 24; i++) advanceClock(state, DAY_LENGTH_MS / 24);
    expect(Math.abs(dayFraction(state) - start)).toBeLessThan(0.001);
  });

  it('gets dark eventually', () => {
    // `advanceClock` caps a single step, so that a stalled tick cannot fast
    // forward the island through a night nobody was there for. Walking the clock
    // forward means walking it, which is also what the server does.
    const state = fresh();
    for (let i = 0; i < 14; i++) advanceClock(state, DAY_LENGTH_MS / 24);
    expect(campaignIsNight(state)).toBe(true);
  });

  it('refuses to be fast-forwarded by one enormous step', () => {
    const state = fresh();
    advanceClock(state, DAY_LENGTH_MS * 10);
    expect(state.clockMs).toBeLessThanOrEqual(60_000);
  });
});

describe('towers', () => {
  it('hands over a key when its threshold is crossed, and only then', () => {
    const state = fresh();
    const yellow = TOWERS.find((t) => t.id === 'yellow')!;

    const short = deposit(state, 'yellow', yellow.threshold - 1);
    expect(short.some((event) => event.kind === 'key')).toBe(false);
    expect(state.keys).toHaveLength(0);

    const crossed = deposit(state, 'yellow', 1);
    expect(crossed.some((event) => event.kind === 'key')).toBe(true);
    expect(state.keys).toContain('yellow');
    expect(state.unlocks).toContain('cart');
  });

  it('does not hand out a second key for a second deposit', () => {
    const state = fresh();
    const yellow = TOWERS.find((t) => t.id === 'yellow')!;
    deposit(state, 'yellow', yellow.threshold);
    const again = deposit(state, 'yellow', 3);
    expect(again.some((event) => event.kind === 'key')).toBe(false);
    expect(state.keys).toEqual(['yellow']);
  });

  it('counts an over-deposit rather than throwing it away', () => {
    const state = fresh();
    deposit(state, 'yellow', 9);
    expect(state.deposits.yellow).toBe(9);
    expect(totalDeposited(state)).toBe(9);
  });
});

describe('the gate', () => {
  function feedEverything() {
    const state = fresh();
    for (const tower of TOWERS) deposit(state, tower.id, tower.threshold);
    return state;
  }

  it('stays shut on rounds alone', () => {
    const state = fresh();
    deposit(state, 'gate', 99);
    expect(gateReady(state)).toBe(false);
    expect(state.unlocks).not.toContain('gate');
  });

  it('stays shut without the Final March, however much has been given', () => {
    const state = feedEverything();
    expect(state.keys).toHaveLength(3);
    expect(gateReady(state)).toBe(false);
  });

  it('opens once the keys, the rounds and the Final March are all in', () => {
    const state = feedEverything();
    state.runtimes['final-march'].solved = true;
    expect(gateReady(state)).toBe(true);
    const events = refreshGate(state);
    expect(events.some((event) => event.kind === 'unlock')).toBe(true);
    expect(state.unlocks).toContain('gate');
  });

  it('accepts a skipped Final March, because that is what skipping is for', () => {
    const state = feedEverything();
    state.runtimes['final-march'].skipped = true;
    expect(gateReady(state)).toBe(true);
  });

  it('only finishes once', () => {
    const state = feedEverything();
    state.runtimes['final-march'].solved = true;
    expect(finish(state)).toHaveLength(1);
    expect(finish(state)).toHaveLength(0);
    expect(state.finished).toBe(true);
  });
});

describe('solving and skipping', () => {
  it('credits a solved site with its reward', () => {
    const state = fresh();
    const reward = creditSolve(state, 'tide-bells');
    expect(reward).toBeGreaterThan(0);
    expect(state.produced).toBe(reward);
  });

  it('produces the rounds a skipped site would have, so the campaign still moves', () => {
    const state = fresh();
    const events = skipSite(state, 'hoop-and-ball');
    expect(events.some((event) => event.kind === 'skipped')).toBe(true);
    expect(state.produced).toBeGreaterThan(0);
    expect(solvedCount(state)).toBe(1);
  });

  it('will not skip the same site twice', () => {
    const state = fresh();
    skipSite(state, 'hoop-and-ball');
    const produced = state.produced;
    expect(skipSite(state, 'hoop-and-ball')).toHaveLength(0);
    expect(state.produced).toBe(produced);
  });
});

describe('the save', () => {
  it('round-trips everything that matters', () => {
    const state = fresh();
    deposit(state, 'yellow', 5);
    state.runtimes['tide-bells'].solved = true;
    state.runtimes['sealed-booth'].discovered = true;
    advanceClock(state, DAY_LENGTH_MS * 0.4);
    state.allowSkip = true;

    const restored = fromSave(toSave(state));
    expect(restored.seed).toBe(state.seed);
    expect(restored.name).toBe(state.name);
    expect(restored.allowSkip).toBe(true);
    expect(restored.deposits.yellow).toBe(5);
    expect(restored.keys).toContain('yellow');
    expect(restored.runtimes['tide-bells'].solved).toBe(true);
    expect(restored.runtimes['sealed-booth'].discovered).toBe(true);
    expect(Math.abs(dayFraction(restored) - dayFraction(state))).toBeLessThan(0.001);
  });

  it('re-derives keys from deposits rather than trusting the stored list', () => {
    // A save written while a threshold was different should still land on the
    // right side of it — this is the one place old data meets new code.
    const state = fresh();
    deposit(state, 'yellow', 20);
    const save = toSave(state);
    save.keys = [];
    save.unlocks = [];
    const restored = fromSave(save);
    expect(restored.keys).toContain('yellow');
    expect(restored.unlocks).toContain('cart');
  });

  it('survives complete rubbish', () => {
    for (const junk of [null, undefined, 42, 'nope', {}, { seed: 'x', deposits: 'no' }]) {
      const restored = fromSave(junk);
      expect(restored.name.length).toBeGreaterThan(0);
      expect(Object.keys(restored.runtimes).length).toBeGreaterThan(10);
      expect(restored.finished).toBe(false);
    }
  });

  it('honours a key the save claims even when the deposits no longer explain it', () => {
    // Deliberately generous in this direction. The save is written by the hub
    // and never by a client, so there is nothing to defend against — and a group
    // that earned the ridge road under an older threshold should not come back
    // to find it shut.
    const restored = fromSave({
      seed: 5,
      variant: 'duo',
      keys: ['yellow', 'blue', 'red'],
      deposits: {},
    });
    expect(restored.keys).toEqual(['yellow', 'blue', 'red']);
  });

  it('ignores a key that is not a key at all', () => {
    const restored = fromSave({ seed: 5, variant: 'duo', keys: ['skeleton', 'yellow'], deposits: {} });
    expect(restored.keys).toEqual(['yellow']);
  });
});

describe('the snapshot', () => {
  it('describes every site and every tower', () => {
    const state = fresh();
    const view = snapshot(state, emptyCtx, 3, []);
    expect(view.puzzles.length).toBeGreaterThan(10);
    expect(view.towers).toHaveLength(TOWERS.length);
    expect(view.carried).toBe(3);
    expect(view.finished).toBe(false);
  });

  it('lists only the sites somebody has actually walked past', () => {
    const state = fresh();
    expect(snapshot(state, emptyCtx, 0, []).discovered).toEqual([]);
    state.runtimes['tide-bells'].discovered = true;
    expect(snapshot(state, emptyCtx, 0, []).discovered).toEqual(['tide-bells']);
  });
});
