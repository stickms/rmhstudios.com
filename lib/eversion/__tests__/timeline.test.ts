/**
 * Timeline engine (T10): quintic segments, the nominal plan, the gate, the
 * fast-forward and the property suite of spec §11.1 tests 17–22.
 *
 * The property suite is 10 000 seeded scenarios, each a random hub pose and
 * viewport, a random AFTER (on time, late, never, failed, or an abort), a random
 * fast-forward instant, random resizes and a random `dt` sequence with stalls.
 * It asserts with plain comparisons inside the loop and reports the first few
 * offenders at the end, which keeps the whole file well under 1.5 s.
 */

import { describe, expect, it } from 'vitest';
import v8 from 'node:v8';
import vm from 'node:vm';

import {
  FF_REMAINING_MS,
  FF_STRETCH_CAP_MS,
  GLOBE_RADIUS_FRACTION,
  MAX_DT_MS,
  PLACEHOLDER_XFADE_MS,
  PLAN_MS,
  POP_MS,
  SPIN_MAX_REMAINING_TURNS,
  STRETCH_CAP_MS,
} from '../constants';
import { TAU } from '../domain';
import {
  SEG_ASYMPTOTE,
  SEG_CRUISE,
  SEG_STRIDE,
  asymptoteRate,
  evalSegment,
  segmentEnd,
  setSegment,
} from '../quintic';
import { Timeline, eversionRadiusFit } from '../timeline';
import {
  CHANNEL_IDS,
  STAGE_IDS,
  type ChannelId,
  type GlobeStartState,
  type StageId,
  type TimelineConfig,
  type TimelineEvent,
  type Viewport,
} from '../types';

/* ── A local seeded RNG (shared helpers are not available to this task) ───── */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;
const NOMINAL_END = PLAN_MS.total + STRETCH_CAP_MS; // test 19's bound: 4.9 s + the cap

function config(
  over: Partial<Omit<TimelineConfig, 'globe'>> & { globe?: Partial<GlobeStartState> } = {},
): TimelineConfig {
  return {
    viewport: over.viewport ?? { w: 1280, h: 720, dpr: 1 },
    globe: {
      yaw: 0,
      pitch: 0,
      yawVel: 0,
      pitchVel: 0,
      centre: [640, 360],
      radius: 150,
      ...over.globe,
    },
    orb: over.orb ?? { cx: 60, cy: 660, radius: 24 },
    thetaAlign: over.thetaAlign,
  };
}

/** Drive a timeline in `step`-ms frames up to timeline-clock `until`; returns the events seen. */
function runTo(tl: Timeline, wall: { now: number }, until: number, step = 10): TimelineEvent[] {
  const seen: TimelineEvent[] = [];
  for (let i = 0; i < 100_000; i++) {
    const snap = tl.tick(wall.now);
    seen.push(...tl.events());
    if (snap.t >= until - 1e-9) break;
    wall.now += Math.min(step, Math.max(until - snap.t, 0.001));
  }
  return seen;
}

function started(cfg = config(), t0 = 1000) {
  const tl = new Timeline(cfg);
  const wall = { now: t0 };
  tl.start(t0);
  expect(tl.events()).toEqual([{ stage: 'wrap', t: 0 }]);
  return { tl, wall };
}

/* ── quintic.ts ───────────────────────────────────────────────────────────── */

