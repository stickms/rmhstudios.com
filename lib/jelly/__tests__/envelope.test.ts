import { describe, expect, it } from 'vitest';

import { SPRINGS, springStep, type SpringState } from '@/lib/fluid';

import {
  beginPlastic,
  cornerFlexRadii,
  createEnvelope,
  dragTarget,
  envelopeAsleep,
  envelopeCaps,
  hoverKick,
  hoverTarget,
  impulseVelocity,
  nudgeEnvelope,
  phaseSprings,
  pressTarget,
  renderEnvelope,
  restTarget,
  saturate,
  stepEnvelope,
  type EnvelopeBody,
  type EnvelopePose,
  type EnvelopeSize,
} from '../envelope';
import { PRESS_BASE, SOFT_BODY } from '../soft-policy';
import { MOTION_BOUNDS } from '../tiers';

/**
 * Tier E is the only jelly that moves a host — and with it text and hit areas — so these pin the bounds that make
 * that acceptable: the caps hold under abuse, the press is volume-preserving and reduces to today's press, and a
 * released body falls asleep in bounded time at every refresh rate.
 */

const SIZES = [24, 36, 64, 120, 240, 480, 800, 1200];
const CONTACTS = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 0, y: -1 },
  { x: 0.9, y: 0.9 },
  { x: -1, y: 1 },
];

/** Jelly edge travel per axis: deviation from the legacy press anchor plus translate. */
function edgeTravel(pose: EnvelopePose, size: EnvelopeSize, s0: number) {
  const lo = Math.min(1, s0);
  const hi = Math.max(1, s0);
  const iso = Math.sqrt(pose.sx * pose.sy);
  const anchor = Math.min(hi, Math.max(lo, iso));
  return {
    devX: Math.abs(pose.sx - anchor),
    devY: Math.abs(pose.sy - anchor),
    x: (Math.abs(pose.sx - anchor) * size.w) / 2 + Math.abs(pose.tx),
    y: (Math.abs(pose.sy - anchor) * size.h) / 2 + Math.abs(pose.ty),
  };
}

function run(
  body: EnvelopeBody,
  target: EnvelopePose,
  springs: ReturnType<typeof phaseSprings>,
  seconds: number,
  dt: number,
  each?: (b: EnvelopeBody) => void,
) {
  for (let t = 0; t < seconds; t += dt) {
    stepEnvelope(body, target, springs, dt);
    each?.(body);
  }
}

describe('caps (02 D3: ≤3% and ≤4px at any edge)', () => {
  it('hold for every size, mode and contact, through press, 10× kick and release', () => {
    for (const w of SIZES) {
      for (const h of [24, 48, w]) {
        const size = { w, h };
        for (const s0 of Object.values(PRESS_BASE)) {
          for (const u of CONTACTS) {
            const body = createEnvelope();
            const check = (b: EnvelopeBody) => {
              const travel = edgeTravel(renderEnvelope(b, size, s0), size, s0);
              expect(travel.devX).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta + 1e-9);
              expect(travel.devY).toBeLessThanOrEqual(MOTION_BOUNDS.maxScaleDelta + 1e-9);
              expect(travel.x).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx + 1e-9);
              expect(travel.y).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx + 1e-9);
            };
            // A violent entry: ten times the largest kick, plus a huge nudge.
            for (let i = 0; i < 10; i++) hoverKick(body, 15000, -9000);
            body.tx.velocity += 4000;
            body.ty.velocity -= 4000;
            run(body, pressTarget(u, s0, size), phaseSprings('press'), 0.3, 1 / 60, check);
            run(body, restTarget(body), phaseSprings('release'), 1.2, 1 / 60, check);
            run(body, dragTarget(9000, 4000), phaseSprings('drag'), 0.4, 1 / 60, check);
          }
        }
      }
    }
  });

  it('caps total scale deviation from 1 at 3% when the base is rest', () => {
    const body = createEnvelope();
    body.sx.value = 1.5;
    body.sy.value = 0.6;
    const pose = renderEnvelope(body, { w: 40, h: 40 });
    expect(Math.abs(pose.sx - 1)).toBeLessThanOrEqual(0.03);
    expect(Math.abs(pose.sy - 1)).toBeLessThanOrEqual(0.03);
  });

  it('per-axis cap is min(3%, 4px/size) and lean is min(2px, 0.6% of the short side)', () => {
    expect(envelopeCaps({ w: 50, h: 400 }).scaleX).toBeCloseTo(0.03, 10);
    expect(envelopeCaps({ w: 50, h: 400 }).scaleY).toBeCloseTo(4 / 400, 10);
    expect(envelopeCaps({ w: 100, h: 100 }).lean).toBeCloseTo(0.6, 10);
    expect(envelopeCaps({ w: 1000, h: 1000 }).lean).toBe(2);
  });

  it('saturates smoothly instead of clamping', () => {
    expect(saturate(0.001, 0.03)).toBeCloseTo(0.001, 5);
    expect(saturate(0.05, 0.03)).toBeLessThan(0.03);
    expect(saturate(0.05, 0.03)).toBeGreaterThan(0.025);
    expect(saturate(-1e6, 0.03)).toBeGreaterThanOrEqual(-0.03);
    expect(saturate(1, 0)).toBe(0);
    expect(saturate(Number.NaN, 1)).toBe(0);
  });

  it('lean-only bodies (large or framer-offset) never scale', () => {
    const body = createEnvelope({ sx: 0.9, sy: 1.1, tx: 1, ty: 0 });
    const pose = renderEnvelope(body, { w: 600, h: 600 }, 1, { scale: false });
    expect(pose.sx).toBe(1);
    expect(pose.sy).toBe(1);
    expect(pose.tx).toBeGreaterThan(0);
  });
});

