import { describe, expect, it } from 'vitest';
import { NO_ASSISTS, type AssistProfile } from '@/lib/game/assist';
import { COMBO_GRACE, LANDING_TOLERANCE } from '../constants';
import { createRun, emptyInput, stepRun, type RunState } from '../game';
import { LEVELS, LEVEL_ORDER } from '../levels';
import {
  NO_ASSIST_FLAGS,
  UNTIMED_GRACE_SCALE,
  UNTIMED_TOLERANCE_SCALE,
  UNTIMED_TRICK_BUFFER,
  cappedSpeed,
  comboGraceFor,
  landingToleranceFor,
  nightrailAssistFlags,
  trickBufferFor,
  trickInput,
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

const level = LEVELS[LEVEL_ORDER[0]!];

function newRun(profile: AssistProfile | null): RunState {
  const run = createRun(level);
  run.assist = nightrailAssistFlags(profile);
  return run;
}

describe('Nightrail assist flags', () => {
  it('leaves the ranked profile and a missing profile as the plain game', () => {
    expect(nightrailAssistFlags(NO_ASSISTS)).toEqual(NO_ASSIST_FLAGS);
    expect(nightrailAssistFlags(null)).toEqual(NO_ASSIST_FLAGS);
    expect(createRun(level).assist).toEqual(NO_ASSIST_FLAGS);
  });

  it('maps each setting to its own flag and marks the run assisted', () => {
    expect(nightrailAssistFlags(assisted({ calmVisuals: true }))).toMatchObject({ active: true, calm: true });
    expect(nightrailAssistFlags(assisted({ colorSafe: true }))).toMatchObject({ active: true, colorSafe: true });
    expect(nightrailAssistFlags(assisted({ noTimedInput: true }))).toMatchObject({ active: true, untimed: true });
    expect(nightrailAssistFlags(assisted({ holdToPress: true }))).toMatchObject({ active: true, holdRepeat: true });
    expect(nightrailAssistFlags(assisted({ speedFloor: 0.5 }))).toMatchObject({ active: true, speedScale: 0.5 });
  });

  it('clamps a stray speed floor into 0.5 to 1', () => {
    expect(nightrailAssistFlags(assisted({ speedFloor: 0 })).speedScale).toBe(0.5);
    expect(nightrailAssistFlags(assisted({ speedFloor: 3 })).speedScale).toBe(1);
  });
});

describe('speed floor', () => {
  it('caps the train at that fraction of the level speed', () => {
    const half = nightrailAssistFlags(assisted({ speedFloor: 0.5 }));
    expect(cappedSpeed(100, half)).toBe(50);
    expect(cappedSpeed(100, NO_ASSIST_FLAGS)).toBe(100);
  });

  it('the sim never exceeds the capped speed, and a plain run goes faster', () => {
    const plain = newRun(null);
    const slow = newRun(assisted({ speedFloor: 0.5 }));
    const input = emptyInput();
    for (let i = 0; i < 120 * 40; i++) {
      stepRun(plain, input, 1 / 120);
      stepRun(slow, input, 1 / 120);
    }
    expect(slow.stats.maxSpeed).toBeLessThanOrEqual(level.maxSpeed * 0.5 + 1e-6);
    expect(slow.stats.maxSpeed).toBeLessThan(plain.stats.maxSpeed);
  });
});

describe('no timed input', () => {
  const untimed = nightrailAssistFlags(assisted({ noTimedInput: true }));

  it('lengthens the trick buffer, forgives more rotation and keeps the combo longer', () => {
    expect(trickBufferFor(untimed)).toBe(UNTIMED_TRICK_BUFFER);
    expect(trickBufferFor(NO_ASSIST_FLAGS)).toBe(0);
    expect(landingToleranceFor(LANDING_TOLERANCE, untimed)).toBeCloseTo(LANDING_TOLERANCE * UNTIMED_TOLERANCE_SCALE);
    expect(landingToleranceFor(LANDING_TOLERANCE, NO_ASSIST_FLAGS)).toBe(LANDING_TOLERANCE);
    expect(comboGraceFor(COMBO_GRACE, untimed)).toBe(COMBO_GRACE * UNTIMED_GRACE_SCALE);
    expect(comboGraceFor(COMBO_GRACE, NO_ASSIST_FLAGS)).toBe(COMBO_GRACE);
  });

  /** Roll to the run, press a trick on the ground, then jump: does the trick start in the air? */
  function pressTrickThenJump(profile: AssistProfile | null) {
    const run = newRun(profile);
    const step = 1 / 120;
    const idle = emptyInput();
    // Through the countdown.
    for (let i = 0; i < 120 * 5 && run.phase !== 'playing'; i++) stepRun(run, idle, step);
    expect(run.phase).toBe('playing');
    // A trick pressed while still on the ground.
    stepRun(run, { ...idle, trick: 'up' }, step);
    // Then the jump: hold, release.
    for (let i = 0; i < 20; i++) stepRun(run, { ...idle, jump: true }, step);
    let startedTrick = false;
    for (let i = 0; i < 120 && !startedTrick; i++) {
      stepRun(run, idle, step);
      startedTrick = run.train.trick !== null || run.stats.tricksLanded > 0;
    }
    return startedTrick;
  }

  it('a trick pressed just before take-off still fires, and not without the assist', () => {
    expect(pressTrickThenJump(assisted({ noTimedInput: true }))).toBe(true);
    expect(pressTrickThenJump(null)).toBe(false);
  });
});

describe('hold to press', () => {
  const hold = nightrailAssistFlags(assisted({ holdToPress: true }));

  it('a held direction stands for a press when there is none', () => {
    expect(trickInput(null, 'left', hold)).toBe('left');
  });

  it('a fresh press wins over the held one', () => {
    expect(trickInput('up', 'left', hold)).toBe('up');
  });

  it('is the plain input when the assist is off', () => {
    expect(trickInput(null, 'left', NO_ASSIST_FLAGS)).toBeNull();
    expect(trickInput('up', 'left', NO_ASSIST_FLAGS)).toBe('up');
  });
});

describe('calm visuals and colour-safe', () => {
  it('are carried to the renderer as flags and change nothing in the sim', () => {
    const calm = newRun(assisted({ calmVisuals: true, colorSafe: true }));
    const plain = newRun(null);
    const input = emptyInput();
    for (let i = 0; i < 120 * 10; i++) {
      stepRun(calm, input, 1 / 120);
      stepRun(plain, input, 1 / 120);
    }
    expect(calm.assist).toMatchObject({ calm: true, colorSafe: true });
    expect(calm.train.s).toBe(plain.train.s);
    expect(calm.score).toBe(plain.score);
  });
});