describe('quintic segments', () => {
  const out = new Float64Array(3);
  const buf = new Float64Array(SEG_STRIDE * 2);

  it('hits both boundary states (x, ẋ, ẍ) exactly, for arbitrary data', () => {
    const rnd = mulberry32(7);
    for (let i = 0; i < 200; i++) {
      const T = 20 + rnd() * 4000;
      const x0 = (rnd() - 0.5) * 100;
      const v0 = (rnd() - 0.5) * 0.02;
      const a0 = (rnd() - 0.5) * 1e-4;
      const x1 = (rnd() - 0.5) * 100;
      const v1 = (rnd() - 0.5) * 0.02;
      const a1 = (rnd() - 0.5) * 1e-4;
      const t0 = rnd() * 1000;
      setSegment(buf, 0, t0, T, x0, v0, a0, x1, v1, a1, SEG_CRUISE);
      evalSegment(buf, 0, t0, out);
      expect(out[0]).toBeCloseTo(x0, 12);
      expect(out[1]).toBeCloseTo(v0, 12);
      expect(out[2]).toBeCloseTo(a0, 12);
      // Just inside the end (the end itself is the tail).
      evalSegment(buf, 0, t0 + T * (1 - 1e-12), out);
      expect(Math.abs(out[0]! - x1)).toBeLessThan(1e-6);
      expect(Math.abs(out[1]! - v1)).toBeLessThan(1e-8);
      expect(Math.abs(out[2]! - a1)).toBeLessThan(1e-10);
    }
  });

  it('rest-to-rest is the monotone smootherstep', () => {
    setSegment(buf, 0, 0, 1000, 0, 0, 0, 1, 0, 0);
    let prev = -1;
    for (let t = 0; t <= 1000; t += 5) {
      evalSegment(buf, 0, t, out);
      const s = t / 1000;
      expect(out[0]).toBeCloseTo(10 * s ** 3 - 15 * s ** 4 + 6 * s ** 5, 12);
      expect(out[0]!).toBeGreaterThanOrEqual(prev);
      prev = out[0]!;
    }
  });

  it('velocity and acceleration are the derivatives of position', () => {
    setSegment(buf, 0, 100, 800, 3, 0.004, -2e-6, -5, 0.001, 1e-6);
    const h = 1e-3;
    for (const t of [150, 400, 777, 890]) {
      const p = new Float64Array(3);
      const m = new Float64Array(3);
      evalSegment(buf, 0, t + h, p);
      evalSegment(buf, 0, t - h, m);
      evalSegment(buf, 0, t, out);
      expect((p[0]! - m[0]!) / (2 * h)).toBeCloseTo(out[1]!, 7);
      expect((p[1]! - m[1]!) / (2 * h)).toBeCloseTo(out[2]!, 7);
    }
  });

  it('holds its initial state before it begins and its target at rest after it ends', () => {
    setSegment(buf, 0, 500, 300, 2, 0, 0, 9, 0, 0);
    evalSegment(buf, 0, 100, out);
    expect([out[0], out[1], out[2]]).toEqual([2, 0, 0]);
    evalSegment(buf, 0, 5000, out);
    expect([out[0], out[1], out[2]]).toEqual([9, 0, 0]);
    expect(segmentEnd(buf, 0)).toBe(800);
  });

  it('a chain of re-plans sampled from the live state is C² at every joint', () => {
    const rnd = mulberry32(11);
    const s = new Float64Array(3);
    let t = 0;
    setSegment(buf, 0, 0, 1000, 0, 0.003, 0, 10, 0, 0);
    for (let i = 0; i < 300; i++) {
      t += rnd() * 300;
      evalSegment(buf, 0, t, s); // state just before the re-plan
      const x0 = s[0]!;
      const v0 = s[1]!;
      const a0 = s[2]!;
      setSegment(buf, 0, t, 50 + rnd() * 900, x0, v0, a0, (rnd() - 0.5) * 20, 0, 0);
      evalSegment(buf, 0, t, out); // state just after
      expect(Math.abs(out[0]! - x0)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(out[1]! - v0)).toBeLessThanOrEqual(1e-9);
      expect(Math.abs(out[2]! - a0)).toBeLessThanOrEqual(1e-9);
    }
  });

  it('an asymptote tail is C² with its quintic and approaches its target from below', () => {
    const target = 0.96;
    const xJ = 0.94;
    const vJ = 7.6e-5;
    const k = asymptoteRate(target, xJ, vJ);
    setSegment(buf, 0, 0, 400, 0.8, 3e-4, 0, xJ, vJ, -k * vJ, SEG_ASYMPTOTE, target, k);
    const pre = new Float64Array(3);
    evalSegment(buf, 0, 400 - 1e-9, pre);
    evalSegment(buf, 0, 400 + 1e-9, out);
    expect(Math.abs(out[0]! - pre[0]!)).toBeLessThan(1e-9);
    expect(Math.abs(out[1]! - pre[1]!)).toBeLessThan(1e-9);
    expect(Math.abs(out[2]! - pre[2]!)).toBeLessThan(1e-9);
    let prev = out[0]!;
    for (let t = 410; t < 5000; t += 50) {
      evalSegment(buf, 0, t, out);
      expect(out[0]!).toBeGreaterThanOrEqual(prev);
      expect(out[0]!).toBeLessThan(target);
      prev = out[0]!;
    }
    expect(target - prev).toBeLessThan(1e-3);
  });

  it('a cruise tail continues at its end velocity', () => {
    setSegment(buf, 0, 0, 500, 0, 0, 0, 2, 0.002, 0, SEG_CRUISE);
    evalSegment(buf, 0, 1500, out);
    expect(out[0]).toBeCloseTo(2 + 0.002 * 1000, 12);
    expect(out[1]).toBe(0.002);
    expect(out[2]).toBe(0);
  });
});

/* ── The nominal plan ─────────────────────────────────────────────────────── */