describe('area preservation', () => {
  it('press targets keep sx·sy/s0² within 1 ± 0.002 at centre, edge and corner', () => {
    for (const s0 of Object.values(PRESS_BASE)) {
      for (const u of CONTACTS) {
        const p = pressTarget(u, s0, { w: 120, h: 48 });
        expect(Math.abs((p.sx * p.sy) / (s0 * s0) - 1)).toBeLessThanOrEqual(0.002);
      }
    }
  });

  it('drag stretch is exactly area-preserving and stretches along the motion', () => {
    for (const [vx, vy] of [
      [2400, 0],
      [0, -900],
      [700, 700],
      [-5000, 1200],
    ] as const) {
      const p = dragTarget(vx, vy);
      expect(p.sx * p.sy).toBeCloseTo(1, 12);
    }
    expect(dragTarget(2400, 0).sx).toBeGreaterThan(1);
    expect(dragTarget(2400, 0).sy).toBeLessThan(1);
    expect(dragTarget(2400, 0).tx).toBeLessThan(0); // lag trails the motion
    expect(dragTarget(0, 0)).toEqual({ sx: 1, sy: 1, tx: 0, ty: 0 });
  });

  it('rendered poses keep the area of the isotropic part, however hard the cap bites', () => {
    const body = createEnvelope({ sx: 1.2, sy: 0.85, tx: 0, ty: 0 });
    const pose = renderEnvelope(body, { w: 80, h: 80 });
    const iso = Math.sqrt(1.2 * 0.85);
    const isoOut = Math.sqrt(pose.sx * pose.sy);
    expect(pose.sx / pose.sy).toBeLessThan(1.2 / 0.85);
    expect(isoOut).toBeGreaterThan(1);
    expect(isoOut).toBeLessThanOrEqual(iso);
  });
});

