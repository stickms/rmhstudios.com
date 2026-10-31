import { describe, expect, it } from 'vitest';
import { createGovernor, MIN_SCALE, STEP, WARMUP_MS } from '../render-governor';
import { renderSize } from '../runtime';

/** Feeds `seconds` of frames at `ms` each; returns every scale the governor asked for. */
function feed(g: ReturnType<typeof createGovernor>, ms: number, seconds: number): number[] {
  const out: number[] = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const next = g.push(ms);
    if (next !== null) out.push(next);
  }
  return out;
}

describe('render governor', () => {
  it('leaves a machine that holds 60 fps alone', () => {
    expect(feed(createGovernor(), 16.7, 60)).toEqual([]);
  });

  it('waits out the warm-up before judging', () => {
    const g = createGovernor();
    expect(feed(g, 40, WARMUP_MS / 1000)).toEqual([]);
  });

  it('steps down after sustained slow frames, then waits again', () => {
    const g = createGovernor();
    const steps = feed(g, 40, 30);
    expect(steps[0]).toBe(STEP);
    expect(steps[1]).toBeCloseTo(STEP * STEP, 3);
    // Two slow windows (2 s) after each 4 s warm-up: not a step a second.
    expect(steps.length).toBeLessThanOrEqual(5);
  });

  it('never goes below the floor', () => {
    const steps = feed(createGovernor(), 50, 300);
    expect(Math.min(...steps)).toBeGreaterThanOrEqual(MIN_SCALE);
  });

  it('ignores a stall (a hidden tab) rather than reading it as slow', () => {
    const g = createGovernor();
    feed(g, 16.7, WARMUP_MS / 1000 + 1);
    expect(g.push(2000)).toBeNull();
    expect(feed(g, 16.7, 10)).toEqual([]);
  });

  it('a short dip is not enough', () => {
    const g = createGovernor();
    feed(g, 16.7, 6);
    expect(feed(g, 40, 1)).toEqual([]);
    expect(feed(g, 16.7, 10)).toEqual([]);
  });

  it('hold() restarts the warm-up', () => {
    const g = createGovernor();
    feed(g, 16.7, 6);
    g.hold();
    expect(feed(g, 40, WARMUP_MS / 1000)).toEqual([]);
  });
});

describe('renderSize with a governor scale', () => {
  it('lowers a hi-DPI ratio and never goes under 1', () => {
    expect(renderSize(1280, 720, 2, 0.8).ratio).toBe(1.6);
    expect(renderSize(1280, 720, 2, 0.4).ratio).toBe(1);
    expect(renderSize(1280, 720, 1, 0.6).ratio).toBe(1);
  });
});
