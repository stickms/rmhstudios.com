import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MOTION_BOUNDS } from '../../tiers';
import { NUDGE, createArcNudge, nudgeOffset, shouldVibrate } from '../nudge';
import { FakeEl, fakeEnv, type FakeEnv } from './arc-dom';

describe('nudge offset (pure)', () => {
  it('pushes inward along the strike normal, at most the nudge bound, scaled by energy and calm', () => {
    const o = nudgeOffset(1, 0, 1, 1);
    expect(o.x).toBeCloseTo(-MOTION_BOUNDS.nudgePx); // outward normal +x → pushed in, −x
    expect(o.y).toBeCloseTo(0);
    for (const [nx, ny, e, s] of [
      [0.6, 0.8, 1, 1],
      [3, 4, 9, 9],
      [0, -1, 0.5, 0.6],
    ]) {
      const v = nudgeOffset(nx, ny, e, s);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(MOTION_BOUNDS.nudgePx + 1e-9);
    }
    expect(Math.hypot(...Object.values(nudgeOffset(0, -1, 1, 0.5)))).toBeCloseTo(
      MOTION_BOUNDS.nudgePx * 0.5,
    );
    expect(nudgeOffset(0, 0, 1, 1)).toEqual({ x: 0, y: 0 });
    expect(MOTION_BOUNDS.nudgePx).toBeLessThanOrEqual(MOTION_BOUNDS.maxEdgeTravelPx);
  });

  it('vibrates only on a touch-only device that can, never while still or off, and not twice in a burst', () => {
    const base = {
      fine: false,
      motion: 'lively' as const,
      arcsOn: true,
      now: 1000,
      last: -Infinity,
      canVibrate: true,
    };
    expect(shouldVibrate(base)).toBe(true);
    expect(shouldVibrate({ ...base, fine: true })).toBe(false);
    expect(shouldVibrate({ ...base, motion: 'still' })).toBe(false);
    expect(shouldVibrate({ ...base, arcsOn: false })).toBe(false);
    expect(shouldVibrate({ ...base, canVibrate: false })).toBe(false);
    expect(shouldVibrate({ ...base, last: 1000 - NUDGE.vibrateGapMs + 1 })).toBe(false);
    expect(shouldVibrate({ ...base, last: 1000 - NUDGE.vibrateGapMs })).toBe(true);
  });
});

describe('arc nudge on the struck hosts', () => {
  let env: FakeEnv;
  beforeEach(() => {
    vi.useFakeTimers();
    env = fakeEnv();
  });
  afterEach(() => vi.useRealTimers());

  it('kicks, settles on the release spring, and then removes every trace', () => {
    const n = createArcNudge(env.doc);
    const el = new FakeEl('div', { left: 0, top: 0, width: 100, height: 40 }, true);
    expect(n.kick(el as unknown as Element, 1, 0, 1, 1)).toBe(true);
    expect(el.getAttribute(NUDGE.attr)).toBe('kick');
    expect(el.style['--jelly-arc-nudge-x']).toBe('-1.5px');
    vi.advanceTimersByTime(NUDGE.kickMs);
    expect(el.getAttribute(NUDGE.attr)).toBe('settle');
    expect(el.style['--jelly-arc-nudge-x']).toBe('0px');
    vi.advanceTimersByTime(NUDGE.settleMs);
    expect(el.getAttribute(NUDGE.attr)).toBeNull();
    expect(el.style['--jelly-arc-nudge-x']).toBeUndefined();
    expect(el.style['--jelly-arc-nudge-y']).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never nudges a host under the pointer or pressed (its own squash already uses the bound)', () => {
    const n = createArcNudge(env.doc);
    const el = new FakeEl('button', { left: 0, top: 0, width: 80, height: 32 }, true);
    el.matches = ((sel: string) => sel.includes(':active')) as never;
    expect(n.kick(el as unknown as Element, 1, 0, 1, 1)).toBe(false);
    expect(el.getAttribute(NUDGE.attr)).toBeNull();
  });

  it('teardown clears the properties and every timer at once', () => {
    const n = createArcNudge(env.doc);
    const els = [0, 1].map(
      () => new FakeEl('div', { left: 0, top: 0, width: 100, height: 40 }, true),
    );
    for (const el of els) n.kick(el as unknown as Element, 0, 1, 1, 1);
    n.clear();
    for (const el of els) {
      expect(el.getAttribute(NUDGE.attr)).toBeNull();
      expect(el.style['--jelly-arc-nudge-y']).toBeUndefined();
    }
    expect(vi.getTimerCount()).toBe(0);
  });
});
