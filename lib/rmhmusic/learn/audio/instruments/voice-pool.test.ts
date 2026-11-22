import { describe, expect, it } from 'vitest';
import { createVoicePool } from './voice-pool';

describe('createVoicePool', () => {
  it('starts voices up to the cap without releasing any', () => {
    const p = createVoicePool(3, false);
    expect(p.start(1, 0).release).toEqual([]);
    expect(p.start(2, 0.1).release).toEqual([]);
    expect(p.start(3, 0.2).release).toEqual([]);
    expect(p.size).toBe(3);
  });

  it('at the cap steals the oldest voice already in release first', () => {
    const p = createVoicePool(3, false);
    p.start(1, 0);
    p.start(2, 1);
    p.start(3, 2);
    p.release(2, 3);
    expect(p.start(4, 4).release).toEqual([2]);
    expect(p.size).toBe(3);
  });

  it('then steals the oldest held voice', () => {
    const p = createVoicePool(2, false);
    p.start(1, 0);
    p.start(2, 1);
    expect(p.start(3, 2).release).toEqual([1]);
  });

  it('a mono pool releases the previous voice on every start', () => {
    const p = createVoicePool(1, true);
    expect(p.start(1, 0).release).toEqual([]);
    expect(p.start(2, 1).release).toEqual([1]);
    expect(p.start(3, 2).release).toEqual([2]);
    expect(p.size).toBe(1);
  });

  it('release twice is a no-op and ended removes the voice', () => {
    const p = createVoicePool(2, false);
    p.start(1, 0);
    p.release(1, 1);
    p.release(1, 2);
    p.ended(1);
    p.ended(1);
    expect(p.size).toBe(0);
  });

  it('starting the same id twice does not duplicate it', () => {
    const p = createVoicePool(4, false);
    p.start(1, 0);
    expect(p.start(1, 1).release).toEqual([]);
    expect(p.size).toBe(1);
  });

  it('1000 random operations never exceed the cap and never throw', () => {
    let seed = 12345;
    const rand = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (const [max, mono] of [
      [1, true],
      [2, false],
      [8, false],
      [12, false],
    ] as const) {
      const p = createVoicePool(max, mono);
      let t = 0;
      for (let i = 0; i < 1000; i++) {
        const id = Math.floor(rand() * 30);
        const r = rand();
        t += rand();
        if (r < 0.5) p.start(id, t);
        else if (r < 0.8) p.release(id, t);
        else p.ended(id);
        expect(p.size).toBeLessThanOrEqual(max);
      }
    }
  });
});
