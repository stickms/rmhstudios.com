import { describe, expect, it } from 'vitest';
import { formatClock, initialTimer, pickNextIndex, pickRandomIndex, timerReducer, type TimerState } from './practice';

const run = (s: TimerState, ...a: Parameters<typeof timerReducer>[1][]) => a.reduce(timerReducer, s);

describe('timerReducer', () => {
  it('starts at the chosen length, idle', () => {
    expect(initialTimer(60)).toEqual({ status: 'idle', duration: 60, remaining: 60 });
  });
  it('does not tick until started', () => {
    expect(run(initialTimer(60), { type: 'tick' }).remaining).toBe(60);
  });
  it('counts down while running and pauses', () => {
    let s = run(initialTimer(60), { type: 'start' }, { type: 'tick' }, { type: 'tick' });
    expect(s).toMatchObject({ status: 'running', remaining: 58 });
    s = run(s, { type: 'pause' }, { type: 'tick' });
    expect(s).toMatchObject({ status: 'paused', remaining: 58 });
    expect(run(s, { type: 'start' }).status).toBe('running');
  });
  it('stops at zero and needs a reset', () => {
    let s = run(initialTimer(60), { type: 'start' });
    for (let i = 0; i < 70; i++) s = timerReducer(s, { type: 'tick' });
    expect(s).toMatchObject({ status: 'done', remaining: 0 });
    expect(timerReducer(s, { type: 'start' })).toBe(s);
    expect(timerReducer(s, { type: 'reset' })).toEqual(initialTimer(60));
  });
  it('a new length resets the clock', () => {
    const s = run(initialTimer(60), { type: 'start' }, { type: 'tick' }, { type: 'duration', seconds: 180 });
    expect(s).toEqual({ status: 'idle', duration: 180, remaining: 180 });
  });
  it('reset keeps the length', () => {
    expect(run(initialTimer(180), { type: 'start' }, { type: 'tick' }, { type: 'reset' })).toEqual(initialTimer(180));
  });
});

describe('formatClock', () => {
  it('prints m:ss', () => {
    expect(formatClock(180)).toBe('3:00');
    expect(formatClock(65)).toBe('1:05');
    expect(formatClock(-3)).toBe('0:00');
  });
});

describe('picking', () => {
  it('random never repeats the current one and stays in range', () => {
    for (let c = 0; c < 4; c++)
      for (const r of [0, 0.3, 0.5, 0.99, 0.9999]) {
        const i = pickRandomIndex(4, c, () => r);
        expect(i).not.toBe(c);
        expect(i).toBeGreaterThanOrEqual(0);
        expect(i).toBeLessThan(4);
      }
  });
  it('random from none, from one, and from an empty list', () => {
    expect(pickRandomIndex(3, -1, () => 0.99)).toBe(2);
    expect(pickRandomIndex(1, 0)).toBe(0);
    expect(pickRandomIndex(0, -1)).toBe(-1);
  });
  it('next wraps', () => {
    expect(pickNextIndex(3, -1)).toBe(0);
    expect(pickNextIndex(3, 1)).toBe(2);
    expect(pickNextIndex(3, 2)).toBe(0);
    expect(pickNextIndex(0, 0)).toBe(-1);
  });
});
