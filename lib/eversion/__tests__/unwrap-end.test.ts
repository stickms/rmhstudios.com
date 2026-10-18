/**
 * The end of the run (owner's requests, 2026-10-18): the animation ends when UNWRAP
 * finishes. There is no POP stage after it, and no separate fade after it either: the
 * final dissolve is a CROSSFADE of the canvas's flat AFTER picture onto the identical
 * live page that OVERLAPS UNWRAP's last `REVEAL_MS` and ends with it. The contract
 * these tests hold:
 *
 *  - the event order is `uncover`, `reveal`, `done`, each once, and nothing
 *    follows `done` - on the nominal path, after a long gate wait, after a
 *    fast-forward, and when the reveal answer is early or late;
 *  - nominally `uncover` is `REVEAL_MS + UNCOVER_LEAD_MS` before UNWRAP's end, `reveal`
 *    a lead later, and the dissolve and UNWRAP end together at `done` (PLAN_MS.total);
 *  - every channel is at REST (value, velocity, acceleration) when UNWRAP ends, and
 *    the channels that finish there are C² into it - so the last frame is not a jump;
 *  - the dissolve (`pageAlpha`, with `bgAlpha` riding on it) is one quintic, C² and
 *    monotone, and `unwrap` stays C² through it;
 *  - after `done` the timeline stays finished and emits nothing.
 */

import { describe, expect, it } from 'vitest';

import { CHANNEL_IDS } from '../types';
import {
  FF_REMAINING_MS,
  PLAN_MS,
  REVEAL_MS,
  UNCOVER_LEAD_MS,
  UNWRAP_MS,
  UNWRAP_OVERLAP_MS,
} from '../constants';
import { Timeline } from '../timeline';
import type { ChannelId, StageId, TimelineConfig, TimelineSnapshot } from '../types';

function config(): TimelineConfig {
  return {
    viewport: { w: 1280, h: 720, dpr: 1 },
    globe: { yaw: 0, pitch: 0, yawVel: 0, pitchVel: 0, centre: [640, 360], radius: 150 },
  };
}

interface Frame {
  t: number;
  stage: StageId;
  unwrap: number;
  evert: number;
  wrap: number;
  radius: number;
  centreX: number;
  centreY: number;
  pageAlpha: number;
  bgAlpha: number;
}

interface Rest {
  /** Per channel: [value, velocity, acceleration] sampled at the first frame at or after UNWRAP's end. */
  at: Record<ChannelId, [number, number, number]>;
}

interface RunOptions {
  step?: number;
  /** Timeline ms at which AFTER becomes ready (null: never). Default: at the start. */
  afterAt?: number | null;
  /** Timeline ms at which `fastForward` is called. */
  ffAt?: number;
  /** How long after `uncover` the main thread answers `reveal` (cover off, two frames, a post). Default: the lead. */
  replyMs?: number;
}

/** Run a whole navigation, answering `uncover` with `reveal` after a round trip like the runner does. */
function run(options: RunOptions = {}) {
  const step = options.step ?? 1;
  const afterAt = options.afterAt === undefined ? 0 : options.afterAt;
  const tl = new Timeline(config());
  let now = 1000;
  tl.start(now);
  const events: { stage: StageId; t: number }[] = [...tl.events()];
  if (afterAt === 0) tl.afterReady(now);
  const frames: Frame[] = [];
  const rest: Rest = { at: {} as Rest['at'] };
  let uncoverClock = -1;
  let revealed = false;
  let endAt = -1;
  let sampled = false;
  let ff = false;
  let after = afterAt === 0 || afterAt === null;
  const out = new Float64Array(3);
  for (let i = 0; i < 200_000; i++) {
    now += step;
    const clock = now - 1000;
    if (!after && afterAt !== null && clock >= afterAt) {
      tl.afterReady(now);
      after = true;
    }
    if (!ff && options.ffAt !== undefined && clock >= options.ffAt) {
      tl.fastForward(now);
      ff = true;
    }
    const s: Readonly<TimelineSnapshot> = tl.tick(now);
    for (const e of tl.events()) {
      events.push(e);
      if (e.stage === 'uncover') uncoverClock = e.t;
      if (e.stage === 'done') endAt = e.t;
    }
    if (
      uncoverClock >= 0 &&
      !revealed &&
      s.t >= uncoverClock + (options.replyMs ?? UNCOVER_LEAD_MS)
    ) {
      revealed = true;
      tl.reveal(now);
    }
    if (endAt >= 0 && !sampled) {
      sampled = true;
      for (const id of CHANNEL_IDS) {
        tl.sample(id, now, out);
        rest.at[id] = [out[0]!, out[1]!, out[2]!];
      }
    }
    frames.push({
      t: s.t,
      stage: s.stage,
      unwrap: s.unwrap,
      evert: s.evert,
      wrap: s.wrap,
      radius: s.radius,
      centreX: s.centreX,
      centreY: s.centreY,
      pageAlpha: s.pageAlpha,
      bgAlpha: s.bgAlpha,
    });
    if (tl.finished) break;
  }
  return { tl, frames, events, rest, uncoverAt: uncoverClock, endAt, endNow: now };
}

