import { describe, it, expect } from 'vitest';

/**
 * Responsible play (W8).
 *
 * The rule under test is the asymmetry, because it is the only thing that makes
 * a self-imposed limit different from a preference: tightening lands now,
 * loosening waits a day, and a self-exclusion is the one control on the site
 * with no undo. Every case below is a way a member could otherwise talk the
 * site out of a decision they already made.
 *
 * `applyChange` is pure and takes `now`, so none of this needs a clock, a
 * database or a fake timer.
 */

import {
  LOOSENING_DELAY_MS,
  NO_LIMITS,
  applyChange,
  blockedBy,
  dayWindowStart,
  effectiveCap,
  hasMaturedPending,
  hidesRiskSurfaces,
  isLoosening,
  type PlayLimits,
} from '@/lib/economy/play-limits';

const NOW = new Date('2026-09-19T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function limits(over: Partial<PlayLimits> = {}): PlayLimits {
  return { ...NO_LIMITS, ...over };
}

describe('isLoosening — null is the loosest value there is', () => {
  it('treats removing a cap as loosening', () => {
    expect(isLoosening(500, null)).toBe(true);
  });

  it('treats adding a cap where there was none as tightening', () => {
    expect(isLoosening(null, 500)).toBe(false);
  });

  it('compares numbers the obvious way', () => {
    expect(isLoosening(500, 900)).toBe(true);
    expect(isLoosening(500, 100)).toBe(false);
    expect(isLoosening(500, 500)).toBe(false);
  });

  it('is not loosening when there was no cap and still is none', () => {
    expect(isLoosening(null, null)).toBe(false);
  });
});

describe('applyChange — tightening is immediate', () => {
  it('applies a first cap on the spot', () => {
    const { next, deferred } = applyChange(limits(), { dailyCoinCap: 500 }, NOW);
    expect(next.dailyCoinCap).toBe(500);
    expect(next.pendingCapAt).toBeNull();
    expect(deferred).toBe(false);
  });

  it('applies a lower cap on the spot', () => {
    const { next, deferred } = applyChange(limits({ dailyCoinCap: 500 }), { dailyCoinCap: 100 }, NOW);
    expect(next.dailyCoinCap).toBe(100);
    expect(deferred).toBe(false);
  });

  it('cancels a loosening already in flight', () => {
    // Otherwise yesterday's "raise it to 5000" would mature and quietly undo
    // today's "actually, 100" — the exact failure the delay exists to prevent.
    const current = limits({
      dailyCoinCap: 500,
      pendingCap: 5000,
      pendingCapAt: new Date(NOW.getTime() + DAY / 2),
    });
    const { next } = applyChange(current, { dailyCoinCap: 100 }, NOW);
    expect(next.dailyCoinCap).toBe(100);
    expect(next.pendingCap).toBeNull();
    expect(next.pendingCapAt).toBeNull();
  });
});

describe('applyChange — loosening waits', () => {
  it('parks a higher cap instead of applying it', () => {
    const { next, deferred, deferredUntil } = applyChange(
      limits({ dailyCoinCap: 500 }),
      { dailyCoinCap: 5000 },
      NOW,
    );
    expect(next.dailyCoinCap).toBe(500);
    expect(next.pendingCap).toBe(5000);
    expect(next.pendingCapAt?.getTime()).toBe(NOW.getTime() + LOOSENING_DELAY_MS);
    expect(deferred).toBe(true);
    expect(deferredUntil?.getTime()).toBe(NOW.getTime() + LOOSENING_DELAY_MS);
  });

  it('parks the removal of a cap', () => {
    const { next, deferred } = applyChange(limits({ dailyCoinCap: 500 }), { dailyCoinCap: null }, NOW);
    expect(next.dailyCoinCap).toBe(500);
    expect(next.pendingCap).toBeNull();
    expect(next.pendingCapAt).not.toBeNull();
    expect(deferred).toBe(true);
  });

  it('cannot be laddered by sending the request repeatedly', () => {
    // Three "raise it" requests a minute apart must not produce a change that
    // lands a minute from now; each one replaces the last and restarts the wait.
    let current = limits({ dailyCoinCap: 500 });
    let at = NOW;
    for (let i = 0; i < 3; i++) {
      at = new Date(at.getTime() + 60_000);
      current = applyChange(current, { dailyCoinCap: 5000 }, at).next;
    }
    expect(current.dailyCoinCap).toBe(500);
    expect(current.pendingCapAt?.getTime()).toBe(at.getTime() + LOOSENING_DELAY_MS);
  });
});

