// @vitest-environment node
/**
 * "Engaged" means engaged WITH THE GLOBE (Task 10, 2026-11-08): the pointer over or near the globe or its dock, a
 * press / drag / hold on it, or keyboard focus inside the dock or the open hub, plus a short settle after any of those.
 * Input anywhere else on the page no longer raises the globe's ambient rate. The page's frame loop and the worker's
 * coat clock both decide the rate with `engagedRate`, so the two can never disagree.
 */
import { describe, expect, it } from 'vitest';
import {
  GLOBE_NEAR_MARGIN_PX,
  GLOBE_SETTLE_MS,
  GlobeEngagement,
  engagedRate,
  isDirectlyEngaged,
  msToSettleEnd,
  pointerNear,
} from '../globe-engagement';

const DOCK = { left: 36, top: 84, right: 372, bottom: 884 };
const rate = (engaged: boolean, engagedUntil: number, now: number, over: object = {}) =>
  engagedRate({ hz: 60, idleHz: 30, active: true, engaged, engagedUntil, ...over }, now);

describe('pointerNear: over or within a small margin of the dock', () => {
  it('over the dock is near', () => {
    expect(pointerNear(200, 480, DOCK)).toBe(true);
    expect(pointerNear(DOCK.left, DOCK.top, DOCK)).toBe(true);
  });

  it('just outside, within the margin, is near', () => {
    expect(pointerNear(DOCK.right + GLOBE_NEAR_MARGIN_PX - 1, 480, DOCK)).toBe(true);
    expect(pointerNear(200, DOCK.top - GLOBE_NEAR_MARGIN_PX + 1, DOCK)).toBe(true);
  });

  it('far away (the page cards) is not near', () => {
    expect(pointerNear(DOCK.right + GLOBE_NEAR_MARGIN_PX + 1, 480, DOCK)).toBe(false);
    expect(pointerNear(900, 300, DOCK)).toBe(false);
    expect(pointerNear(200, DOCK.bottom + 200, DOCK)).toBe(false);
  });

  it('no measured box is never near (nothing to be near to)', () => {
    expect(pointerNear(200, 480, null)).toBe(false);
  });

  it('keeps the margin small: an inch or so, not a column of the page', () => {
    expect(GLOBE_NEAR_MARGIN_PX).toBeGreaterThan(0);
    expect(GLOBE_NEAR_MARGIN_PX).toBeLessThanOrEqual(48);
  });
});

describe('isDirectlyEngaged', () => {
  it('is engaged by a pointer near, a press/drag/hold, or keyboard focus — and by nothing else', () => {
    expect(isDirectlyEngaged({ near: true, pressed: false, focused: false })).toBe(true);
    expect(isDirectlyEngaged({ near: false, pressed: true, focused: false })).toBe(true);
    expect(isDirectlyEngaged({ near: false, pressed: false, focused: true })).toBe(true);
    expect(isDirectlyEngaged({ near: false, pressed: false, focused: false })).toBe(false);
  });
});

describe('GlobeEngagement: edge-triggered, with a short settle', () => {
  it('starts idle: a fresh page is not "someone at the globe"', () => {
    const e = new GlobeEngagement();
    expect(e.isEngaged(0)).toBe(false);
    expect(e.isEngaged(5000)).toBe(false);
  });

  it('reports only edges, so a pointer moving over the globe is not a message per move', () => {
    const e = new GlobeEngagement();
    expect(e.update(100, true)).toBe(true);
    expect(e.update(116, true)).toBe(false);
    expect(e.update(132, true)).toBe(false);
    expect(e.engaged).toBe(true);
    expect(e.settleUntil).toBe(0);
    expect(e.update(200, false)).toBe(true);
    expect(e.update(216, false)).toBe(false);
  });

  it('holds the engaged rate for the settle after a release, then drops to the idle floor', () => {
    const e = new GlobeEngagement();
    e.update(1000, true);
    e.update(2000, false);
    expect(e.settleUntil).toBe(2000 + GLOBE_SETTLE_MS);
    expect(e.isEngaged(2000 + GLOBE_SETTLE_MS - 1)).toBe(true);
    expect(e.isEngaged(2000 + GLOBE_SETTLE_MS)).toBe(false);
  });

  it('settles for about a second and a half, not the old 20 s window', () => {
    expect(GLOBE_SETTLE_MS).toBeGreaterThanOrEqual(1000);
    expect(GLOBE_SETTLE_MS).toBeLessThanOrEqual(2500);
  });

  it('a new engagement during the settle cancels it', () => {
    const e = new GlobeEngagement();
    e.update(0, true);
    e.update(100, false);
    expect(e.update(200, true)).toBe(true);
    expect(e.settleUntil).toBe(0);
    expect(e.isEngaged(100 + GLOBE_SETTLE_MS + 10)).toBe(true);
  });
});

describe('engagedRate: the one rule the page loop and the worker share', () => {
  it('over / near / dragging / focused (engaged): the engaged rate', () => {
    expect(rate(true, 0, 10_000)).toBe(60);
  });

  it('far from the globe: the idle floor — nothing freezes', () => {
    expect(rate(false, 0, 10_000)).toBe(30);
  });

  it('inside the settle: still the engaged rate; after it: the idle floor', () => {
    expect(rate(false, 5000, 4999)).toBe(60);
    expect(rate(false, 5000, 5000)).toBe(30);
  });

  it('still (hz 0): nothing, engaged or not', () => {
    expect(rate(true, 0, 0, { hz: 0, idleHz: 0 })).toBe(0);
    expect(rate(false, 0, 0, { hz: 0, idleHz: 0 })).toBe(0);
  });

  it('hidden, unfocused or off screen (inactive): nothing, engaged or not', () => {
    expect(rate(true, 0, 0, { active: false })).toBe(0);
    expect(rate(false, 9e9, 0, { active: false })).toBe(0);
  });
});

describe('msToSettleEnd', () => {
  it('is the time left in a settle, so a sleeping loop wakes for the idle grid after it', () => {
    expect(msToSettleEnd({ active: true, engaged: false, engagedUntil: 5000 }, 4000)).toBe(1001);
  });

  it('is Infinity while engaged, after the settle, or when inactive', () => {
    expect(msToSettleEnd({ active: true, engaged: true, engagedUntil: 0 }, 4000)).toBe(Infinity);
    expect(msToSettleEnd({ active: true, engaged: false, engagedUntil: 3000 }, 4000)).toBe(
      Infinity,
    );
    expect(msToSettleEnd({ active: false, engaged: false, engagedUntil: 5000 }, 4000)).toBe(
      Infinity,
    );
  });
});