describe('press', () => {
  it('a centre press reduces exactly to the legacy MODES scales', () => {
    for (const s0 of [0.96, 0.985, 1.028]) {
      const p = pressTarget({ x: 0, y: 0 }, s0, { w: 100, h: 40 });
      expect(p.sx).toBe(s0);
      expect(p.sy).toBe(s0);
      // …and renders unchanged: the legacy press is not counted against the caps.
      const pose = renderEnvelope(createEnvelope(p), { w: 100, h: 40 }, s0);
      expect(pose.sx).toBeCloseTo(s0, 12);
      expect(pose.sy).toBeCloseTo(s0, 12);
    }
  });

  it('pressing near the top flattens vertically and widens, and gives toward the contact', () => {
    const p = pressTarget({ x: 0, y: -1 }, 0.96, { w: 200, h: 100 });
    expect(p.sy).toBeLessThan(p.sx);
    expect(p.ty).toBeLessThan(0);
  });

  it('hover plumps cards and dents controls, leaning toward the cursor', () => {
    const card = hoverTarget({ x: 1, y: 0 }, { w: 300, h: 200 }, 'plump');
    const control = hoverTarget({ x: 1, y: 0 }, { w: 300, h: 200 }, 'dent');
    expect(card.sx).toBeCloseTo(1 + SOFT_BODY.hoverPlump, 12);
    expect(control.sx).toBeCloseTo(1 - SOFT_BODY.hoverDent, 12);
    expect(card.tx).toBeGreaterThan(0);
    expect(control.tx).toBeCloseTo(card.tx / 2, 12);
  });
});