describe('the default plan (spec §7.1)', () => {
  it('emits the stages at their planned times and ends at the planned total', () => {
    const { tl, wall } = started();
    tl.tick(wall.now);
    wall.now += 10;
    tl.afterReady(wall.now); // ~10 ms in: the gate waits for evert at 600
    const ev = runTo(tl, wall, 4601);
    const byStage = Object.fromEntries(ev.map((e) => [e.stage, e.t]));
    expect(byStage['evert']).toBe(PLAN_MS.evert[0]);
    expect(byStage['gate-open']).toBe(PLAN_MS.evert[0]);
    expect(byStage['unwrap']).toBe(PLAN_MS.unwrap[0]);
    expect(byStage['unwrap-done']).toBe(PLAN_MS.unwrap[1]);
    tl.reveal(wall.now);
    const rest = runTo(tl, wall, 6000);
    expect(rest.map((e) => e.stage)).toEqual(['reveal', 'pop', 'done']);
    expect(tl.finished).toBe(true);
    const done = rest[2]!;
    expect(done.t - rest[1]!.t).toBe(POP_MS);
  });

  it('wrap, radius, centre and hub fade finish by their planned times', () => {
    const { tl, wall } = started(config({ viewport: { w: 1000, h: 800, dpr: 2 } }));
    runTo(tl, wall, 700, 5);
    const s = tl.tick(wall.now);
    expect(s.wrap).toBe(1);
    // EFFECTIVE radius: the channel (0.44·min) × the extent fit at the live `e` (1 − O(e³) just after 600 ms).
    expect(s.radius).toBeCloseTo(GLOBE_RADIUS_FRACTION * 800 * eversionRadiusFit(s.evert), 9);
    expect(GLOBE_RADIUS_FRACTION * 800 - s.radius).toBeLessThan(1e-4);
    expect(s.centreX).toBeCloseTo(500, 9);
    expect(s.centreY).toBeCloseTo(400, 9);
    expect(s.hubFade).toBe(0);
  });

  it('starts from the hub pose (position and velocity) and ends the spin on the alignment', () => {
    const align = 0.7;
    const cfg = config({
      globe: { yaw: 33, yawVel: 60, pitch: 20, pitchVel: -30 },
      thetaAlign: align,
    });
    const { tl, wall } = started(cfg);
    const s0 = tl.tick(wall.now);
    expect(s0.spin).toBeCloseTo(33 * DEG, 12);
    expect(s0.tilt).toBeCloseTo(20 * DEG, 12);
    const v = new Float64Array(3);
    tl.sample('spin', wall.now, v);
    expect(v[1]! * 1000).toBeCloseTo(60 * DEG, 9);
    tl.sample('tilt', wall.now, v);
    expect(v[1]! * 1000).toBeCloseTo(-30 * DEG, 9);
    expect(s0.radius).toBe(150);
    expect(s0.centreX).toBe(640);
    expect(s0.ripple0Age).toBe(0);
    expect(s0.ripple1Age).toBe(-1);

    tl.afterReady(wall.now);
    runTo(tl, wall, PLAN_MS.spin[1] + 1);
    tl.sample('spin', wall.now, v);
    expect(Math.abs(v[1]!)).toBe(0);
    expect(Math.abs(v[2]!)).toBe(0);
    const turn = (tl.tick(wall.now).spin - align) / TAU;
    expect(Math.abs(turn - Math.round(turn))).toBeLessThan(1e-9);
    // The tilt peaks at 18° by 900 ms and is level by 4300 ms.
    const { tl: t2, wall: w2 } = started();
    t2.afterReady(w2.now);
    runTo(t2, w2, PLAN_MS.tiltPeakAt, 5);
    expect(t2.tick(w2.now).tilt).toBeCloseTo(18 * DEG, 9);
    runTo(t2, w2, PLAN_MS.tiltEnd, 5);
    expect(t2.tick(w2.now).tilt).toBe(0);
  });

  it('turns about 1.25 turns (the nearest landing) when the hub is at rest', () => {
    for (const [yaw, align] of [
      [0, 0],
      [100, 1],
      [-200, -2],
      [10, 3],
    ] as const) {
      const tl = new Timeline(config({ globe: { yaw }, thetaAlign: align }));
      const travel = tl.spinTarget - yaw * DEG;
      expect(Math.abs(travel - 1.25 * TAU)).toBeLessThanOrEqual(Math.PI + 1e-9);
      expect(travel).toBeGreaterThan(0);
      expect(travel).toBeLessThanOrEqual(SPIN_MAX_REMAINING_TURNS * TAU);
    }
  });

  it('copes with a hub thrown too hard for one quintic by braking it, keeping the velocity (C¹)', () => {
    const tl = new Timeline(config({ globe: { yawVel: 900, yaw: 5 } }));
    expect(tl.spinTarget - 5 * DEG).toBeLessThanOrEqual(SPIN_MAX_REMAINING_TURNS * TAU);
    const v = new Float64Array(3);
    tl.sample('spin', 0, v);
    expect(v[1]!).toBeCloseTo(900 * DEG * 0.001, 12);
  });

  it('pops with an overshoot that settles, ends on the orb, and fires the second ripple', () => {
    const cfg = config();
    const { tl, wall } = started(cfg);
    tl.afterReady(wall.now);
    runTo(tl, wall, PLAN_MS.unwrap[1] + 1, 10);
    tl.reveal(wall.now);
    let peak = 0;
    let sawRipple = false;
    let bg = 1;
    for (let i = 0; i < 60; i++) {
      wall.now += 10;
      const s = tl.tick(wall.now);
      peak = Math.max(peak, s.pop);
      sawRipple ||= s.ripple1Age > 0;
      bg = s.bgAlpha;
    }
    expect(peak).toBeGreaterThan(1.02);
    expect(peak).toBeLessThan(1.2);
    expect(sawRipple).toBe(true);
    expect(bg).toBe(0);
    const s = tl.tick(wall.now);
    expect(tl.finished).toBe(true);
    expect(s.pop).toBe(1);
    expect(s.radius).toBeCloseTo(24, 9);
    expect(s.centreX).toBeCloseTo(60, 9);
    expect(s.centreY).toBeCloseTo(660, 9);
    expect(s.pageAlpha).toBe(0);
  });

  it('applies a reveal that arrives before unwrap-done at unwrap-done, in order', () => {
    const { tl, wall } = started();
    tl.afterReady(wall.now);
    tl.reveal(wall.now); // far too early
    const ev = runTo(tl, wall, 6000);
    expect(ev.map((e) => e.stage)).toEqual([
      'evert',
      'gate-open',
      'unwrap',
      'unwrap-done',
      'reveal',
      'pop',
      'done',
    ]);
    const done = ev.find((e) => e.stage === 'unwrap-done')!;
    expect(ev.find((e) => e.stage === 'reveal')!.t).toBe(done.t);
    // A second reveal is ignored.
    tl.reveal(wall.now);
    expect(tl.events()).toEqual([]);
  });
});

