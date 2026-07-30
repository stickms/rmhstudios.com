/**
 * Scoring: the multiplier curve, and the match's end-to-end resolution of a
 * garment into a bin.
 *
 * The bin tests drive the real solver rather than stubbing it — the thing worth
 * checking is that cloth landing in a basket is *detected* as landing in a
 * basket, and that only happens if the containment threshold and the physics
 * agree.
 */

import { describe, it, expect } from 'vitest';
import { LaundryMatch } from '../match';
import { ClothWorld } from '../solver';
import { buildArena } from '../arena';
import { FIXED_DT, SCORE, SUBSTEPS, binCenterX, comboMultiplier, scoreFor } from '../constants';

describe('comboMultiplier', () => {
  it('starts at 1 and adds 10% a step', () => {
    expect(comboMultiplier(0)).toBeCloseTo(1);
    expect(comboMultiplier(1)).toBeCloseTo(1.1);
    expect(comboMultiplier(5)).toBeCloseTo(1.5);
  });

  it('caps at double, so a long streak cannot run away with the board', () => {
    expect(comboMultiplier(SCORE.maxComboSteps)).toBeCloseTo(2);
    expect(comboMultiplier(SCORE.maxComboSteps + 50)).toBeCloseTo(2);
  });
});

describe('scoreFor', () => {
  it('awards the base value with no streak', () => {
    expect(scoreFor(true, 0)).toBe(SCORE.correct);
  });

  it('scales a correct sort by the streak', () => {
    expect(scoreFor(true, 10)).toBe(SCORE.correct * 2);
  });

  it('charges a flat penalty for the wrong bin, streak or not', () => {
    expect(scoreFor(false, 0)).toBe(SCORE.wrong);
    expect(scoreFor(false, 9)).toBe(SCORE.wrong);
  });

  it('always returns an integer', () => {
    for (let combo = 0; combo <= 12; combo++) {
      expect(Number.isInteger(scoreFor(true, combo))).toBe(true);
    }
  });
});

/**
 * Drive a match with the schedule emptied, then hand-place one garment. The
 * schedule is deterministic but busy; scoring is much clearer to assert on a
 * single controlled drop.
 */
function soloDrop(kind: 'shirt' | 'towel', colorIndex: number, overBin: number): LaundryMatch {
  const match = new LaundryMatch({ seed: 1, durationSec: 60, difficulty: 'relaxed' });
  match.drops.length = 0;
  match.world.spawn({
    kind,
    colorIndex,
    x: binCenterX(overBin),
    z: 0,
    roll: 0,
    yaw: 0,
    vx: 0,
    vy: 0,
    spinX: 0,
    spinY: 0,
    spinZ: 0,
    bow: 0,
  });
  for (let i = 0; i < 480; i++) match.advance(FIXED_DT);
  return match;
}

