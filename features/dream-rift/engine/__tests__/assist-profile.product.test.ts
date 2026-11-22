import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';
import { DIFFICULTY } from '../constants';
import { EMPTY_INPUT } from '../types';
import { World } from '../sim/world';
import {
  BULLET_RING_DASH,
  CALM_FLASH_CAP,
  NO_ASSIST_FLAGS,
  UNTIMED_DEATHBOMB_FRAMES,
  UNTIMED_GRAZE_RADIUS,
  advanceClock,
  applyHoldToggle,
  deathbombFramesFor,
  dreamRiftAssistFlags,
  dreamRiftCoopFlags,
  flashAmountFor,
  grazeRadiusFor,
  hitFlashBlend,
  type HoldState,
} from '../assist-profile';

const assisted = (over: Partial<Extract<AssistProfile, { ranked: false }>>): AssistProfile => ({
  ranked: false,
  holdToPress: false,
  speedFloor: 1,
  calmVisuals: false,
  colorSafe: false,
  noTimedInput: false,
  ...over,
});

describe('Dream Rift assist flags', () => {
  it('leaves the ranked profile and a missing profile as the plain game', () => {
    expect(dreamRiftAssistFlags(NO_ASSISTS)).toEqual(NO_ASSIST_FLAGS);
    expect(dreamRiftAssistFlags(null)).toEqual(NO_ASSIST_FLAGS);
    expect(dreamRiftAssistFlags(undefined)).toEqual(NO_ASSIST_FLAGS);
  });

  it('maps each setting to its own flag and marks the run assisted', () => {
    expect(dreamRiftAssistFlags(assisted({ calmVisuals: true }))).toMatchObject({
      active: true,
      calm: true,
      colorSafe: false,
    });
    expect(dreamRiftAssistFlags(assisted({ colorSafe: true }))).toMatchObject({
      active: true,
      colorSafe: true,
      calm: false,
    });
    expect(dreamRiftAssistFlags(assisted({ noTimedInput: true }))).toMatchObject({ active: true, untimed: true });
    expect(dreamRiftAssistFlags(assisted({ holdToPress: true }))).toMatchObject({ active: true, holdToggle: true });
    expect(dreamRiftAssistFlags(assisted({ speedFloor: 0.5 }))).toMatchObject({ active: true, clockScale: 0.5 });
  });

  it('clamps a stray speed floor into 0.5 to 1', () => {
    expect(dreamRiftAssistFlags(assisted({ speedFloor: 0.1 })).clockScale).toBe(0.5);
    expect(dreamRiftAssistFlags(assisted({ speedFloor: 7 })).clockScale).toBe(1);
  });

  it('co-op applies only the two visual assists, makes no claim, and never touches the pace', () => {
    const flags = dreamRiftCoopFlags({ calmVisuals: true, colorSafe: true });
    expect(flags).toEqual({ ...NO_ASSIST_FLAGS, calm: true, colorSafe: true });
    expect(flags.active).toBe(false);
    expect(flags.clockScale).toBe(1);
    expect(advanceClock(0, 16, flags)).toBe(16);
    expect(grazeRadiusFor(flags)).toBe(0);
    expect(deathbombFramesFor(flags)).toBe(0);
    expect(dreamRiftCoopFlags(null)).toEqual(NO_ASSIST_FLAGS);
  });
});

describe('calm visuals', () => {
  const calm = dreamRiftAssistFlags(assisted({ calmVisuals: true }));

  it('caps a flash to a faint fade and drops the additive hit blend', () => {
    expect(flashAmountFor(0.9, calm)).toBe(CALM_FLASH_CAP);
    expect(flashAmountFor(0.05, calm)).toBe(0.05);
    expect(hitFlashBlend(calm)).toBe(false);
  });

  it('leaves a plain run untouched', () => {
    expect(flashAmountFor(0.9, NO_ASSIST_FLAGS)).toBe(0.9);
    expect(hitFlashBlend(NO_ASSIST_FLAGS)).toBe(true);
  });
});

describe('colour-safe', () => {
  it('gives every bullet colour a ring pattern, with the patterns telling the colours apart', () => {
    const colours = Object.keys(BULLET_RING_DASH);
    expect(colours).toHaveLength(11);
    const patterns = new Set(colours.map((c) => JSON.stringify(BULLET_RING_DASH[c as keyof typeof BULLET_RING_DASH])));
    expect(patterns.size).toBe(colours.length);
  });
});

