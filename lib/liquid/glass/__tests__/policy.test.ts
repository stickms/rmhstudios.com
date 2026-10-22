import { describe, expect, it } from 'vitest';
import {
  GLASS_BUDGET,
  LIGHT_REACH,
  RIPPLE_REACH,
  admit,
  approach,
  bevelFor,
  dprFor,
  innerRadius,
  lightTarget,
  rippleAmplitude,
  sceneCoverage,
  sizeEligible,
  thicknessFor,
  type Candidate,
} from '../policy';

describe('bevel and thickness', () => {
  it('scales with the short side and never exceeds sane limits', () => {
    expect(bevelFor(1200, 56, 0)).toBeLessThanOrEqual(24);
    expect(bevelFor(1200, 56, 0)).toBeGreaterThanOrEqual(8);
    expect(bevelFor(400, 300, 24)).toBeLessThanOrEqual(24);
    expect(bevelFor(30, 30, 15)).toBeLessThan(15);
    expect(bevelFor(2000, 2000, 80)).toBe(24);
  });
  it('refracts less deep than the bevel is wide, so rim content is not sampled from past the band', () => {
    for (const b of [8, 12, 18]) expect(thicknessFor(b)).toBeLessThan(b);
  });
});

describe('sizing and the surface budget', () => {
  it('rejects surfaces too small or too large', () => {
    expect(sizeEligible(20, 200)).toBe(false);
    expect(sizeEligible(400, 300)).toBe(true);
    expect(sizeEligible(1400, 900)).toBe(false);
    expect(sizeEligible(GLASS_BUDGET.minSide, GLASS_BUDGET.minSide)).toBe(true);
  });
  it('draws large surfaces at a lower scale', () => {
    expect(dprFor(3, 300, 200)).toBe(2);
    expect(dprFor(3, 800, 600)).toBe(1.5);
    expect(dprFor(1, 800, 600)).toBe(1);
    expect(dprFor(0, 300, 200)).toBe(1);
  });
  const c = (
    id: number,
    role: Candidate['role'],
    order = id,
    over: Partial<Candidate> = {},
  ): Candidate => ({
    id,
    role,
    order,
    visible: true,
    width: 300,
    height: 120,
    ...over,
  });
  it('admits floating UI before chrome before panes, then by registration order', () => {
    const got = admit([c(1, 'pane'), c(2, 'chrome'), c(3, 'overlay'), c(4, 'pane', 0)]);
    expect(got.map((x) => x.id)).toEqual([3, 2, 4, 1]);
  });
  it('admits repeated cards last, after every other role', () => {
    const got = admit([c(1, 'fill'), c(2, 'pane'), c(3, 'chrome'), c(4, 'overlay')]);
    expect(got.map((x) => x.id)).toEqual([4, 3, 2, 1]);
  });
  it('caps at the budget and drops hidden and ineligible surfaces', () => {
    const many = Array.from({ length: GLASS_BUDGET.maxSurfaces + 6 }, (_, i) => c(i, 'pane'));
    expect(admit(many)).toHaveLength(GLASS_BUDGET.maxSurfaces);
    expect(admit([c(1, 'pane', 1, { visible: false }), c(2, 'pane', 2, { width: 10 })])).toEqual(
      [],
    );
  });
  it('is stable: the same candidates give the same admitted set every pass', () => {
    const many = Array.from({ length: 12 }, (_, i) => c(i, i % 3 === 0 ? 'chrome' : 'pane'));
    expect(admit(many).map((x) => x.id)).toEqual(admit([...many].reverse()).map((x) => x.id));
  });
});

describe('snapshot coverage', () => {
  it('is full while the sample region is inside the picture', () => {
    expect(sceneCoverage(100, 100, 300, 200, 1440, 900, 24)).toBe(1);
  });
  it('is full for a surface flush with the picture edge (a header at the top of the viewport)', () => {
    expect(sceneCoverage(0, 0, 1440, 56, 1440, 900, 3)).toBe(1);
    expect(sceneCoverage(0, 844, 1440, 56, 1440, 900, 3)).toBe(1);
  });
  it('fades as the region slides off an edge, and is zero once fully gone', () => {
    const a = sceneCoverage(100, 710, 300, 200, 1440, 900, 24);
    const b = sceneCoverage(100, 730, 300, 200, 1440, 900, 24);
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
    expect(sceneCoverage(100, 2000, 300, 200, 1440, 900, 24)).toBe(0);
    expect(sceneCoverage(-1000, 100, 300, 200, 1440, 900, 24)).toBe(0);
  });
});

describe('ripples and light', () => {
  it('a tap is strongest at the finger, falls off smoothly, and has a finite reach', () => {
    expect(rippleAmplitude(0)).toBe(1);
    expect(rippleAmplitude(120)).toBeGreaterThan(rippleAmplitude(400));
    expect(rippleAmplitude(RIPPLE_REACH)).toBe(0);
    expect(rippleAmplitude(0, 0.8)).toBeCloseTo(0.8, 9);
  });
  it('the cursor light is full at the surface, eases out, and is off past its reach', () => {
    expect(lightTarget(0)).toBe(1);
    expect(lightTarget(LIGHT_REACH / 2)).toBeCloseTo(0.5, 5);
    expect(lightTarget(LIGHT_REACH)).toBe(0);
    let last = 1;
    for (let d = 0; d <= LIGHT_REACH; d += 20) {
      const v = lightTarget(d);
      expect(v).toBeLessThanOrEqual(last + 1e-9);
      last = v;
    }
  });
  it('approach is frame-rate independent and lands exactly', () => {
    let a = 0;
    for (let i = 0; i < 6; i++) a = approach(a, 1, 12, 1 / 60);
    let b = 0;
    for (let i = 0; i < 3; i++) b = approach(b, 1, 12, 1 / 30);
    expect(a).toBeCloseTo(b, 6);
    let c = 0;
    for (let i = 0; i < 400; i++) c = approach(c, 1, 12, 1 / 60);
    expect(c).toBe(1);
  });
});

describe('inner radius', () => {
  it('subtracts the border, clamps to a pill, and understands percentages', () => {
    expect(innerRadius('22px', 1, 300, 200)).toBe(21);
    expect(innerRadius('999px', 1, 300, 60)).toBe(30);
    expect(innerRadius('50%', 0, 100, 100)).toBe(50);
    expect(innerRadius('0px', 1, 100, 100)).toBe(0);
    expect(innerRadius('', 0, 100, 100)).toBe(0);
  });
});