/* ── The gate ─────────────────────────────────────────────────────────────── */

describe('the after-gate and stretch (spec §7.5)', () => {
  it('waits for AFTER: evert eases toward 0.96, the spin keeps turning, unwrap starts at the cap', () => {
    const { tl, wall } = started();
    // The eversion never backs up on the way into the wait, nor inside it.
    let prevE = 0;
    const ev: TimelineEvent[] = [];
    for (let t = 0; t < 5000; t += 10) {
      ev.push(...runTo(tl, wall, t + 10, 10));
      const e = tl.tick(wall.now).evert;
      expect(e).toBeGreaterThanOrEqual(prevE - 1e-9);
      prevE = e;
    }
    const stages = ev.map((e) => e.stage);
    expect(stages).toEqual(['evert']);
    const s1 = { ...tl.tick(wall.now) };
    expect(s1.evert).toBeGreaterThan(0.9);
    expect(s1.evert).toBeLessThan(0.97);
    expect(s1.unwrap).toBe(1);
    runTo(tl, wall, 5400);
    const s2 = tl.tick(wall.now);
    expect(s2.spin).toBeGreaterThan(s1.spin); // never stops
    expect(s2.evert).toBeGreaterThanOrEqual(s1.evert);
    const rest = runTo(tl, wall, 6400);
    const unwrap = rest.find((e) => e.stage === 'unwrap')!;
    expect(unwrap.t).toBe(PLAN_MS.unwrap[0] + STRETCH_CAP_MS);
    expect(rest.find((e) => e.stage === 'gate-open')!.t).toBe(unwrap.t);
  });

  it('opens once AFTER has crossfaded, and the post-gate plan keeps the nominal offsets', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 4000);
    tl.afterReady(wall.now);
    const ev = runTo(tl, wall, 4000 + PLACEHOLDER_XFADE_MS + 800);
    const gate = ev.find((e) => e.stage === 'gate-open')!;
    expect(gate.t).toBeCloseTo(4000 + PLACEHOLDER_XFADE_MS, 9);
    expect(ev.find((e) => e.stage === 'unwrap')!.t).toBeCloseTo(gate.t, 9);
    expect(ev.find((e) => e.stage === 'unwrap-done')!.t).toBeCloseTo(
      gate.t + PLAN_MS.unwrap[1] - PLAN_MS.unwrap[0],
      9,
    );
    const s = tl.tick(wall.now);
    expect(s.afterMix).toBe(1);
    expect(s.evert).toBe(1);
  });

  it('afterFailed opens the gate at once (unwrapping the placeholder)', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 4000);
    tl.afterFailed(wall.now);
    const ev = tl.events();
    expect(ev.map((e) => e.stage)).toEqual(['gate-open', 'unwrap']);
    expect(ev[0]!.t).toBeCloseTo(4000, 9);
    // afterReady after a failure changes nothing.
    tl.afterReady(wall.now);
    expect(tl.tick(wall.now).afterMix).toBe(0);
  });

  it('gate-open is never before evert, even when AFTER arrives at once', () => {
    const { tl, wall } = started();
    tl.afterFailed(wall.now);
    const ev = runTo(tl, wall, 1000);
    expect(ev.map((e) => e.stage).slice(0, 2)).toEqual(['evert', 'gate-open']);
    expect(ev[1]!.t).toBe(PLAN_MS.evert[0]);
  });

  it('reports the deadline on the caller clock and Infinity once the gate has opened', () => {
    const { tl, wall } = started(config(), 5000);
    runTo(tl, wall, 1000);
    const clock = tl.tick(wall.now).t;
    expect(tl.afterDeadline(wall.now)).toBeCloseTo(
      wall.now + (PLAN_MS.unwrap[0] + STRETCH_CAP_MS - clock),
      9,
    );
    tl.afterFailed(wall.now);
    runTo(tl, wall, 1500);
    expect(tl.afterDeadline(wall.now)).toBe(Infinity);
  });
});

