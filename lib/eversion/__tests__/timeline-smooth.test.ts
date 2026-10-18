/**
 * The review-R1 fixes to the timeline, each pinned by a number: the projected
 * extent never leaves the viewport (spec §11.1 test 10, amended), the tilt does
 * not swing out on a hub throw, the spin starts at EXACTLY the inherited velocity,
 * the post-gate landing never whirls, and a resize re-plans the globe.
 *
 * Kept apart from `timeline.test.ts` (the 10 000-scenario property suite) so the
 * two can change independently.
 */

import { describe, expect, it } from 'vitest';

import {
  GLOBE_RADIUS_FRACTION,
  PLAN_MS,
  PROJECTED_EXTENT_LIMIT,
  PROJECTED_EXTENT_MAX,
  SPIN_LAND_MAX_DEG_PER_S,
  SPIN_LAND_MAX_MS,
  SPIN_MAX_REMAINING_TURNS,
  SPIN_TURNS,
  TILT_SANE_DEG,
} from '../constants';
import { TAU } from '../domain';
import { GLOBE_PERSP } from '../../globe';
import { peirce } from '../projections/peirce';
import { Timeline, eversionRadiusFit } from '../timeline';
import { evert } from '../thurston';
import type { GlobeStartState, PeirceFit, TimelineConfig, Viewport } from '../types';

const DEG = Math.PI / 180;

function config(
  globe: Partial<GlobeStartState> = {},
  over: Partial<TimelineConfig> = {},
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
      ...globe,
    },
    thetaAlign: over.thetaAlign,
  };
}

/** A running timeline whose wall clock the test owns. */
function run(cfg: TimelineConfig) {
  const tl = new Timeline(cfg);
  const wall = { now: 1000 };
  tl.start(wall.now);
  /** Advance the timeline clock to `until` in `step`-ms frames, calling `each` on every frame. */
  const to = (until: number, step = 5, each?: (t: number) => void) => {
    for (let i = 0; i < 200_000; i++) {
      const snap = tl.tick(wall.now);
      each?.(snap.t);
      if (snap.t >= until - 1e-9) return;
      wall.now += Math.min(step, Math.max(until - snap.t, 0.001));
    }
  };
  return { tl, wall, to };
}

const v3 = new Float64Array(3);
function sampled(tl: Timeline, id: Parameters<Timeline['sample']>[0], now: number): number[] {
  tl.sample(id, now, v3);
  return [v3[0]!, v3[1]!, v3[2]!];
}

/**
 * Walk a fresh timeline from 0 to `until` in `step`-ms frames (the timeline clock moves at most
 * 50 ms a call, so a channel can only be read where the clock has been), handing `(t, x, v, a)` of
 * the channel to `each` at every frame, `t = 0` first.
 */
function walk(
  cfg: TimelineConfig,
  id: Parameters<Timeline['sample']>[0],
  until: number,
  step: number,
  each: (t: number, x: number, v: number, a: number) => void,
): Timeline {
  const tl = new Timeline(cfg);
  tl.start(0);
  tl.afterReady(0);
  for (let t = 0; t <= until + 1e-9; t += step) {
    if (t > 0) tl.tick(t);
    tl.sample(id, t, v3);
    each(t, v3[0]!, v3[1]!, v3[2]!);
  }
  return tl;
}

/* ── 1. The projected extent ─────────────────────────────────────────────── */

/**
 * Largest screen-plane distance of the everting surface from the globe centre, in
 * units of the radius, WITH the perspective division, for rotation `Rx(tilt)·Ry(spin)`
 * — the exact arithmetic of the vertex shader (`spinTilt`, then `k = P/(P − z/2)`).
 */
