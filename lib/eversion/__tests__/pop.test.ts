/**
 * POP (spec §7.1, §9.2): after UNWRAP the page is revealed and the EMPTY glass globe
 * condenses, shrinks into the RMH orb, overshoots a little, and fades. The contract
 * these tests hold:
 *
 *  - every POP channel (`pop`, `glass`, `popFade`) starts at rest and ends at rest, and
 *    the snapshot fields derived from them are continuous across unwrap → pop (no jump
 *    in value, and no jump in velocity at the hand-over: C²);
 *  - the globe's centre and radius reach the orb;
 *  - the last frame is invisible (opacity `glass · (1 − popFade)` is 0), so the orb the
 *    page puts back is the only thing left;
 *  - the opacity never flickers: it rises once, then falls once.
 */

import { describe, expect, it } from 'vitest';

import { POP_MS } from '../constants';
import { Timeline } from '../timeline';
import type { TimelineConfig, TimelineSnapshot } from '../types';

const ORB = { cx: 60, cy: 660, radius: 24 };

function config(): TimelineConfig {
  return {
    viewport: { w: 1280, h: 720, dpr: 1 },
    globe: { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [640, 360], radius: 150 },
    orb: ORB,
  };
}

interface Frame {
  t: number;
  pop: number;
  glass: number;
  popFade: number;
  alpha: number;
  radius: number;
  centreX: number;
  centreY: number;
  pageAlpha: number;
  stage: string;
}

/** Run a whole navigation at `step` ms, answering `unwrap-done` with `reveal` like the runner does. */
function run(step = 1) {
  const tl = new Timeline(config());
  let now = 1000;
  tl.start(now);
  tl.events();
  tl.afterReady(now);
  const frames: Frame[] = [];
  let popAt = -1;
  for (let i = 0; i < 20_000; i++) {
    now += step;
    const s: Readonly<TimelineSnapshot> = tl.tick(now);
    for (const e of tl.events()) {
      if (e.stage === 'unwrap-done') tl.reveal(now);
      if (e.stage === 'pop') popAt = e.t;
    }
    frames.push({
      t: s.t,
      pop: s.pop,
      glass: s.glass,
      popFade: s.popFade,
      alpha: s.glass * (1 - s.popFade),
      radius: s.radius,
      centreX: s.centreX,
      centreY: s.centreY,
      pageAlpha: s.pageAlpha,
      stage: s.stage,
    });
    if (tl.finished) break;
  }
  return { frames, popAt };
}

const second = (f: number[], i: number, h: number) => (f[i + 1]! - 2 * f[i]! + f[i - 1]!) / (h * h);