/* ── Fast-forward, abort, resize, clock ───────────────────────────────────── */

describe('fast-forward (spec §7.6)', () => {
  it('completes the remainder in 650 ms (plus POP) when AFTER is ready', () => {
    const { tl, wall } = started();
    tl.afterReady(wall.now);
    const ev = runTo(tl, wall, 1000);
    tl.fastForward(wall.now);
    const tf = tl.tick(wall.now).t;
    ev.push(...runTo(tl, wall, tf + FF_REMAINING_MS + 1));
    const done = ev.find((e) => e.stage === 'unwrap-done')!;
    expect(done.t).toBeCloseTo(tf + FF_REMAINING_MS, 6);
    tl.reveal(wall.now);
    ev.push(...runTo(tl, wall, tf + FF_REMAINING_MS + POP_MS + 50));
    expect(tl.finished).toBe(true);
  });

  it('a second fast-forward is a no-op, and so is one during POP', () => {
    const { tl, wall } = started();
    tl.afterReady(wall.now);
    runTo(tl, wall, 800);
    tl.fastForward(wall.now);
    const a = new Float64Array(3);
    const b = new Float64Array(3);
    runTo(tl, wall, 900);
    tl.sample('spin', wall.now, a);
    tl.fastForward(wall.now);
    tl.sample('spin', wall.now, b);
    expect([...b]).toEqual([...a]);
    runTo(tl, wall, 1500);
    tl.reveal(wall.now);
    const before = tl.tick(wall.now).pop;
    tl.fastForward(wall.now);
    wall.now += 20;
    const after = tl.tick(wall.now).pop;
    expect(after).toBeGreaterThanOrEqual(before);
    runTo(tl, wall, 1500 + POP_MS + 100);
    expect(tl.finished).toBe(true);
  });

  it('keeps the gate: with no AFTER the unwrap waits at most FF_STRETCH_CAP_MS', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 500);
    tl.fastForward(wall.now);
    const tf = tl.tick(wall.now).t;
    const ev = runTo(tl, wall, tf + 3000);
    const unwrap = ev.find((e) => e.stage === 'unwrap')!;
    expect(unwrap.t).toBeLessThanOrEqual(tf + FF_STRETCH_CAP_MS + 650 + 1e-6);
    expect(unwrap.t).toBeGreaterThanOrEqual(tf + 1000 - 1e-6);
  });

  it('abort skips the gate and fast-forwards', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 2000);
    tl.abort(wall.now);
    const tf = tl.tick(wall.now).t;
    const ev = runTo(tl, wall, tf + 700);
    expect(ev.find((e) => e.stage === 'unwrap-done')!.t).toBeLessThanOrEqual(
      tf + FF_REMAINING_MS + 1e-6,
    );
  });
});

describe('resize (spec §9.4)', () => {
  it('re-plans radius and centre toward the new viewport, mid-flight and settled', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 300);
    tl.resize(wall.now, { w: 600, h: 900, dpr: 1 });
    runTo(tl, wall, 1000);
    let s = tl.tick(wall.now);
    expect(s.radius).toBeCloseTo(GLOBE_RADIUS_FRACTION * 600 * eversionRadiusFit(s.evert), 9);
    expect(s.centreX).toBeCloseTo(300, 9);
    expect(s.centreY).toBeCloseTo(450, 9);
    tl.resize(wall.now, { w: 1000, h: 400, dpr: 1 });
    runTo(tl, wall, 1500);
    s = tl.tick(wall.now);
    expect(s.radius).toBeCloseTo(GLOBE_RADIUS_FRACTION * 400 * eversionRadiusFit(s.evert), 9);
    expect(s.centreX).toBeCloseTo(500, 9);
  });
});

describe('clock (spec §7.7)', () => {
  it('a dt of 10 s advances the timeline by at most 50 ms', () => {
    const { tl, wall } = started();
    const t0 = tl.tick(wall.now).t;
    wall.now += 10_000;
    expect(tl.tick(wall.now).t - t0).toBe(MAX_DT_MS);
    wall.now += 10_000;
    tl.afterReady(wall.now);
    expect(tl.tick(wall.now).t - t0).toBe(2 * MAX_DT_MS);
  });

  it('ignores a clock that goes backwards', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 200);
    const t = tl.tick(wall.now).t;
    expect(tl.tick(wall.now - 500).t).toBe(t);
    expect(tl.tick(wall.now + 5).t).toBe(t + 5);
  });

  it('returns one reused snapshot object', () => {
    const { tl, wall } = started();
    expect(tl.tick(wall.now)).toBe(tl.tick(wall.now + 5));
  });
});