function projectedExtent(e: number, spin: number, tilt: number, nTheta = 96, nPhi = 48): number {
  const F = new Float64Array(3);
  const cy = Math.cos(spin);
  const sy = Math.sin(spin);
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  let best = 0;
  for (let j = 0; j <= nPhi; j++) {
    const phi = -Math.PI / 2 + (Math.PI * j) / nPhi;
    for (let i = 0; i < nTheta; i++) {
      evert(-Math.PI + (TAU * i) / nTheta, phi, e, F);
      const x1 = F[0]! * cy + F[2]! * sy;
      const z1 = -F[0]! * sy + F[2]! * cy;
      const y = F[1]! * ct - z1 * st;
      const z = F[1]! * st + z1 * ct;
      const r = Math.hypot(x1, y) * (GLOBE_PERSP / (GLOBE_PERSP - z / 2));
      if (r > best) best = r;
    }
  }
  return best;
}

describe('the radius fit (spec §11.1 test 10, amended)', () => {
  it('is 1 at both ends, dips smoothly to the floor, and is C² in e', () => {
    expect(eversionRadiusFit(0)).toBe(1);
    expect(eversionRadiusFit(1)).toBe(1);
    const floor = PROJECTED_EXTENT_LIMIT / (GLOBE_RADIUS_FRACTION * PROJECTED_EXTENT_MAX);
    expect(eversionRadiusFit(0.3)).toBeCloseTo(floor, 12);
    // Finite differences of the first and second derivative stay bounded and small (no kink).
    const h = 1e-3;
    let maxD1 = 0;
    let maxD2 = 0;
    for (let e = h; e < 1 - h; e += h) {
      maxD1 = Math.max(maxD1, Math.abs(eversionRadiusFit(e + h) - eversionRadiusFit(e)) / h);
      maxD2 = Math.max(
        maxD2,
        Math.abs(eversionRadiusFit(e + h) - 2 * eversionRadiusFit(e) + eversionRadiusFit(e - h)) /
          (h * h),
      );
    }
    // Peaks of a smootherstep ramp of depth 0.226 over 0.13 of e: 1.875·0.226/0.13 = 3.26 and 5.77·0.226/0.13².
    expect(maxD1).toBeLessThan(3.4);
    expect(maxD2).toBeLessThan(85);
  });

  it('keeps the projected extent of the oracle under the limit at every e, any spin, tilt up to 40°', () => {
    const limit = PROJECTED_EXTENT_LIMIT;
    let worstExtent = 0;
    let worstFraction = 0;
    for (let k = 0; k <= 100; k++) {
      const e = k / 100;
      let ext = 0;
      for (let s = 0; s < 12; s++) {
        for (const tilt of [-40, 0, 40]) {
          ext = Math.max(ext, projectedExtent(e, (TAU * s) / 12, tilt * DEG, 72, 36));
        }
      }
      worstExtent = Math.max(worstExtent, ext);
      const fraction = GLOBE_RADIUS_FRACTION * eversionRadiusFit(e) * ext;
      worstFraction = Math.max(worstFraction, fraction);
      expect(fraction, `e=${e}`).toBeLessThanOrEqual(limit + 1e-9);
    }
    // The design extent has a margin over what the oracle measures here.
    console.warn(
      `R1 extent: worst projected extent ${worstExtent.toFixed(4)}, worst fraction of min ${worstFraction.toFixed(4)}`,
    );
    expect(worstExtent).toBeLessThanOrEqual(PROJECTED_EXTENT_MAX);
    expect(worstExtent).toBeGreaterThan(1.3);
    // …and the fit is not needlessly tight: the worst case sits within 3 % of the limit.
    expect(worstFraction).toBeGreaterThan(limit * 0.97);
  }, 60_000);

  const SCENARIOS: { name: string; run: (t: ReturnType<typeof run>) => void }[] = [
    { name: 'nominal', run: ({ tl, wall }) => tl.afterReady(wall.now) },
    { name: 'AFTER never arrives (gate wait)', run: () => {} },
    { name: 'fast-forward at 1500', run: () => {} },
  ];

  it.each(SCENARIOS.map((s, i) => [s.name, i] as const))(
    'the real timeline never pokes past 0.47·min(W, H): %s',
    (_name, i) => {
      for (const vp of [
        { w: 1280, h: 720, dpr: 1 },
        { w: 390, h: 844, dpr: 3 },
        { w: 900, h: 900, dpr: 1 },
      ] as Viewport[]) {
        const h = run(config({ yaw: 30, pitch: 20, yawVel: 120 }, { viewport: vp }));
        SCENARIOS[i]!.run(h);
        const min = Math.min(vp.w, vp.h);
        let worst = 0;
        let sampledAt = 0;
        h.to(5200, 5, (t) => {
          if (i === 2 && t > 1500 && t < 1510) h.tl.fastForward(h.wall.now);
          const s = h.tl.tick(h.wall.now);
          // Every 60 ms of timeline, from the moment the eversion has started to the end of UNWRAP
          if (t < 600 || s.stage === 'reveal' || t - sampledAt < 60) return;
          sampledAt = t;
          const ext = projectedExtent(s.evert, s.spin, s.tilt, 64, 32);
          worst = Math.max(worst, (s.radius * ext) / min);
        });
        expect(worst, `${vp.w}x${vp.h}`).toBeLessThanOrEqual(PROJECTED_EXTENT_LIMIT + 1e-3);
        expect(worst).toBeGreaterThan(0.3);
      }
    },
    60_000,
  );

  it('the effective radius is continuous and smooth through the whole run', () => {
    const h = run(config({ yawVel: 200 }));
    h.tl.afterReady(h.wall.now);
    const r: number[] = [];
    const step = 4;
    // From the end of WRAP (the hub radius → 0.44·min move is the fastest thing and is the timeline's own).
    h.to(PLAN_MS.unwrap[1], step, (t) => {
      if (t >= PLAN_MS.wrap[1]) r.push(h.tl.tick(h.wall.now).radius);
    });
    let maxJump = 0;
    let maxCurve = 0;
    for (let i = 2; i < r.length; i++) {
      maxJump = Math.max(maxJump, Math.abs(r[i]! - r[i - 1]!));
      maxCurve = Math.max(maxCurve, Math.abs(r[i]! - 2 * r[i - 1]! + r[i - 2]!));
    }
    // px per 4 ms frame and px per frame²: a 720p globe is ~317 px and the fit takes 72 of them away.
    // The fastest part is the fit growing back (72 px over ~350 ms): ~0.4 px/ms.
    expect(maxJump).toBeLessThan(2.2);
    expect(maxCurve, `jump ${maxJump}`).toBeLessThan(0.1);
  });
});