describe('no timed input', () => {
  const untimed = dreamRiftAssistFlags(assisted({ noTimedInput: true }));

  it('widens graze to the slowest tier and lengthens the death-bomb window', () => {
    expect(UNTIMED_GRAZE_RADIUS).toBe(Math.max(...Object.values(DIFFICULTY).map((d) => d.grazeRadius)));
    expect(grazeRadiusFor(untimed)).toBe(DIFFICULTY.easy.grazeRadius);
    expect(deathbombFramesFor(untimed)).toBe(UNTIMED_DEATHBOMB_FRAMES);
    expect(deathbombFramesFor(untimed)).toBeGreaterThan(8);
    expect(grazeRadiusFor(NO_ASSIST_FLAGS)).toBe(0);
    expect(deathbombFramesFor(NO_ASSIST_FLAGS)).toBe(0);
  });
});

describe('hold to press', () => {
  const flags = dreamRiftAssistFlags(assisted({ holdToPress: true }));
  const frame = (focus: boolean, shot = false) => ({ ...EMPTY_INPUT, focus, shot });

  it('is the plain frame when the assist is off', () => {
    const state: HoldState = { focusOn: false, focusWasDown: false };
    const f = frame(true);
    expect(applyHoldToggle(f, state, NO_ASSIST_FLAGS)).toBe(f);
  });

  it('fires automatically and makes focus a toggle on each fresh press', () => {
    const state: HoldState = { focusOn: false, focusWasDown: false };
    expect(applyHoldToggle(frame(false), state, flags)).toMatchObject({ shot: true, focus: false });
    expect(applyHoldToggle(frame(true), state, flags).focus).toBe(true);
    // Held: still on, no flicker.
    expect(applyHoldToggle(frame(true), state, flags).focus).toBe(true);
    // Released: stays on.
    expect(applyHoldToggle(frame(false), state, flags).focus).toBe(true);
    // Pressed again: off.
    expect(applyHoldToggle(frame(true), state, flags).focus).toBe(false);
  });
});

describe('speed floor and the seeded pattern', () => {
  /** Drive a seeded world until `simFrames` sim frames have run; return what it did and the real time it took. */
  function play(clockScale: number, simFrames: number) {
    const flags = dreamRiftAssistFlags(assisted({ speedFloor: clockScale }));
    const world = new World(DIFFICULTY.normal, 20261122);
    world.localSlot = 0;
    const stepMs = 1000 / 60;
    const spawns: number[] = [];
    let acc = 0;
    let realMs = 0;
    let frames = 0;
    while (frames < simFrames) {
      realMs += 8;
      acc = advanceClock(acc, 8, flags);
      while (acc >= stepMs && frames < simFrames) {
        acc -= stepMs;
        frames++;
        // The pattern: one RNG draw per sim frame drives a bullet's angle.
        const angle = world.rng.next() * Math.PI * 2;
        spawns.push(Math.round(angle * 1e6));
        world.spawnBullet({ x: 100, y: 50, angle, speed: 2, minSpeed: 0, maxSpeed: 9 });
        world.step(true);
      }
    }
    const bullets: number[] = [];
    world.bullets.forEach((b) => bullets.push(Math.round(b.x * 1e3), Math.round(b.y * 1e3)));
    return { spawns, bullets, realMs, frames };
  }

  it('plays the same pattern at half speed: same RNG draws, same bullets, twice the real time', () => {
    const full = play(1, 240);
    const half = play(0.5, 240);
    expect(half.frames).toBe(full.frames);
    expect(half.spawns).toEqual(full.spawns);
    expect(half.bullets).toEqual(full.bullets);
    expect(half.realMs / full.realMs).toBeGreaterThan(1.9);
    expect(half.realMs / full.realMs).toBeLessThan(2.1);
  });

  it('advances the accumulator by the scaled time', () => {
    const half = dreamRiftAssistFlags(assisted({ speedFloor: 0.5 }));
    expect(advanceClock(0, 20, half)).toBe(10);
    expect(advanceClock(5, 20, NO_ASSIST_FLAGS)).toBe(25);
  });
});