describe('tick cost', () => {
  it('allocates nothing in steady state and costs microseconds', () => {
    // Warm every branch `write` has (the radius fit's shrink and grow windows included — a path
    // first taken inside the measurement would run unoptimised and box doubles): drive a few
    // whole timelines first.
    for (let k = 0; k < 12; k++) {
      const w = started();
      w.tl.afterReady(w.wall.now);
      runTo(w.tl, w.wall, PLAN_MS.total + 200, 3);
    }
    const { tl, wall } = started();
    tl.afterReady(wall.now);
    // Then measure in the long middle of the eversion, where no
    // stage transition (which pushes its one event record) can fall inside.
    runTo(tl, wall, 1000);
    for (let i = 0; i < 50_000; i++) tl.tick(wall.now + i * 0.01);
    wall.now += 500;
    const gc = (() => {
      v8.setFlagsFromString('--expose-gc');
      return vm.runInNewContext('gc') as () => void;
    })();
    const space = () =>
      v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;
    // The harness itself (a boxed double per iteration, the stats call) shows up
    // in new-space too, so measure an empty loop the same way and subtract it.
    const N = 5000;
    let t = wall.now;
    let sink = 0;
    gc();
    const base0 = space();
    for (let i = 0; i < N; i++) {
      t += 0.2;
      sink += Math.sqrt(t);
    }
    const baseline = space() - base0;
    gc();
    const before = space();
    const start = performance.now();
    for (let i = 0; i < N; i++) {
      t += 0.2; // 1 s of timeline across the loop, inside the long eversion
      tl.tick(t);
    }
    const per = ((performance.now() - start) * 1000) / N;
    const grown = space() - before - baseline;
    expect(sink).toBeGreaterThan(0);
    expect(grown).toBeLessThan(32 * 1024); // 5000 ticks × even 8 B would be 40 KB
    expect(per).toBeLessThan(25); // spec target 5 µs; the bound is loose for shared CI cores
  });
});

/* ── The property suite: spec §11.1 tests 17–22 ───────────────────────────── */

interface Outcome {
  failures: string[];
  scenarios: number;
  /** Which interesting paths the generator actually reached. */
  cov: Record<
    'capForced' | 'waitedThenOpened' | 'failedGate' | 'ffNominal' | 'ffWaiting' | 'abort',
    number
  >;
}

const SCENARIOS = 10_000;
const EPS_C2 = 1e-9;
const SPIN_TOL = 1e-6;
const STAGE_INDEX: Record<StageId, number> = Object.fromEntries(
  STAGE_IDS.map((s, i) => [s, i]),
) as never;

