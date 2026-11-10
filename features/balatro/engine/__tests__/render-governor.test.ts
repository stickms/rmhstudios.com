import { describe, expect, it } from 'vitest';
import { CRAWL_STEP, createGovernor, MIN_SCALE, STEP, WARMUP_MS } from '../render-governor';
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

  it('reads a crawl (a frame a second) as a measurement, and takes the big step', () => {
    const g = createGovernor();
    const steps = feed(g, 1000, 20);
    expect(steps).toEqual([CRAWL_STEP]); // straight to the floor, and no further
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
  it('lowers a hi-DPI ratio, and never goes under one buffer pixel per CSS pixel', () => {
    expect(renderSize(1280, 720, 2, 0.8)).toEqual({ w: 1280, h: 720, ratio: 1.5 });
    expect(renderSize(1280, 720, 2, 0.64)).toEqual({ w: 1280, h: 720, ratio: 1.25 });
    expect(renderSize(1280, 720, 2, 0.5)).toEqual({ w: 1280, h: 720, ratio: 1 });
    expect(renderSize(1280, 720, 2, 0.1)).toEqual({ w: 1280, h: 720, ratio: 1 });
    expect(renderSize(1280, 720, 1, 0.6)).toEqual({ w: 1280, h: 720, ratio: 1 });
  });
});