describe('effectiveCap — a matured change is in force before it is written', () => {
  it('uses the pending value once its time has passed', () => {
    const l = limits({ dailyCoinCap: 500, pendingCap: 5000, pendingCapAt: new Date(NOW.getTime() - 1) });
    expect(effectiveCap(l, NOW)).toBe(5000);
    expect(hasMaturedPending(l, NOW)).toBe(true);
  });

  it('keeps the stored value until then', () => {
    const l = limits({ dailyCoinCap: 500, pendingCap: 5000, pendingCapAt: new Date(NOW.getTime() + 1) });
    expect(effectiveCap(l, NOW)).toBe(500);
    expect(hasMaturedPending(l, NOW)).toBe(false);
  });

  it('honours a matured removal as "no cap"', () => {
    const l = limits({ dailyCoinCap: 500, pendingCap: null, pendingCapAt: new Date(NOW.getTime() - 1) });
    expect(effectiveCap(l, NOW)).toBeNull();
  });

  it('folds a matured change in rather than resurrecting it on the next edit', () => {
    const current = limits({
      dailyCoinCap: 500,
      pendingCap: 5000,
      pendingCapAt: new Date(NOW.getTime() - 1),
    });
    // 6000 is a loosening against the MATURED 5000, so it parks.
    const { next } = applyChange(current, { dailyCoinCap: 6000 }, NOW);
    expect(next.dailyCoinCap).toBe(5000);
    expect(next.pendingCap).toBe(6000);
  });
});

describe('applyChange — an exclusion only ever extends', () => {
  it('ignores a request that would shorten a live exclusion', () => {
    const until = new Date(NOW.getTime() + 30 * DAY);
    const { next } = applyChange(limits({ selfExcludedUntil: until }), { excludeForDays: 1 }, NOW);
    expect(next.selfExcludedUntil?.getTime()).toBe(until.getTime());
  });

  it('accepts one that extends it', () => {
    const until = new Date(NOW.getTime() + 1 * DAY);
    const { next } = applyChange(limits({ selfExcludedUntil: until }), { excludeForDays: 30 }, NOW);
    expect(next.selfExcludedUntil?.getTime()).toBe(NOW.getTime() + 30 * DAY);
  });

  it('applies the same rule to a cool-off', () => {
    const until = new Date(NOW.getTime() + 7 * DAY);
    expect(
      applyChange(limits({ coolOffUntil: until }), { coolOffForDays: 1 }, NOW).next.coolOffUntil?.getTime(),
    ).toBe(until.getTime());
  });

  it('never defers an exclusion — protection is the thing that lands now', () => {
    const { deferred } = applyChange(limits(), { excludeForDays: 7 }, NOW);
    expect(deferred).toBe(false);
  });
});

describe('blockedBy', () => {
  it('reports nothing for an unrestricted member', () => {
    expect(blockedBy(limits(), NOW)).toBeNull();
  });

  it('reports exclusion ahead of cool-off when both are live', () => {
    const l = limits({
      selfExcludedUntil: new Date(NOW.getTime() + DAY),
      coolOffUntil: new Date(NOW.getTime() + DAY),
    });
    expect(blockedBy(l, NOW)).toBe('SELF_EXCLUDED');
  });

  it('stops blocking the instant the window passes', () => {
    expect(blockedBy(limits({ coolOffUntil: new Date(NOW.getTime() - 1) }), NOW)).toBeNull();
  });

  it('hides the risk surfaces for an exclusion but not for a cool-off', () => {
    expect(hidesRiskSurfaces(limits({ selfExcludedUntil: new Date(NOW.getTime() + DAY) }), NOW)).toBe(true);
    expect(hidesRiskSurfaces(limits({ coolOffUntil: new Date(NOW.getTime() + DAY) }), NOW)).toBe(false);
  });
});

describe('dayWindowStart', () => {
  it('is midnight UTC of the current day', () => {
    expect(dayWindowStart(new Date('2026-09-19T23:59:59.999Z')).toISOString()).toBe(
      '2026-09-19T00:00:00.000Z',
    );
    expect(dayWindowStart(new Date('2026-09-19T00:00:00.000Z')).toISOString()).toBe(
      '2026-09-19T00:00:00.000Z',
    );
  });
});
