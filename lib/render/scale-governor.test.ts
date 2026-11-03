import { describe, expect, it } from 'vitest';
import { DROP_AFTER_MS, RISE_AFTER_MS, RenderScaleGovernor } from './scale-governor';

const opts = { slowMs: 24, fastMs: 18 };

/** Feed `ms`-spaced frames for `totalMs`; returns every index change. */
function run(g: RenderScaleGovernor, start: number, ms: number, totalMs: number) {
  const changes: number[] = [];
  let t = start;
  for (; t < start + totalMs; t += ms) {
    const r = g.sample(t);
    if (r !== null) changes.push(r);
  }
  return { changes, end: t };
}

describe('RenderScaleGovernor', () => {
  it('steps down on a GPU-bound cadence even though each draw() is cheap', () => {
    const g = new RenderScaleGovernor(4, opts);
    // 500 ms frame interval (2 fps): must drop within a few frames, not 45.
    const { changes } = run(g, 1000, 500, 6000);
    expect(changes[0]).toBe(2);
    expect(g.index).toBe(0);
  });

  it('holds scale at a healthy 60 Hz cadence', () => {
    const g = new RenderScaleGovernor(4, opts);
    const { changes } = run(g, 1000, 16.7, DROP_AFTER_MS * 10);
    expect(changes).toEqual([]);
    expect(g.index).toBe(3);
  });

  it('ignores a single stall', () => {
    const g = new RenderScaleGovernor(4, opts);
    let t = 1000;
    for (let i = 0; i < 60; i++) g.sample((t += 16.7));
    expect(g.sample(t + 3000)).toBeNull();
    expect(g.index).toBe(3);
  });

  it('climbs back slowly and does not retry a scale that failed', () => {
    const g = new RenderScaleGovernor(4, opts, 2);
    const down = run(g, 1000, 40, 2000);
    expect(down.changes[0]).toBe(1);
    const up = run(g, down.end, 16.7, RISE_AFTER_MS + 1500);
    expect(up.changes).toEqual([1]);
    // Slow again right after the climb: drops, and 1 is not retried.
    const again = run(g, up.end, 40, 3000);
    expect(again.changes[0]).toBe(0);
    const later = run(g, again.end, 16.7, RISE_AFTER_MS * 3);
    expect(later.changes).toEqual([]);
    expect(g.index).toBe(0);
  });
});
