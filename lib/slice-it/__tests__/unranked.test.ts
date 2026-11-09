import { describe, expect, it } from 'vitest';
import { DEFAULT_MODIFIERS, unrankedReason } from '../modifiers';
import { musicGain, sfxGain } from '../store';

/**
 * What keeps a run off the leaderboard. One function decides it for the results
 * label, the client's submit guard and the server's refusal, so these cases are
 * the whole contract.
 */
describe('unrankedReason', () => {
  const mods = (patch: Partial<typeof DEFAULT_MODIFIERS>) => ({ ...DEFAULT_MODIFIERS, ...patch });

  it('lets a plain run through', () => {
    expect(unrankedReason(mods({}), false)).toBeNull();
  });

  it('lets bonus modifiers through — they are what the multiplier is for', () => {
    expect(
      unrankedReason(
        mods({ healthGauge: true, perfectionist: true, strictTiming: true, speed: 1.5 }),
        false,
      ),
    ).toBeNull();
  });

  it('keeps lenient timing off the board', () => {
    expect(unrankedReason(mods({ lenientTiming: true }), false)).toBe('lenient');
  });

  it.each(['noFail', 'assist', 'tapHolds'] as const)('keeps %s off the board', (key) => {
    expect(unrankedReason(mods({ [key]: true }), false)).toBe('assist');
  });

  it('keeps a slowed run off the board', () => {
    expect(unrankedReason(mods({ speed: 0.9 }), false)).toBe('speed');
  });

  it('keeps a run with a guide sound off the board', () => {
    expect(unrankedReason(mods({}), true)).toBe('practice');
  });

  it('names the first reason when several apply', () => {
    expect(unrankedReason(mods({ speed: 0.5, lenientTiming: true }), true)).toBe('speed');
    expect(unrankedReason(mods({ lenientTiming: true, noFail: true }), true)).toBe('lenient');
  });

  it('reads a blob saved before the flags existed as ranked', () => {
    expect(unrankedReason({ speed: 1 }, false)).toBeNull();
    expect(unrankedReason({}, false)).toBeNull();
  });
});

describe('volume gains', () => {
  it('scales music and effects by the master', () => {
    expect(musicGain(50, 100)).toBeCloseTo(0.5);
    expect(sfxGain(50, 80)).toBeCloseTo(0.4);
    expect(musicGain(100, 100)).toBe(1);
  });

  it('is silent when the master is, whatever the others say', () => {
    expect(musicGain(0, 100)).toBe(0);
    expect(sfxGain(0, 100)).toBe(0);
  });

  it('keeps music and effects independent under the master', () => {
    expect(musicGain(100, 0)).toBe(0);
    expect(sfxGain(100, 0)).toBe(0);
    expect(musicGain(100, 30)).toBeCloseTo(0.3);
    expect(sfxGain(100, 30)).toBeCloseTo(0.3);
  });

  it('clamps nonsense instead of passing it to the audio graph', () => {
    expect(musicGain(250, 100)).toBe(1);
    expect(sfxGain(-5, 100)).toBe(0);
  });
});