/* ── 2. The tilt on a hub throw ──────────────────────────────────────────── */

describe('tilt hand-off (finding 2)', () => {
  const PITCHES = [-62, -45, -20, 0, 20, 45, 62];
  const VELS = [-900, -600, -300, -100, -20, 0, 20, 100, 300, 600, 900];

  it('starts at exactly the inherited pitch velocity and stays in a sane range for every pose', () => {
    let worstSane = 0;
    let worstOver = 0;
    for (const pitch of PITCHES) {
      for (const vel of VELS) {
        let peak = 0;
        let x0 = NaN;
        let v0 = NaN;
        const tl = walk(
          config({ pitch, pitchVel: vel }),
          'tilt',
          PLAN_MS.tiltEnd + 20,
          2,
          (t, x, v) => {
            if (t === 0) {
              x0 = x;
              v0 = v;
            }
            peak = Math.max(peak, Math.abs(x));
          },
        );
        expect(x0).toBeCloseTo(pitch * DEG, 12);
        expect(v0 * 1000).toBeCloseTo(vel * DEG, 9);
        const peakDeg = peak / DEG;
        const bound = Math.max(TILT_SANE_DEG, Math.abs(pitch));
        // Never beyond the larger of "sane" and where the hub already is, by more than the
        // braking leg's minimum travel (a hub at its pitch limit still moving outward).
        expect(peakDeg, `pitch ${pitch} vel ${vel}`).toBeLessThanOrEqual(bound + 30);
        // Where the pose leaves room it stays sane: this is the +900°/s flick that used to reach 172°.
        if (Math.abs(pitch) <= 30) {
          expect(peakDeg, `pitch ${pitch} vel ${vel}`).toBeLessThanOrEqual(TILT_SANE_DEG + 1);
          worstSane = Math.max(worstSane, peakDeg);
        }
        worstOver = Math.max(worstOver, peakDeg - bound);
        // Lands level at 4300 ms, at rest.
        const end = sampled(tl, 'tilt', PLAN_MS.tiltEnd + 20);
        expect(end[0]).toBe(0);
        expect(end[1]).toBe(0);
      }
    }
    console.warn(
      `R1 tilt: worst peak (|pitch|<=30) ${worstSane.toFixed(2)} deg, worst over bound ${worstOver.toFixed(2)} deg`,
    );
    expect(worstSane).toBeGreaterThan(18); // the throws really are exercised
    expect(worstOver).toBeLessThan(30);
  });

  it('is C² through the braking leg joint', () => {
    let prev: number[] | null = null;
    let maxDv = 0;
    let maxDa = 0;
    walk(config({ pitch: 10, pitchVel: 700 }), 'tilt', 1500, 1, (_t, x, v, a) => {
      if (prev) {
        maxDv = Math.max(maxDv, Math.abs(v - prev[1]!));
        maxDa = Math.max(maxDa, Math.abs(a - prev[2]!));
      }
      prev = [x, v, a];
    });
    // Per 1 ms: the velocity moves by at most the braking's peak acceleration (~2e-4 rad/ms²) and
    // the acceleration by a few percent of that (the quintic's jerk) — no kink at the joint.
    expect(maxDv).toBeLessThan(3e-4);
    expect(maxDa, `dv ${maxDv}`).toBeLessThan(2e-5);
  });
});

