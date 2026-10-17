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
    // 1 ms frames over a POP_MS POP: a quintic never moves more than ~1% per ms.
    for (let i = 1; i < pop.length; i++)
      expect(Math.abs(pop[i]!.alpha - pop[i - 1]!.alpha)).toBeLessThan(0.02);
  });

  it('the fade starts only once the globe has landed on the orb', () => {
    const start = pop.find((f) => f.popFade > 1e-3)!;
    expect(start.radius).toBeLessThan(ORB.radius * 1.05);
  });

  it('is C² across unwrap → pop: starts at rest, and no step in value or velocity at the hand-over', () => {
    const i0 = frames.findIndex((f) => f.t >= popAt);
    expect(i0).toBeGreaterThan(10);
    // POP's own channels begin at rest, exactly.
    expect(frames[i0]!.pop).toBeLessThan(1e-6);
    expect(frames[i0]!.glass).toBeLessThan(1e-6);
    expect(frames[i0]!.popFade).toBe(0);
    // The first millisecond moves a rest-start quintic by ~10 (h/T)^3 of its range: nothing.
    expect(frames[i0 + 1]!.pop).toBeLessThan(1e-6);
    expect(frames[i0 + 1]!.glass).toBeLessThan(1e-5);
  });

  /*
   * Smoothness is a bound on the THIRD difference. A quintic's jerk peaks at 60 R / T^3 (at its two ends), so over
   * 1 ms steps a channel that is C² has |Δ³| <= 60 R / T^3; a C¹ break (an acceleration step A) puts A h² there,
   * orders of magnitude more, and a C⁰ break more still. The old "second difference < 400 range" bound sat ~1000x
   * above the real accelerations and could only catch a value jump.
   */
  const SHRINK_MS = POP_MS * 0.6;
  const GLASS_MS = POP_MS * 0.4;
  const FADE_MS = POP_MS * 0.4;
  const quinticJerk = (range: number, ms: number) => (60 * Math.abs(range)) / ms ** 3;
  const third = (f: number[], i: number) => f[i + 2]! - 3 * f[i + 1]! + 3 * f[i]! - f[i - 1]!;
  const worstThird = (series: number[]) => {
    let worst = 0;
    for (let i = 1; i < series.length - 2; i++) worst = Math.max(worst, Math.abs(third(series, i)));
    return worst;
  };
  /** The window from just before the hand-over to the end: includes the unwrap → pop seam. */
  const seamAndPop = frames.filter((f) => f.t >= popAt - 8);
  const bounds = (): Record<string, number> => {
    const start = frames.find((f) => f.t >= popAt)!;
    return {
      pop: quinticJerk(1, SHRINK_MS),
      glass: quinticJerk(1, GLASS_MS),
      popFade: quinticJerk(1, FADE_MS),
      centreX: quinticJerk(ORB.cx - start.centreX, SHRINK_MS),
      centreY: quinticJerk(ORB.cy - start.centreY, SHRINK_MS),
      // radius = (r + (orb - r) pop) (1 + 0.18 * 4 f (1 - f)): the shrink's jerk plus the swell's.
      radius:
        quinticJerk(start.radius - ORB.radius, SHRINK_MS) +
        quinticJerk(0.72 * ORB.radius, FADE_MS) * 0.5,
    };
  };

  it('every POP channel is C²: no third difference above 1.25x the quintic peak jerk', () => {
    const b = bounds();
    for (const key of ['pop', 'glass', 'popFade', 'centreX', 'centreY', 'radius'] as const) {
      const series = seamAndPop.map((f) => f[key]);
      expect(worstThird(series), key).toBeLessThanOrEqual(b[key]! * 1.25);
    }
  });

  it('the bound can fail: a C¹ break (cubic smoothstep) or a velocity kink (x²) is far above it', () => {
    const T = GLASS_MS;
    const ramp = (shape: (x: number) => number) =>
      Array.from({ length: Math.round(T) + 40 }, (_, i) =>
        shape(Math.min(Math.max((i - 20) / T, 0), 1)),
      );
    const quintic = (x: number) => x * x * x * (x * (x * 6 - 15) + 10);
    const smoothstep = (x: number) => x * x * (3 - 2 * x);
    const kink = (x: number) => x * x;
    const limit = quinticJerk(1, T) * 1.25;
    expect(worstThird(ramp(quintic))).toBeLessThanOrEqual(limit);
    expect(worstThird(ramp(smoothstep))).toBeGreaterThan(limit * 5);
    expect(worstThird(ramp(kink))).toBeGreaterThan(limit * 5);
  });

  it('no channel steps in value or velocity anywhere in POP (first differences are quintic-smooth)', () => {
    for (const [key, range, ms] of [
      ['pop', 1, SHRINK_MS],
      ['glass', 1, GLASS_MS],
      ['popFade', 1, FADE_MS],
    ] as const) {
      const series = seamAndPop.map((f) => f[key]);
      // A quintic's velocity peaks at 1.875 R / T; one ms may not move it further than that.
      for (let i = 1; i < series.length; i++) {
        expect(Math.abs(series[i]! - series[i - 1]!), `${key}@${i}`).toBeLessThanOrEqual(
          (1.875 * range * 1.05) / ms,
        );
      }
    }
  });
});