function scenario(seed: number, out: Outcome): void {
  const rnd = mulberry32(seed * 2654435761 + 12345);
  const fail = (what: string) => {
    if (out.failures.length < 8) out.failures.push(`seed ${seed}: ${what}`);
  };

  const vp: Viewport = { w: 320 + rnd() * 2200, h: 320 + rnd() * 1200, dpr: 1 + rnd() };
  const extreme = rnd() < 0.1;
  const cfg: TimelineConfig = {
    viewport: vp,
    globe: {
      yaw: (rnd() - 0.5) * 1440,
      pitch: (rnd() - 0.5) * 124,
      yawVel: rnd() < 0.25 ? 0 : (rnd() - 0.4) * (extreme ? 1800 : 400),
      pitchVel: rnd() < 0.25 ? 0 : (rnd() - 0.5) * 600,
      centre: [vp.w * rnd(), vp.h * rnd()],
      radius: 60 + rnd() * 250,
    },
    orb: { cx: vp.w * rnd(), cy: vp.h * rnd(), radius: 14 + rnd() * 20 },
    thetaAlign: rnd() < 0.4 ? 0 : (rnd() - 0.5) * TAU,
  };
  const tl = new Timeline(cfg);

  // What this scenario will do, at TIMELINE-clock ms (wall time inflates with stalls).
  type Kind = 'ready' | 'failed' | 'abort' | 'ff' | 'resize';
  const plan: { at: number; kind: Kind }[] = [];
  const afterMode = rnd();
  if (afterMode < 0.55) plan.push({ at: rnd() < 0.5 ? rnd() * 3200 : rnd() * 7500, kind: 'ready' });
  else if (afterMode < 0.65) plan.push({ at: rnd() * 7000, kind: 'failed' });
  // else: AFTER never arrives
  if (rnd() < 0.08) plan.push({ at: rnd() * 7500, kind: 'abort' });
  else if (rnd() < 0.6) plan.push({ at: rnd() < 0.3 ? rnd() * 700 : rnd() * 7500, kind: 'ff' });
  if (rnd() < 0.15) plan.push({ at: rnd() * 7500, kind: 'ff' }); // a second one: must be a no-op
  for (let i = Math.floor(rnd() * 4); i > 0; i--) plan.push({ at: rnd() * 7500, kind: 'resize' });
  plan.sort((a, b) => a.at - b.at);

  // Probe every re-plan: boundary continuity, analytically (test 17).
  let maxX = 0;
  let maxV = 0;
  let maxA = 0;
  let readyEnd = -Infinity;
  tl.replanProbe = (id, t, dur, b, a) => {
    maxX = Math.max(maxX, Math.abs(a[0]! - b[0]!));
    maxV = Math.max(maxV, Math.abs(a[1]! - b[1]!));
    maxA = Math.max(maxA, Math.abs(a[2]! - b[2]!));
    if (!(dur > 0) || !Number.isFinite(dur) || !Number.isFinite(t))
      fail(`bad re-plan ${id} t=${t} T=${dur}`);
    if (id === 'afterMix') readyEnd = t + dur;
  };

  const t0 = 5000 + rnd() * 1e6;
  tl.start(t0);
  const seen: TimelineEvent[] = [];
  const sa = new Float64Array(3 * CHANNEL_IDS.length);
  const sb = new Float64Array(3 * CHANNEL_IDS.length);
  const align = cfg.thetaAlign ?? 0;

  let wall = 0;
  let lastClock = 0;
  let ffClock = -1;
  let failClock = Infinity;
  let afterSeen = false;
  let pi = 0;
  let revealedAt = false;
  let spinDir = 0;
  let stepsLeft = 20_000;

  const drain = (now: number) => {
    const ev = tl.events();
    for (let i = 0; i < ev.length; i++) {
      seen.push(ev[i]!);
      if (ev[i]!.stage === 'unwrap-done' && !revealedAt) {
        revealedAt = true;
        tl.reveal(now);
        const more = tl.events();
        for (let j = 0; j < more.length; j++) seen.push(more[j]!);
      }
    }
  };

  while (!tl.finished && stepsLeft-- > 0) {
    const r = rnd();
    const dt =
      r < 0.55
        ? 30 + rnd() * 25
        : r < 0.75
          ? 8 + rnd() * 12
          : r < 0.9
            ? 0.5 + rnd() * 3
            : 50 + rnd() * 6000;
    wall += dt;
    const now = t0 + wall;

    while (pi < plan.length && plan[pi]!.at <= lastClock) {
      const { kind } = plan[pi++]!;
      const snap = tl.tick(now);
      drain(now);
      const clock = snap.t;
      // The public API must not set a channel directly (test 17, end to end).
      for (let c = 0; c < CHANNEL_IDS.length; c++) tl.sample(CHANNEL_IDS[c]!, now, sa, c * 3);
      if (kind === 'ready') {
        afterSeen = true;
        tl.afterReady(now);
      } else if (kind === 'failed') {
        if (!afterSeen) failClock = Math.min(failClock, clock);
        afterSeen = true;
        tl.afterFailed(now);
      } else if (kind === 'abort') {
        if (!afterSeen) failClock = Math.min(failClock, clock);
        afterSeen = true;
        if (ffClock < 0) ffClock = clock;
        tl.abort(now);
      } else if (kind === 'ff') {
        if (ffClock < 0 && !seen.some((e) => e.stage === 'pop')) ffClock = clock;
        tl.fastForward(now);
      } else {
        tl.resize(now, { w: 320 + rnd() * 2200, h: 320 + rnd() * 1200, dpr: 1 });
      }
      for (let c = 0; c < CHANNEL_IDS.length; c++) tl.sample(CHANNEL_IDS[c]!, now, sb, c * 3);
      for (let i = 0; i < sa.length; i++) {
        if (!(Math.abs(sa[i]! - sb[i]!) <= EPS_C2)) {
          fail(`API ${kind} moved ${CHANNEL_IDS[(i / 3) | 0]}[${i % 3}] by ${sa[i]! - sb[i]!}`);
          break;
        }
      }
      drain(now);
    }

    const snap = tl.tick(now);
    drain(now);
    if (snap.t - lastClock > MAX_DT_MS + 1e-9) fail(`clock jumped ${snap.t - lastClock}`);
    lastClock = snap.t;
    const goal = tl.spinTarget;
    if (goal === goal) {
      // Direction of the landing: set by the first goal (a hub thrown backwards lands backwards).
      if (spinDir === 0 && Math.abs(goal - snap.spin) > 1e-9) spinDir = Math.sign(goal - snap.spin);
      const rem = (goal - snap.spin) * (spinDir || 1);
      if (rem < -SPIN_TOL || rem > SPIN_MAX_REMAINING_TURNS * TAU + SPIN_TOL) {
        fail(`spin remaining ${rem} at t=${snap.t}`);
      }
    }
    if (!(
      snap.evert >= 0 &&
      snap.evert <= 1 &&
      snap.wrap >= 0 &&
      snap.unwrap >= 0 &&
      Number.isFinite(snap.spin)
    )) {
      fail('snapshot out of range');
    }
  }

  if (!tl.finished) {
    fail('did not finish');
    return;
  }

  // 17: continuity of every re-plan.
  if (maxX > EPS_C2 || maxV > EPS_C2 || maxA > EPS_C2) fail(`C² break ${maxX} ${maxV} ${maxA}`);

  // 20: monotone stages, each exactly once.
  const idx = seen.map((e) => STAGE_INDEX[e.stage]);
  for (let i = 0; i < idx.length; i++)
    if (idx[i] !== i) fail(`stage order ${seen.map((e) => e.stage).join()}`);
  if (seen.length !== STAGE_IDS.length) fail(`stage count ${seen.length}`);
  for (let i = 1; i < seen.length; i++)
    if (seen[i]!.t < seen[i - 1]!.t - 1e-9) fail('event times go backwards');
  const at = (s: StageId) => seen.find((e) => e.stage === s)!.t;

  // 18: the gate.
  const tu = at('unwrap');
  if (at('gate-open') > tu + 1e-9) fail('unwrap before gate-open');
  if (at('gate-open') < at('evert') - 1e-9) fail('gate-open before evert');
  const capGuard = Math.min(
    PLAN_MS.unwrap[0] + STRETCH_CAP_MS,
    ffClock >= 0 ? ffClock + FF_STRETCH_CAP_MS : Infinity,
  );
  if (!(tu >= readyEnd - 1e-6 || failClock <= tu + 1e-6 || tu >= capGuard - 1e-6)) {
    fail(`unwrap at ${tu} before AFTER ready ${readyEnd} / failed ${failClock} / cap ${capGuard}`);
  }

  if (tu >= capGuard - 1e-6 && tu > readyEnd + 1e-6) out.cov.capForced++;
  else if (tu > PLAN_MS.unwrap[0] + 1e-6 && failClock === Infinity) out.cov.waitedThenOpened++;
  if (failClock !== Infinity) out.cov.failedGate++;
  if (ffClock >= 0 && ffClock < 3000) out.cov.ffNominal++;
  if (ffClock >= 3000) out.cov.ffWaiting++;
  if (plan.some((p) => p.kind === 'abort')) out.cov.abort++;

  // 19: bounds. Allow one frame of reveal latency (the harness answers unwrap-done
  // on the frame it sees it).
  const doneT = at('done');
  const bound = Math.min(
    NOMINAL_END,
    ffClock >= 0 ? ffClock + FF_REMAINING_MS + FF_STRETCH_CAP_MS + POP_MS : Infinity,
  );
  if (doneT > bound + MAX_DT_MS + 1e-6) fail(`done at ${doneT} > ${bound}`);

  // 21: the spin ends aligned with zero velocity and acceleration. After a long gate wait the
  // landing is speed-capped and may outlast `done` (it is orb-sized glass by then): let it finish.
  for (let k = 0; k < 100; k++) {
    tl.sample('spin', t0 + wall, sa, 0);
    if (sa[1] === 0 && sa[2] === 0) break;
    wall += MAX_DT_MS;
    tl.tick(t0 + wall);
  }
  const now = t0 + wall;
  tl.sample('spin', now, sa, 0);
  const turns = (sa[0]! - align) / TAU;
  if (Math.abs(turns - Math.round(turns)) > 1e-9) fail(`spin misaligned ${turns}`);
  if (Math.abs(sa[1]!) > 1e-15 || Math.abs(sa[2]!) > 1e-15)
    fail(`spin not at rest ${sa[1]} ${sa[2]}`);
  const lastSnap = tl.tick(now);
  if (lastSnap.stage !== 'done') fail(`final stage ${lastSnap.stage}`);
}