/* ── 3. The spin hand-off ────────────────────────────────────────────────── */

describe('spin hand-off (finding 3)', () => {
  it('starts at EXACTLY the inherited yaw velocity for every velocity in [-900, 900]', () => {
    let worstErr = 0;
    for (let vel = -900; vel <= 900; vel += 25) {
      for (const [yaw, align] of [
        [0, 0],
        [123, 1.1],
        [-400, -2.5],
      ] as const) {
        const tl = new Timeline(config({ yaw, yawVel: vel }, { thetaAlign: align }));
        tl.start(0);
        tl.tick(1e-6);
        const v = sampled(tl, 'spin', 1e-6);
        const err = Math.abs(v[1]! - (vel * DEG) / 1000);
        worstErr = Math.max(worstErr, err);
        expect(err, `vel ${vel}`).toBeLessThan(1e-15);
        expect(Math.abs(v[0]! - yaw * DEG)).toBeLessThan(1e-6);
        // The goal is on the alignment, within 1.5 turns, in the direction of the throw.
        const rem = tl.spinTarget - yaw * DEG;
        expect(Math.abs(rem)).toBeLessThanOrEqual(SPIN_MAX_REMAINING_TURNS * TAU + 1e-9);
        if (Math.abs(vel) > 20) expect(Math.sign(rem), `vel ${vel}`).toBe(Math.sign(vel));
        const turns = (tl.spinTarget - align) / TAU;
        expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
      }
    }
    console.warn(`R1 spin: worst |v0 error| ${worstErr} rad/ms`);
    expect(worstErr).toBeLessThan(1e-15);
  });

  it('never goes past the goal, never leaves more than 1.5 turns, and lands at rest, for every throw', () => {
    for (let vel = -900; vel <= 900; vel += 75) {
      const h = run(config({ yaw: 10, yawVel: vel }, { thetaAlign: 0.4 }));
      h.tl.afterReady(h.wall.now);
      const goal = h.tl.spinTarget;
      const dir = Math.sign(goal - 10 * DEG) || 1;
      let peakV = 0;
      h.to(PLAN_MS.spin[1], 3, () => {
        const s = h.tl.tick(h.wall.now);
        const rem = (goal - s.spin) * dir;
        // (the goal is fixed: afterReady at once opens the gate on schedule)
        expect(rem, `vel ${vel} t ${s.t}`).toBeGreaterThanOrEqual(-1e-6);
        expect(rem).toBeLessThanOrEqual(SPIN_MAX_REMAINING_TURNS * TAU + 1e-6);
        peakV = Math.max(peakV, Math.abs(sampled(h.tl, 'spin', h.wall.now)[1]!));
      });
      const end = sampled(h.tl, 'spin', h.wall.now + 1);
      expect(end[1]).toBe(0);
      expect(end[2]).toBe(0);
      // The braking is at most the throw itself; the rest of the run is no faster than the nominal peak × 1.5.
      expect((peakV * 1000) / DEG).toBeLessThanOrEqual(
        Math.max(Math.abs(vel), 1.5 * NOMINAL_PEAK_DEG) + 1e-6,
      );
    }
  });

  it('a throw brakes without a jerk: acceleration is continuous at the joint', () => {
    const tl = new Timeline(config({ yawVel: 900 }));
    tl.start(0);
    let prev = sampled(tl, 'spin', 0);
    let maxDa = 0;
    for (let t = 1; t <= 1500; t++) {
      tl.tick(t);
      const cur = sampled(tl, 'spin', t);
      maxDa = Math.max(maxDa, Math.abs(cur[2]! - prev[2]!));
      prev = cur;
    }
    // Peak acceleration of the braking is ~ 1.9·ω₀/T ≈ 1e-4 rad/ms²; a 1 ms step must be a small fraction.
    expect(maxDa).toBeLessThan(2e-6);
  });
});