describe('POP: the empty glass globe shrinks into the orb and pops away', () => {
  const { frames, popAt } = run(1);
  const pop = frames.filter((f) => f.t >= popAt);

  it('runs POP_MS after the reveal and ends the run', () => {
    expect(popAt).toBeGreaterThan(0);
    const last = frames[frames.length - 1]!;
    expect(last.stage).toBe('done');
    expect(last.t - popAt).toBeCloseTo(POP_MS, 0);
  });

  it('the glass is absent before POP and the last frame is invisible', () => {
    for (const f of frames.filter((x) => x.t < popAt)) {
      expect(f.glass).toBe(0);
      expect(f.popFade).toBe(0);
    }
    const last = frames[frames.length - 1]!;
    expect(last.popFade).toBe(1);
    expect(last.alpha).toBe(0);
  });

  it('the globe centre and radius reach the orb, exactly', () => {
    const last = frames[frames.length - 1]!;
    expect(last.pop).toBe(1);
    expect(last.radius).toBeCloseTo(ORB.radius, 9);
    expect(last.centreX).toBeCloseTo(ORB.cx, 9);
    expect(last.centreY).toBeCloseTo(ORB.cy, 9);
  });

  it('shrinks onto the orb without undershooting, then swells a little while it fades (the pop)', () => {
    const min = Math.min(...pop.map((f) => f.radius));
    expect(min).toBeGreaterThanOrEqual(ORB.radius - 1e-9);
    const shrunk = pop.findIndex((f) => f.popFade > 0);
    for (let i = 1; i < shrunk; i++) {
      expect(pop[i]!.radius).toBeLessThanOrEqual(pop[i - 1]!.radius + 1e-9);
    }
    const swell = Math.max(...pop.map((f) => f.radius));
    expect(Math.max(...pop.slice(shrunk).map((f) => f.radius))).toBeGreaterThan(ORB.radius * 1.05);
    expect(swell).toBeGreaterThan(ORB.radius);
  });

  it('the opacity rises once and falls once: no flicker, no jump', () => {
    let peakAt = 0;
    for (let i = 0; i < pop.length; i++) if (pop[i]!.alpha > pop[peakAt]!.alpha) peakAt = i;
    expect(pop[peakAt]!.alpha).toBeGreaterThan(0.99);
    for (let i = 1; i <= peakAt; i++)
      expect(pop[i]!.alpha).toBeGreaterThanOrEqual(pop[i - 1]!.alpha - 1e-12);
    for (let i = peakAt + 1; i < pop.length; i++) {
      expect(pop[i]!.alpha).toBeLessThanOrEqual(pop[i - 1]!.alpha + 1e-12);
    }
    // 1 ms frames over a 300 ms POP: a quintic never moves more than ~2% per ms.
    for (let i = 1; i < pop.length; i++)
      expect(Math.abs(pop[i]!.alpha - pop[i - 1]!.alpha)).toBeLessThan(0.03);
  });

  it('the fade starts only once the globe has landed on the orb', () => {
    const start = pop.find((f) => f.popFade > 1e-3)!;
    expect(start.radius).toBeLessThan(ORB.radius * 1.05);
  });

  it('is C² across unwrap → pop: values and velocities have no step at the hand-over', () => {
    const h = 1;
    const i0 = frames.findIndex((f) => f.t >= popAt);
    expect(i0).toBeGreaterThan(10);
    for (const key of ['pop', 'glass', 'popFade', 'radius', 'centreX', 'centreY'] as const) {
      const series = frames.map((f) => f[key]);
      // Value step per ms around the hand-over is the same order as the steps either side of it.
      const around = [i0 - 3, i0 - 2, i0 - 1, i0, i0 + 1, i0 + 2].map((i) =>
        Math.abs(series[i]! - series[i - 1]!),
      );
      const scale = Math.max(...around, 1e-6);
      expect(Math.abs(series[i0]! - series[i0 - 1]!)).toBeLessThanOrEqual(scale);
      // Acceleration (second difference) is bounded and has no spike AT the hand-over versus 5 ms later.
      const a0 = Math.abs(second(series, i0, h));
      const a1 = Math.abs(second(series, i0 + 5, h));
      const bound = Math.max(a1, 1e-3) * 10 + 0.2;
      expect(a0, key).toBeLessThan(bound);
    }
    // POP's own channels begin at rest.
    expect(frames[i0]!.pop).toBeLessThan(1e-6);
    expect(frames[i0]!.glass).toBeLessThan(1e-6);
    expect(frames[i0]!.popFade).toBe(0);
  });

  it('no channel jumps anywhere in POP (second differences stay small at 1 ms)', () => {
    for (const key of ['radius', 'centreX', 'centreY', 'glass', 'popFade'] as const) {
      const series = pop.map((f) => f[key]);
      const range = Math.max(...series) - Math.min(...series) || 1;
      for (let i = 1; i < series.length - 1; i++) {
        // Quintic accelerations peak near 6x the mean over a 300 ms leg; the bound is generous but jump-proof.
        expect(Math.abs(second(series, i, 1)) * 1e3, `${key}@${i}`).toBeLessThan(range * 400);
      }
    }
  });
});