const ORDER: StageId[] = ['wrap', 'evert', 'gate-open', 'unwrap', 'uncover', 'reveal', 'done'];

describe('the run ends with UNWRAP (no POP)', () => {
  const nominal = run();

  it('emits wrap, evert, gate-open, unwrap, uncover, reveal, done: each once, nothing named pop', () => {
    expect(nominal.events.map((e) => e.stage)).toEqual(ORDER);
    expect(nominal.events.some((e) => (e.stage as string) === 'pop')).toBe(false);
  });

  it('asks for the page a lead before the dissolve, dissolves for REVEAL_MS, and ends with UNWRAP', () => {
    const t = Object.fromEntries(nominal.events.map((e) => [e.stage, e.t]));
    expect(t['uncover']).toBe(PLAN_MS.uncover);
    expect(t['uncover']).toBe(PLAN_MS.unwrap[1] - REVEAL_MS - UNCOVER_LEAD_MS);
    // The reveal is the answer to `uncover`, one round trip later.
    expect(t['reveal']! - t['uncover']!).toBeGreaterThanOrEqual(UNCOVER_LEAD_MS);
    expect(t['reveal']! - t['uncover']!).toBeLessThanOrEqual(UNCOVER_LEAD_MS + 2);
    // The dissolve ends WITH UNWRAP, not after it.
    expect(t['done']).toBe(PLAN_MS.unwrap[1]);
    expect(t['done']).toBe(PLAN_MS.total);
    expect(PLAN_MS.total).toBe(PLAN_MS.unwrap[1]);
    expect(PLAN_MS.reveal).toEqual([PLAN_MS.unwrap[1] - REVEAL_MS, PLAN_MS.unwrap[1]]);
    // ...so the dissolve STARTS while UNWRAP is still finishing: the run is one movement, not two.
    expect(t['reveal']!).toBeLessThan(PLAN_MS.unwrap[1]);
    expect(t['reveal']!).toBeGreaterThanOrEqual(PLAN_MS.reveal[0] - 1);
  });

  it('every channel is at rest at the end of UNWRAP (= done): zero velocity and zero acceleration', () => {
    for (const id of CHANNEL_IDS) {
      const [, v, a] = nominal.rest.at[id];
      // Per-ms units: a quintic with a 1 µs error in its rest would still be well under these.
      expect(Math.abs(v), `${id} velocity`).toBeLessThan(1e-9);
      expect(Math.abs(a), `${id} acceleration`).toBeLessThan(1e-9);
    }
  });

  it('the last frame is the flat AFTER page, fully dissolved, and the geometry is untouched', () => {
    const first = nominal.frames[0]!;
    const atEnd = nominal.frames.find((f) => f.t >= nominal.endAt)!;
    expect(atEnd.unwrap).toBe(0);
    expect(atEnd.evert).toBe(1);
    expect(atEnd.wrap).toBe(1);
    expect(atEnd.pageAlpha).toBe(0);
    expect(atEnd.bgAlpha).toBe(0);
    // No shrink toward an orb, no swell: radius and centre are the viewport-fitted globe the whole way.
    for (const f of nominal.frames.filter((x) => x.t >= PLAN_MS.unwrap[0])) {
      expect(f.radius).toBeCloseTo(0.44 * 720, 3);
      expect(f.centreX).toBeCloseTo(640, 9);
      expect(f.centreY).toBeCloseTo(360, 9);
      expect(f.radius).toBe(atEnd.radius);
    }
    expect(first.unwrap).toBe(1);
  });

  it('the canvas dissolves onto the live page WHILE UNWRAP finishes: alpha 1 until the reveal, then one monotone 1 → 0 that lands with `unwrap` at 0', () => {
    const revealAt = nominal.events.find((e) => e.stage === 'reveal')!.t;
    for (const f of nominal.frames.filter((x) => x.t < revealAt)) {
      expect(f.pageAlpha).toBe(1);
      expect(f.bgAlpha).toBe(1);
    }
    const tail = nominal.frames.filter((f) => f.t >= revealAt);
    expect(tail[tail.length - 1]!.pageAlpha).toBe(0);
    // The dissolve is overlapped with UNWRAP's tail: the page is still (barely) moving while it starts...
    expect(tail.some((f) => f.pageAlpha < 1 && f.unwrap > 0)).toBe(true);
    for (let i = 1; i < tail.length; i++) {
      expect(tail[i]!.pageAlpha).toBeLessThanOrEqual(tail[i - 1]!.pageAlpha + 1e-12);
      // ...and `unwrap` only ever decreases: nothing re-forms behind the dissolve.
      expect(tail[i]!.unwrap).toBeLessThanOrEqual(tail[i - 1]!.unwrap + 1e-12);
      // The clear colour dissolves with the page: nothing outside the page quad is left to pop at the end.
      expect(tail[i]!.bgAlpha).toBe(tail[i]!.pageAlpha);
    }
    expect(tail[tail.length - 1]!.bgAlpha).toBe(0);
    expect(tail[tail.length - 1]!.unwrap).toBe(0);
  });

  it('by the time the dissolve is visible the page is as good as flat: UNWRAP has under 2% left at half alpha', () => {
    const half = nominal.frames.find((f) => f.pageAlpha <= 0.5)!;
    expect(half.unwrap).toBeLessThan(0.02);
  });

  it('is finished at `done` and emits nothing after it', () => {
    expect(nominal.tl.finished).toBe(true);
    let now = nominal.endNow;
    for (let i = 0; i < 50; i++) {
      now += 16;
      const s = nominal.tl.tick(now);
      expect(s.stage).toBe('done');
      expect(s.unwrap).toBe(0);
      expect(s.pageAlpha).toBe(0);
    }
    expect(nominal.tl.events()).toEqual([]);
    nominal.tl.reveal(now);
    nominal.tl.fastForward(now);
    expect(nominal.tl.events()).toEqual([]);
  });

  /*
   * Smoothness is a bound on the THIRD difference. A quintic's jerk peaks at 60 R / T^3 (at its two ends), so over
   * 1 ms steps a channel that is C² has |Δ³| <= 60 R / T^3; a C¹ break (an acceleration step A) puts A h² there,
   * orders of magnitude more, and a C⁰ break more still.
   */
  const T_UNWRAP = UNWRAP_MS + UNWRAP_OVERLAP_MS;
  const quinticJerk = (range: number, ms: number) => (60 * Math.abs(range)) / ms ** 3;
  const third = (f: number[], i: number) => f[i + 2]! - 3 * f[i + 1]! + 3 * f[i]! - f[i - 1]!;
  const worstThird = (series: number[]) => {
    let worst = 0;
    for (let i = 1; i < series.length - 2; i++) worst = Math.max(worst, Math.abs(third(series, i)));
    return worst;
  };

  it('`unwrap` is C² into the end of UNWRAP and through the reveal: no third difference above the quintic peak jerk', () => {
    const window = nominal.frames.filter((f) => f.t >= PLAN_MS.unwrap[1] - 200);
    const bound = quinticJerk(1, T_UNWRAP) * 1.25;
    expect(worstThird(window.map((f) => f.unwrap))).toBeLessThanOrEqual(bound);
    // The whole UNWRAP, not just its tail.
    const all = nominal.frames.filter((f) => f.t >= PLAN_MS.unwrap[0] - 50);
    expect(worstThird(all.map((f) => f.unwrap))).toBeLessThanOrEqual(bound);
  });

  it('the dissolve is one quintic (C², rest to rest) and does not step at the hand-over', () => {
    const revealAt = nominal.events.find((e) => e.stage === 'reveal')!.t;
    const window = nominal.frames.filter((f) => f.t >= revealAt - 20);
    const span = nominal.endAt - revealAt;
    const bound = quinticJerk(1, span) * 1.25;
    expect(worstThird(window.map((f) => f.pageAlpha))).toBeLessThanOrEqual(bound);
    // Its first step moves a rest-start quintic by ~10 (h/T)^3 of its range: nothing.
    const i0 = nominal.frames.findIndex((f) => f.t >= revealAt);
    expect(1 - nominal.frames[i0 + 1]!.pageAlpha).toBeLessThan(1e-5);
  });

  it('the bound can fail: a C¹ break (cubic smoothstep) or a velocity kink (x²) is far above it', () => {
    const T = T_UNWRAP;
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
});

describe('the same ending on the other paths', () => {
  it('a long gate wait: AFTER 5 s late - same order, `unwrap` rests at 0 at the end, the flat page is what is left', () => {
    const late = run({ afterAt: 5000, step: 2 });
    expect(late.events.map((e) => e.stage)).toEqual(ORDER);
    const atEnd = late.frames.find((f) => f.t >= late.endAt)!;
    expect(atEnd.unwrap).toBe(0);
    expect(atEnd.pageAlpha).toBe(0);
    for (const id of [
      'unwrap',
      'evert',
      'wrap',
      'radius',
      'centreX',
      'centreY',
      'hubFade',
    ] as const) {
      const [, v, a] = late.rest.at[id];
      expect(Math.abs(v), `${id} velocity`).toBeLessThan(1e-9);
      expect(Math.abs(a), `${id} acceleration`).toBeLessThan(1e-9);
    }
    // The spin may still be settling (its landing is speed-capped and overlaps UNWRAP), but under a mesh
    // that is flat at `unwrap` 0 it cannot be seen; it is not a visible jump.
    expect(late.events.at(-1)!.stage).toBe('done');
  });

  it('a fast-forward: same order, the run ends within FF_REMAINING_MS plus the round trip, every channel at rest', () => {
    const ff = run({ ffAt: 1500 });
    expect(ff.events.map((e) => e.stage)).toEqual(ORDER);
    const uncover = ff.events.find((e) => e.stage === 'uncover')!;
    const done = ff.events.find((e) => e.stage === 'done')!;
    // UNWRAP is hurried to FF_REMAINING_MS; the dissolve is wall time and is not (it ends with UNWRAP, or a
    // lead + REVEAL_MS after the page was asked for, whichever is later).
    expect(uncover.t).toBeLessThanOrEqual(1500 + FF_REMAINING_MS);
    expect(done.t).toBeLessThanOrEqual(1500 + FF_REMAINING_MS + 50 + UNCOVER_LEAD_MS + REVEAL_MS);
    for (const id of CHANNEL_IDS) {
      const [, v, a] = ff.rest.at[id];
      expect(Math.abs(v), `${id} velocity`).toBeLessThan(1e-9);
      expect(Math.abs(a), `${id} acceleration`).toBeLessThan(1e-9);
    }
  });

  it('a reveal that arrives early is applied at uncover: uncover, reveal, done in that order', () => {
    const tl = new Timeline(config());
    let now = 0;
    tl.start(now);
    tl.afterReady(now);
    tl.reveal(now); // far too early
    const seen: StageId[] = [];
    for (let i = 0; i < 2000 && !tl.finished; i++) {
      now += 10;
      tl.tick(now);
      for (const e of tl.events()) seen.push(e.stage);
    }
    expect(seen.slice(-3)).toEqual(['uncover', 'reveal', 'done']);
  });

  it('a late answer (a slow page) starts the dissolve late and ends it REVEAL_MS later, never before UNWRAP ends', () => {
    const slow = run({ replyMs: 400 });
    expect(slow.events.map((e) => e.stage)).toEqual(ORDER);
    const reveal = slow.events.find((e) => e.stage === 'reveal')!;
    const done = slow.events.find((e) => e.stage === 'done')!;
    expect(reveal.t).toBeGreaterThanOrEqual(PLAN_MS.uncover + 400);
    expect(done.t).toBeCloseTo(reveal.t + REVEAL_MS, 0);
    expect(done.t).toBeGreaterThan(PLAN_MS.unwrap[1]);
    // Until the answer the canvas stays opaque (the live page is not known to be painted yet).
    for (const f of slow.frames.filter((x) => x.t < reveal.t)) expect(f.pageAlpha).toBe(1);
  });

  it('an immediate answer (the hidden-tab settle) dissolves for the rest of UNWRAP and still ends exactly with it', () => {
    const quick = run({ replyMs: 0 });
    expect(quick.events.map((e) => e.stage)).toEqual(ORDER);
    expect(quick.events.at(-1)!.t).toBe(PLAN_MS.unwrap[1]);
  });
});