/** Peak of the nominal rest-to-rest 1.25-turn spin, deg/s: 15/8 of the mean speed. */
const NOMINAL_PEAK_DEG = (1.875 * SPIN_TURNS * 360) / (PLAN_MS.spin[1] / 1000);

/* ── 4. The post-gate landing ────────────────────────────────────────────── */

describe('post-gate spin landing (finding 4)', () => {
  const scenarios: { name: string; drive: (h: ReturnType<typeof run>) => void }[] = [
    { name: 'AFTER never arrives (cap at 6300)', drive: () => {} },
    {
      name: 'AFTER ready at 4000',
      drive: (h) => h.to(4000, 5, () => {}) ?? h.tl.afterReady(h.wall.now),
    },
    {
      name: 'fast-forward at 3500 while waiting',
      drive: (h) => {
        h.to(3500, 5, () => {});
        h.tl.fastForward(h.wall.now);
      },
    },
    {
      name: 'AFTER ready at 5100',
      drive: (h) => {
        h.to(5100, 5, () => {});
        h.tl.afterReady(h.wall.now);
      },
    },
    {
      name: 'AFTER fails at 3300',
      drive: (h) => {
        h.to(3300, 5, () => {});
        h.tl.afterFailed(h.wall.now);
      },
    },
  ];

  it('never exceeds 1.5× the nominal peak speed after 3000 ms, whatever the phase of the cruise', () => {
    let worst = 0;
    let longest = 0;
    for (const sc of scenarios) {
      for (const align of [0, 0.9, 2.2, 3.9, 5.5]) {
        for (const vel of [0, 120, -120, 600]) {
          const h = run(config({ yaw: align * 40, yawVel: vel }, { thetaAlign: align }));
          sc.drive(h);
          let landed = -1;
          let peak = 0;
          let last = 0;
          h.to(14_000, 4, (t) => {
            if (t < 3000) return;
            const v = (Math.abs(sampled(h.tl, 'spin', h.wall.now)[1]!) * 1000) / DEG;
            peak = Math.max(peak, v);
            if (v > 1e-9) last = t;
            if (h.tl.finished && landed < 0) landed = t;
          });
          expect(peak, `${sc.name} align ${align} vel ${vel}`).toBeLessThanOrEqual(
            1.5 * NOMINAL_PEAK_DEG,
          );
          worst = Math.max(worst, peak);
          // Aligned and at rest at the end.
          const end = sampled(h.tl, 'spin', h.wall.now);
          expect(end[1]).toBe(0);
          const turns = (end[0]! - align) / TAU;
          expect(Math.abs(turns - Math.round(turns))).toBeLessThan(1e-9);
          longest = Math.max(longest, last);
        }
      }
    }
    console.warn(
      `R1 post-gate: peak ${worst.toFixed(1)} deg/s (nominal ${NOMINAL_PEAK_DEG.toFixed(1)})`,
    );
    expect(worst).toBeLessThanOrEqual(1.5 * NOMINAL_PEAK_DEG);
    expect(worst).toBeGreaterThan(30); // it did land from a cruise
    expect(SPIN_LAND_MAX_DEG_PER_S).toBeLessThanOrEqual(1.5 * NOMINAL_PEAK_DEG);
    expect(longest).toBeGreaterThan(3000);
  }, 60_000);

  it('the landing takes at most SPIN_LAND_MAX_MS from the gate and the stage times are untouched', () => {
    let longest = 0;
    for (let align = 0; align < 6.3; align += 0.25) {
      const h = run(config({ yawVel: 0 }, { thetaAlign: align }));
      const events: { stage: string; t: number }[] = [];
      let lastMoving = 0;
      h.to(12_000, 4, (t) => {
        events.push(...h.tl.events());
        if (Math.abs(sampled(h.tl, 'spin', h.wall.now)[1]!) > 0) lastMoving = t;
        const snap = h.tl.tick(h.wall.now);
        if (snap.stage === 'uncover') h.tl.reveal(h.wall.now);
      });
      const at = (s: string) => events.find((e) => e.stage === s)!.t;
      // Never-arriving AFTER: unwrap exactly at the cap, as before.
      expect(at('unwrap')).toBeCloseTo(PLAN_MS.unwrap[0] + 2500, 6);
      expect(at('gate-open')).toBeCloseTo(at('unwrap'), 6);
      longest = Math.max(longest, lastMoving - at('gate-open'));
    }
    console.warn(`R1 landing: longest ${longest.toFixed(0)} ms`);
    expect(longest).toBeLessThanOrEqual(SPIN_LAND_MAX_MS);
    expect(longest).toBeGreaterThan(500); // some phases really do need longer than the nominal 500 ms
  });
});

