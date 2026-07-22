import { describe, it, expect } from 'vitest';
import { computeDroplet, MERGE_GAP, TAPER_MIN, DROP_FACTOR } from '../droplet';

/**
 * §17.1 — the trail droplet must stay fused to its capsule in both tiers. These
 * assert the pure clamp/taper invariants the CSS goo and GL smin both rely on.
 */
describe('computeDroplet (§17.1 trail cohesion)', () => {
  const W = 120;
  const H = 40; // a typical tab capsule
  const short = Math.min(W, H);

  it('sits exactly under the capsule centre at zero lag, full size', () => {
    const d = computeDroplet(200, 100, 200, 100, W, H);
    expect(d.cx).toBeCloseTo(200);
    expect(d.cy).toBeCloseTo(100);
    expect(d.d).toBeCloseTo(short * DROP_FACTOR);
  });

  it('never lets the droplet edge trail the capsule edge past the merge gap, even on a huge jump', () => {
    // Capsule at x=500; raw spring way behind at x=100 (400px of lag mid-flight).
    const cx = 500;
    const { cx: dcx, d } = computeDroplet(cx, 100, 100, 100, W, H);
    const halfAlong = W / 2; // pure-x lag
    const capsuleTrailingEdge = cx - halfAlong;
    const dropletLeadingEdge = dcx + d / 2;
    const gap = capsuleTrailingEdge - dropletLeadingEdge;
    expect(gap).toBeLessThanOrEqual(MERGE_GAP + 1e-6);
    expect(gap).toBeGreaterThanOrEqual(0); // still trailing, not overshooting ahead
  });

  it('tapers the droplet down toward TAPER_MIN as lag grows', () => {
    const near = computeDroplet(210, 100, 205, 100, W, H).d; // small lag
    const far = computeDroplet(900, 100, 100, 100, W, H).d; // saturated lag
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(short * DROP_FACTOR * TAPER_MIN - 1e-6);
    expect(far).toBeLessThanOrEqual(short * DROP_FACTOR * TAPER_MIN + short * DROP_FACTOR * 0.05);
  });

  it('clamps diagonal lag along the true lag axis', () => {
    const cx = 400;
    const cy = 300;
    const { cx: dcx, cy: dcy, d } = computeDroplet(cx, cy, 100, 100, W, H);
    // Droplet centre lies on the ray from capsule centre toward the raw point.
    const ux = (cx - 100) / Math.hypot(cx - 100, cy - 100);
    const uy = (cy - 100) / Math.hypot(cx - 100, cy - 100);
    const lag = Math.hypot(cx - dcx, cy - dcy);
    expect(dcx).toBeCloseTo(cx - ux * lag, 4);
    expect(dcy).toBeCloseTo(cy - uy * lag, 4);
    const halfAlong = Math.abs(ux) * (W / 2) + Math.abs(uy) * (H / 2);
    expect(lag).toBeLessThanOrEqual(halfAlong + d / 2 + MERGE_GAP + 1e-6);
  });
});
