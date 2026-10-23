import { describe, expect, it } from 'vitest';
import { ambientTickDue, msToAmbientTick } from '../ambient-tick';

describe('ambient tick grid', () => {
  it('is never due at 0 Hz, and the next tick never comes', () => {
    expect(ambientTickDue(1000, 0, 0)).toBe(false);
    expect(msToAmbientTick(1000, 0)).toBe(Infinity);
  });

  it('is due on the first call, then once per grid cell', () => {
    expect(ambientTickDue(500, 0, 12)).toBe(true);
    // 12 Hz cells are 83.3 ms: 0–83.3, 83.3–166.7, …
    expect(ambientTickDue(80, 10, 12)).toBe(false);
    expect(ambientTickDue(84, 80, 12)).toBe(true);
  });

  it('puts clocks with different phases on the same frames', () => {
    // Two clocks that last ticked at different times inside the same cell are both due on the next cell, and neither
    // before it — so they never draw on different vsyncs.
    for (const last of [1, 40, 83]) {
      expect(ambientTickDue(83, last, 12)).toBe(false);
      expect(ambientTickDue(84, last, 12)).toBe(true);
    }
  });

  it('wakes just past the next boundary', () => {
    const period = 1000 / 12;
    const wait = msToAmbientTick(100, 12);
    expect(100 + wait).toBeGreaterThan(2 * period);
    expect(100 + wait).toBeLessThanOrEqual(2 * period + 1 + 1e-9);
    expect(ambientTickDue(100 + wait, 100, 12)).toBe(true);
  });
});
