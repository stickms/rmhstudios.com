/**
 * Vega's assists (sprint 13 02): each shared setting maps to its knob, the default profile changes nothing,
 * the speed floor is bounded, the run clock follows it, and colour-safe adds a shape as well as a palette.
 * Pure: no DOM, no canvas.
 */
import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';
import {
  FAST_SPEED,
  MIN_VEGA_SPEED,
  NO_VEGA_ASSIST,
  SPECIMEN_GLYPH,
  vegaAssistFlags,
} from '@features/vega/engine/assist-profile';
import { P, P_SAFE, SPECIMEN_LOOK, SPECIMEN_LOOK_SAFE, paletteFor, specimenLookFor } from '@features/vega/engine/art';
import { TimeManager } from '@features/vega/engine/TimeManager';
import { STEP_S } from '@features/vega/engine/data';

function assisted(over: Partial<Extract<AssistProfile, { ranked: false }>> = {}): AssistProfile {
  return {
    ranked: false,
    holdToPress: false,
    speedFloor: 1,
    calmVisuals: false,
    colorSafe: false,
    noTimedInput: false,
    ...over,
  };
}

describe('the profile to Vega knobs', () => {
  it('a ranked profile, or none, changes nothing', () => {
    expect(vegaAssistFlags(NO_ASSISTS)).toBe(NO_VEGA_ASSIST);
    expect(vegaAssistFlags(null)).toBe(NO_VEGA_ASSIST);
    expect(vegaAssistFlags(undefined)).toBe(NO_VEGA_ASSIST);
    expect(NO_VEGA_ASSIST).toEqual({
      active: false,
      minSpeed: 1,
      calm: false,
      palette: 'default',
      pauseAnywhere: false,
    });
  });

  it('an assisted profile with nothing Vega honours is the plain game', () => {
    expect(vegaAssistFlags(assisted({ holdToPress: true }))).toBe(NO_VEGA_ASSIST);
  });

  it('speedFloor becomes minSpeed', () => {
    expect(vegaAssistFlags(assisted({ speedFloor: 0.5 }))).toMatchObject({ active: true, minSpeed: 0.5, calm: false });
    expect(vegaAssistFlags(assisted({ speedFloor: 0.75 })).minSpeed).toBe(0.75);
  });

  it('the speed floor is bounded to 0.5 to 1', () => {
    expect(vegaAssistFlags(assisted({ speedFloor: 0.1, calmVisuals: true })).minSpeed).toBe(MIN_VEGA_SPEED);
    expect(vegaAssistFlags(assisted({ speedFloor: 7, calmVisuals: true })).minSpeed).toBe(1);
    expect(vegaAssistFlags(assisted({ speedFloor: Number.NaN, calmVisuals: true })).minSpeed).toBe(1);
  });

  it('calmVisuals becomes calm', () => {
    expect(vegaAssistFlags(assisted({ calmVisuals: true }))).toEqual({
      active: true,
      minSpeed: 1,
      calm: true,
      palette: 'default',
      pauseAnywhere: false,
    });
  });

  it('colorSafe becomes the safe palette', () => {
    expect(vegaAssistFlags(assisted({ colorSafe: true }))).toMatchObject({
      active: true,
      palette: 'safe',
      calm: false,
    });
  });

  it('noTimedInput becomes pauseAnywhere', () => {
    expect(vegaAssistFlags(assisted({ noTimedInput: true }))).toMatchObject({ active: true, pauseAnywhere: true });
  });

  it('all four together', () => {
    expect(
      vegaAssistFlags(assisted({ speedFloor: 0.5, calmVisuals: true, colorSafe: true, noTimedInput: true })),
    ).toEqual({ active: true, minSpeed: 0.5, calm: true, palette: 'safe', pauseAnywhere: true });
  });
});

describe('the run clock', () => {
  const stepsIn = (tm: TimeManager, seconds: number) => {
    let n = 0;
    for (let i = 0; i < Math.round(seconds * 20); i++) n += tm.frame(50, true);
    return n;
  };

  it('at the default floor nothing changes: speed 1, fast 2', () => {
    const tm = new TimeManager();
    expect(tm.speed).toBe(1);
    tm.toggleSpeed();
    expect(tm.speed).toBe(FAST_SPEED);
    tm.toggleSpeed();
    expect(tm.speed).toBe(1);
  });

  it('with the floor at 0.5 the slowest speed is half the normal speed', () => {
    const plain = new TimeManager(0, 1);
    const slow = new TimeManager(0, 0.5);
    expect(slow.speed).toBe(0.5);
    const a = stepsIn(plain, 10);
    const b = stepsIn(slow, 10);
    expect(b / a).toBeGreaterThan(0.45);
    expect(b / a).toBeLessThan(0.55);
    expect(a).toBeGreaterThan(Math.floor(10 / STEP_S) - 2);
  });

  it('the fast toggle stays 2x and returns to the floor', () => {
    const tm = new TimeManager(0, 0.5);
    tm.toggleSpeed();
    expect(tm.speed).toBe(2);
    tm.toggleSpeed();
    expect(tm.speed).toBe(0.5);
  });

  it('a slower run only lengthens the wall-clock duration for the same game time', () => {
    const plain = new TimeManager(0, 1);
    const slow = new TimeManager(0, 0.5);
    let plainSteps = 0;
    let slowSteps = 0;
    while (plainSteps < 400) plainSteps += plain.frame(50, true);
    while (slowSteps < 400) slowSteps += slow.frame(50, true);
    expect(slow.elapsedMs).toBeGreaterThan(plain.elapsedMs * 1.8);
  });
});

describe('colour-safe adds a shape, never colour alone', () => {
  const types = Object.keys(SPECIMEN_LOOK) as (keyof typeof SPECIMEN_LOOK)[];

  it('every specimen type carries a different outline glyph', () => {
    expect(Object.keys(SPECIMEN_GLYPH).sort()).toEqual([...types].sort());
    expect(new Set(Object.values(SPECIMEN_GLYPH)).size).toBe(types.length);
  });

  it('the safe look table covers every type, keeps the radii and changes every body colour', () => {
    expect(Object.keys(SPECIMEN_LOOK_SAFE).sort()).toEqual([...types].sort());
    for (const t of types) {
      expect(SPECIMEN_LOOK_SAFE[t].r).toBe(SPECIMEN_LOOK[t].r);
      expect(SPECIMEN_LOOK_SAFE[t].body).not.toBe(SPECIMEN_LOOK[t].body);
    }
    expect(new Set(types.map((t) => SPECIMEN_LOOK_SAFE[t].body)).size).toBe(types.length);
  });

  it('the palette is chosen by the profile', () => {
    expect(paletteFor('default')).toBe(P);
    expect(paletteFor(undefined)).toBe(P);
    expect(paletteFor('safe')).toBe(P_SAFE);
    expect(specimenLookFor('safe')).toBe(SPECIMEN_LOOK_SAFE);
    expect(specimenLookFor('default')).toBe(SPECIMEN_LOOK);
  });

  it('the safe palette no longer pairs green with red for good and bad', () => {
    expect(P_SAFE.mint).not.toBe(P.mint);
    expect(P_SAFE.blood).not.toBe(P.blood);
    expect(Object.keys(P_SAFE).sort()).toEqual(Object.keys(P).sort());
  });
});