describe('LaundryMatch scoring', () => {
  it('scores a garment dropped in its matching bin', () => {
    const match = soloDrop('shirt', 2, 2);
    expect(match.stats.sorted).toBe(1);
    expect(match.stats.wrong).toBe(0);
    expect(match.stats.score).toBe(SCORE.correct);
    expect(match.stats.combo).toBe(1);
    expect(match.stats.bestCombo).toBe(1);
  });

  it('penalises the wrong bin and breaks the streak', () => {
    const match = soloDrop('shirt', 0, 3);
    expect(match.stats.wrong).toBe(1);
    expect(match.stats.sorted).toBe(0);
    expect(match.stats.combo).toBe(0);
    // Clamped at zero — the score never goes negative.
    expect(match.stats.score).toBe(0);
  });

  it('never lets the score go below zero', () => {
    const match = new LaundryMatch({ seed: 1, durationSec: 60, difficulty: 'relaxed' });
    match.drops.length = 0;
    for (let round = 0; round < 3; round++) {
      match.world.spawn({
        kind: 'shirt',
        colorIndex: 0,
        x: binCenterX(3),
        z: 0,
        roll: 0,
        yaw: 0,
        vx: 0,
        vy: 0,
        spinX: 0,
        spinY: 0,
        spinZ: 0,
        bow: 0,
      });
      for (let i = 0; i < 480; i++) match.advance(FIXED_DT);
    }
    expect(match.stats.wrong).toBe(3);
    expect(match.stats.score).toBe(0);
  });

  it('emits an event the HUD can render, positioned at the garment', () => {
    const match = new LaundryMatch({ seed: 1, durationSec: 60, difficulty: 'relaxed' });
    match.drops.length = 0;
    match.world.spawn({
      kind: 'shirt',
      colorIndex: 1,
      x: binCenterX(1),
      z: 0,
      roll: 0,
      yaw: 0,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      bow: 0,
    });

    let sorted: (typeof match.events)[number] | undefined;
    for (let i = 0; i < 480 && !sorted; i++) {
      match.advance(FIXED_DT);
      sorted = match.events.find((event) => event.type === 'sorted');
    }

    expect(sorted).toBeDefined();
    expect(sorted?.binIndex).toBe(1);
    expect(sorted?.points).toBe(SCORE.correct);
    expect(Math.abs((sorted?.x ?? 0) - binCenterX(1))).toBeLessThan(0.6);
  });

  it('resolves nearly every garment of an untouched round, misses included', () => {
    // An unplayed match: no grabs, so garments land wherever gravity and the
    // draft put them. Every one should end up sorted, wrong-binned or missed —
    // nothing should be left hanging in a limbo state that scores nothing and
    // never clears. This is the end-to-end check that the miss rule fires at
    // all, and that it fires for cloth resting on a bin lid rather than only
    // for cloth on the floor.
    const match = new LaundryMatch({ seed: 12, durationSec: 90, difficulty: 'standard' });
    const dropped = match.drops.length;
    // The round, plus enough tail for the last garments to settle.
    for (let i = 0; i < 90 * 60 + 600; i++) match.advance(FIXED_DT);

    const { sorted, wrong, missed } = match.stats;
    expect(missed).toBeGreaterThan(0);
    expect(sorted + wrong + missed).toBeGreaterThan(dropped * 0.9);
    expect(sorted + wrong + missed).toBeLessThanOrEqual(dropped);
  });

  it('does not call a garment the player is holding still a miss', () => {
    const match = new LaundryMatch({ seed: 1, durationSec: 60, difficulty: 'relaxed' });
    match.drops.length = 0;
    const garment = match.world.spawn({
      kind: 'shirt',
      colorIndex: 0,
      x: 0,
      z: 0,
      roll: 0,
      yaw: 0,
      vx: 0,
      vy: 0,
      spinX: 0,
      spinY: 0,
      spinZ: 0,
      bow: 0,
    });

    match.advance(FIXED_DT);
    expect(match.beginGrab({ ox: garment.cx, oy: garment.cy, oz: 8, dx: 0, dy: 0, dz: -1 })).toBe(
      true,
    );

    // Hold it perfectly still for well past the miss timer.
    for (let i = 0; i < 300; i++) {
      match.moveGrab({ ox: 0, oy: 3, oz: 8, dx: 0, dy: 0, dz: -1 });
      match.advance(FIXED_DT);
    }
    expect(match.stats.missed).toBe(0);
  });

  it('clears resolved garments so the particle budget stays bounded', () => {
    const match = new LaundryMatch({ seed: 8, durationSec: 60, difficulty: 'frantic' });
    for (let i = 0; i < 60 * 40; i++) match.advance(FIXED_DT);
    expect(match.world.garments.length).toBeLessThanOrEqual(12);
  });

  it('stops accepting input once the round is over', () => {
    const arena = buildArena();
    const world = new ClothWorld(arena);
    const match = new LaundryMatch({ seed: 1, durationSec: 60, difficulty: 'relaxed' });
    for (let i = 0; i < 60 * 61; i++) match.advance(FIXED_DT);
    expect(match.finished).toBe(true);
    expect(match.beginGrab({ ox: 0, oy: 3, oz: 8, dx: 0, dy: 0, dz: -1 })).toBe(false);
    // The standalone world is untouched — sanity that the guard is on the
    // match, not a global.
    world.step(FIXED_DT, SUBSTEPS);
    expect(world.time).toBeGreaterThan(0);
  });
});