describe('property suite: tests 17–22 over 10 000 seeded scenarios', () => {
  const out: Outcome = {
    failures: [],
    scenarios: 0,
    cov: { capForced: 0, waitedThenOpened: 0, failedGate: 0, ffNominal: 0, ffWaiting: 0, abort: 0 },
  };
  it('holds C² continuity, the gate, the bounds, monotone stages, the spin and the clock', () => {
    for (let seed = 1; seed <= SCENARIOS; seed++) {
      scenario(seed, out);
      out.scenarios++;
    }
    expect(out.failures).toEqual([]);
    expect(out.scenarios).toBe(SCENARIOS);
    // The generator must actually reach the paths the properties are about.
    for (const [path, n] of Object.entries(out.cov)) {
      expect(n, path).toBeGreaterThan(100);
    }
  });
});

/** Channel names are part of the surface the debug overlay reads. */
describe('sample', () => {
  it('reads every channel without advancing the clock', () => {
    const { tl, wall } = started();
    runTo(tl, wall, 400);
    const t = tl.tick(wall.now).t;
    const o = new Float64Array(5);
    for (const id of CHANNEL_IDS as readonly ChannelId[]) tl.sample(id, wall.now, o, 2);
    expect(tl.tick(wall.now).t).toBe(t);
    tl.sample('wrap', wall.now, o, 1);
    expect(o[1]).toBeGreaterThan(0);
    expect(o[1]).toBeLessThan(1);
  });
});