describe('release and settle', () => {
  const size = { w: 36, h: 36 };

  function pressed(s0: number, u = { x: 0, y: 0 }) {
    const target = pressTarget(u, s0, size);
    const body = createEnvelope(target);
    return { body, target };
  }

  it('overshoots between 15% and 30% of the squash, as rendered', () => {
    const { body } = pressed(PRESS_BASE.sink);
    let peak = 0;
    run(body, restTarget(body), phaseSprings('release'), 1.2, 1 / 240, (b) => {
      peak = Math.max(peak, renderEnvelope(b, size, PRESS_BASE.sink).sx - 1);
    });
    const squash = 1 - PRESS_BASE.sink;
    expect(peak / squash).toBeGreaterThanOrEqual(0.15);
    expect(peak / squash).toBeLessThanOrEqual(0.3);
  });

  it('falls asleep within 1.2s at 30, 60, 120 and 144Hz', () => {
    for (const hz of [30, 60, 120, 144]) {
      for (const u of CONTACTS) {
        const { body } = pressed(PRESS_BASE.sink, u);
        body.tx.velocity = 30; // a lean in flight as well
        let t = 0;
        while (!envelopeAsleep(body) && t < 5) {
          stepEnvelope(body, restTarget(body), phaseSprings('release'), 1 / hz);
          t += 1 / hz;
        }
        expect(t, `${hz}Hz`).toBeLessThanOrEqual(1.2);
      }
    }
  });

  it('survives a single catastrophic 250ms frame and still sleeps within 1.2s', () => {
    const { body } = pressed(PRESS_BASE.lift, { x: 1, y: 1 });
    stepEnvelope(body, restTarget(body), phaseSprings('release'), 0.25);
    for (const k of ['sx', 'sy', 'tx', 'ty'] as const)
      expect(Number.isFinite(body[k].value)).toBe(true);
    let t = 0.25;
    while (!envelopeAsleep(body) && t < 5) {
      stepEnvelope(body, restTarget(body), phaseSprings('release'), 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeLessThanOrEqual(1.2);
  });

  it('never sleeps while away from rest, and a body at rest is asleep', () => {
    expect(envelopeAsleep(createEnvelope())).toBe(true);
    expect(envelopeAsleep(createEnvelope({ sx: 0.99, sy: 1, tx: 0, ty: 0 }))).toBe(false);
    const moving = createEnvelope();
    moving.tx.velocity = 3;
    expect(envelopeAsleep(moving)).toBe(false);
  });

  it('lite/still release (no wobble) never overshoots', () => {
    const { body } = pressed(PRESS_BASE.sink);
    let peak = 0;
    run(body, REST(), phaseSprings('release', false), 1.5, 1 / 60, (b) => {
      peak = Math.max(peak, b.sx.value - 1);
    });
    expect(peak).toBeLessThanOrEqual(1e-9);
  });

  it('re-pressing mid-wobble is continuous and carries the velocity over', () => {
    const { body } = pressed(PRESS_BASE.sink);
    run(body, REST(), phaseSprings('release'), 0.12, 1 / 60);
    const before = { ...body.sx };
    expect(Math.abs(before.velocity)).toBeGreaterThan(0.01);
    const dt = 1 / 60;
    stepEnvelope(body, pressTarget({ x: 0, y: 0 }, 0.96, size), phaseSprings('press'), dt);
    // One frame can move at most a little: no position jump on retarget.
    expect(Math.abs(body.sx.value - before.value)).toBeLessThan(
      Math.abs(before.velocity) * dt + 0.01,
    );
    // The retarget started from the carried velocity, not from zero.
    const fromRest: SpringState = springStep(
      { value: before.value, velocity: 0 },
      0.96,
      SPRINGS.jellyPress,
      dt,
    );
    expect(body.sx.value).not.toBeCloseTo(fromRest.value, 6);
  });
});

function REST(): EnvelopePose {
  return restTarget();
}

describe('plastic memory', () => {
  const size = { w: 60, h: 40 };

  it('is zero for presses under 350ms', () => {
    const body = createEnvelope();
    beginPlastic(body, pressTarget({ x: 1, y: 0 }, 0.96, size), 0.96, 300);
    expect(body.plastic.kx).toBe(0);
    expect(body.plastic.ky).toBe(0);
  });

  it('keeps ≤ 40% of a long press and decays to <1% within 3τ', () => {
    const target = pressTarget({ x: 1, y: 0 }, 0.96, size);
    const body = createEnvelope(target);
    beginPlastic(body, target, 0.96, 5000);
    const initial = Math.abs(body.plastic.kx);
    expect(initial).toBeGreaterThan(0);
    expect(initial).toBeLessThanOrEqual(0.4 * Math.abs(target.sx / 0.96 - 1) + 1e-12);
    const memory = () => Math.abs(restTarget(body).sx - 1);
    expect(memory()).toBeCloseTo(initial, 12);
    run(body, restTarget(body), phaseSprings('release'), 3 * SOFT_BODY.plasticTau + 0.02, 1 / 60);
    expect(memory()).toBeLessThan(0.01 * initial);
  });

  it('lets the body sleep once the memory has gone', () => {
    const target = pressTarget({ x: 0, y: 1 }, 0.96, size);
    const body = createEnvelope(target);
    beginPlastic(body, target, 0.96, 2000);
    let t = 0;
    while (!envelopeAsleep(body) && t < 10) {
      stepEnvelope(body, restTarget(body), phaseSprings('release'), 1 / 60);
      t += 1 / 60;
    }
    expect(t).toBeLessThan(3 * SOFT_BODY.plasticTau + 1.2);
  });
});

describe('impulses', () => {
  it('impulseVelocity produces the requested peak', () => {
    for (const s of [SPRINGS.jellyNudge, SPRINGS.jellyRelease, SPRINGS.jellyPress]) {
      let state: SpringState = { value: 0, velocity: impulseVelocity(1.5, s) };
      let peak = 0;
      for (let i = 0; i < 2000; i++) {
        state = springStep(state, 0, s, 1 / 2000);
        peak = Math.max(peak, state.value);
      }
      expect(peak).toBeCloseTo(1.5, 2);
    }
  });

  it('a nudge moves translate only, away along the direction, by ≤ 1.5px', () => {
    const body = createEnvelope();
    nudgeEnvelope(body, 3, 0, 99);
    let peak = 0;
    run(body, REST(), phaseSprings('release'), 1, 1 / 240, (b) => {
      peak = Math.max(peak, b.tx.value);
      expect(b.sx.value).toBe(1);
    });
    expect(peak).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx + 0.01);
    expect(peak).toBeGreaterThan(1);
  });
});

describe('corner flex', () => {
  it('tightens the corners nearest the contact and rounds the far ones by ≤ 25%', () => {
    const [tl, tr, br, bl] = cornerFlexRadii(12, { x: 1, y: 1 });
    expect(br).toBeLessThan(12);
    expect(tl).toBeGreaterThan(12);
    expect(tr).toBeCloseTo(12, 10);
    expect(bl).toBeCloseTo(12, 10);
    for (const r of [tl, tr, br, bl]) {
      expect(r).toBeGreaterThanOrEqual(12 * 0.75 - 1e-9);
      expect(r).toBeLessThanOrEqual(12 * 1.25 + 1e-9);
    }
    expect(cornerFlexRadii(12, { x: 0, y: 0 })).toEqual([12, 12, 12, 12]);
  });
});