/* ── 5. Resize re-plans the globe ───────────────────────────────────────── */

describe('resize (finding 5)', () => {
  it('re-plans the radius/centre without a jump, and the run still ends on the new viewport', () => {
    const h = run(config({}));
    h.tl.afterReady(h.wall.now);
    h.to(2000, 5);
    const before = h.tl.tick(h.wall.now);
    h.tl.resize(h.wall.now, { w: 900, h: 600, dpr: 1 });
    const after = h.tl.tick(h.wall.now);
    expect(Math.abs(after.centreX - before.centreX)).toBeLessThan(1e-9);
    expect(Math.abs(after.radius - before.radius)).toBeLessThan(1e-9);
    let revealed = false;
    h.to(8000, 5, () => {
      for (const e of h.tl.events()) if (e.stage === 'uncover' && !revealed) revealed = true;
      if (revealed) h.tl.reveal(h.wall.now);
    });
    const end = h.tl.tick(h.wall.now);
    expect(end.stage).toBe('done');
    expect(end.centreX).toBeCloseTo(450, 6);
    expect(end.centreY).toBeCloseTo(300, 6);
  });
});

/* ── 8. Peirce's fit on a degenerate viewport ─────────────────────────────── */

describe('peirce.fit', () => {
  it('guards a zero-size viewport like the other projections', () => {
    for (const [w, h] of [
      [0, 0],
      [0, 100],
      [100, 0],
    ] as const) {
      const fit = peirce.fit(w, h) as PeirceFit;
      for (const k of ['aspect', 'halfW', 'halfH', 'squareHalf'] as const) {
        expect(Number.isFinite(fit[k]), `${w}x${h} ${k}`).toBe(true);
      }
    }
  });
});
