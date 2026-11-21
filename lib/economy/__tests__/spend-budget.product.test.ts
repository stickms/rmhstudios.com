import { describe, expect, it } from 'vitest';
import { LOOSENING_DELAY_MS } from '@/lib/economy/play-limits';
import {
  NO_BUDGET,
  SPEND_TYPES,
  applySpendBudgetChange,
  countsAsSpending,
  crossesNotice,
  effectiveSpendCap,
  hasSpendBudgetChange,
  monthBounds,
  monthKey,
  remainingBudget,
  wouldExceed,
  type SpendBudget,
} from '@/lib/economy/spend-budget';

const NOW = new Date('2026-11-21T14:05:00.000Z');
const row = (over: Partial<SpendBudget>): SpendBudget => ({ ...NO_BUDGET, ...over });

describe('month bounds', () => {
  it('is the UTC calendar month, start inclusive and end exclusive', () => {
    const { start, end } = monthBounds(new Date('2026-11-21T14:05:00Z'));
    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('rolls the year at the end of December', () => {
    const { start, end } = monthBounds(new Date('2026-12-31T23:59:59.999Z'));
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(monthKey(new Date('2026-12-31T23:59:59.999Z'))).toBe('2026-12');
  });

  it('starts January at the first millisecond of the year', () => {
    const now = new Date('2027-01-01T00:00:00.000Z');
    expect(monthKey(now)).toBe('2027-01');
    expect(monthBounds(now).start.getTime()).toBe(now.getTime());
    expect(monthBounds(new Date('2026-12-31T23:59:59.999Z')).end.getTime()).toBe(now.getTime());
  });

  it('knows February in a leap year and in a common year', () => {
    expect(monthBounds(new Date('2028-02-29T12:00:00Z')).end.toISOString()).toBe('2028-03-01T00:00:00.000Z');
    expect(monthBounds(new Date('2027-02-28T12:00:00Z')).end.toISOString()).toBe('2027-03-01T00:00:00.000Z');
  });

  it('pads single-digit months', () => {
    expect(monthKey(new Date('2026-03-05T00:00:00Z'))).toBe('2026-03');
  });
});

describe('which types count', () => {
  it('counts the five spend types', () => {
    expect([...SPEND_TYPES].sort()).toEqual(['GIFT', 'MARKET', 'MEMBERSHIP', 'PURCHASE', 'TIP']);
    for (const t of SPEND_TYPES) expect(countsAsSpending(t)).toBe(true);
  });

  it('never counts wagers, admin adjustments or rewards', () => {
    for (const t of ['WAGER', 'ADMIN', 'REWARD', '']) expect(countsAsSpending(t)).toBe(false);
  });
});

describe('effective cap', () => {
  it('is null with no budget', () => {
    expect(effectiveSpendCap(NO_BUDGET, NOW)).toBeNull();
  });

  it('keeps the stored cap while a change is still waiting', () => {
    const b = row({
      monthlySpendCap: 1000,
      pendingSpendCap: 5000,
      pendingSpendCapAt: new Date(NOW.getTime() + 1),
    });
    expect(effectiveSpendCap(b, NOW)).toBe(1000);
  });

  it('uses a matured pending change before any write has folded it in', () => {
    const b = row({
      monthlySpendCap: 1000,
      pendingSpendCap: 5000,
      pendingSpendCapAt: new Date(NOW.getTime()),
    });
    expect(effectiveSpendCap(b, NOW)).toBe(5000);
  });

  it('treats a matured pending null as the budget being removed', () => {
    const b = row({
      monthlySpendCap: 1000,
      pendingSpendCap: null,
      pendingSpendCapAt: new Date(NOW.getTime() - 1000),
    });
    expect(effectiveSpendCap(b, NOW)).toBeNull();
  });
});

describe('changing the budget', () => {
  it('applies a first budget at once', () => {
    const { next, deferredUntil } = applySpendBudgetChange(NO_BUDGET, { monthlySpendCap: 2000 }, NOW);
    expect(next.monthlySpendCap).toBe(2000);
    expect(next.pendingSpendCapAt).toBeNull();
    expect(deferredUntil).toBeNull();
  });

  it('applies a cut at once and cancels a raise already waiting', () => {
    const current = row({
      monthlySpendCap: 2000,
      pendingSpendCap: 9000,
      pendingSpendCapAt: new Date(NOW.getTime() + 1000),
    });
    const { next, deferredUntil } = applySpendBudgetChange(current, { monthlySpendCap: 1500 }, NOW);
    expect(next).toMatchObject({
      monthlySpendCap: 1500,
      pendingSpendCap: null,
      pendingSpendCapAt: null,
    });
    expect(deferredUntil).toBeNull();
  });

  it('parks a raise for 24 hours and leaves the live cap alone', () => {
    const { next, deferredUntil } = applySpendBudgetChange(
      row({ monthlySpendCap: 2000 }),
      { monthlySpendCap: 5000 },
      NOW,
    );
    expect(next.monthlySpendCap).toBe(2000);
    expect(next.pendingSpendCap).toBe(5000);
    expect(deferredUntil?.getTime()).toBe(NOW.getTime() + LOOSENING_DELAY_MS);
    expect(next.pendingSpendCapAt?.getTime()).toBe(NOW.getTime() + LOOSENING_DELAY_MS);
  });

  it('parks removal as a pending null', () => {
    const { next } = applySpendBudgetChange(row({ monthlySpendCap: 2000 }), { monthlySpendCap: null }, NOW);
    expect(next.monthlySpendCap).toBe(2000);
    expect(next.pendingSpendCap).toBeNull();
    expect(next.pendingSpendCapAt).not.toBeNull();
  });

  it('does not ladder: a second raise replaces the first and restarts nothing earlier', () => {
    const first = applySpendBudgetChange(row({ monthlySpendCap: 2000 }), { monthlySpendCap: 3000 }, NOW);
    const later = new Date(NOW.getTime() + 3600_000);
    const second = applySpendBudgetChange(first.next, { monthlySpendCap: 4000 }, later);
    expect(second.next.pendingSpendCap).toBe(4000);
    expect(second.next.pendingSpendCapAt?.getTime()).toBe(later.getTime() + LOOSENING_DELAY_MS);
  });

  it('folds in a matured pending change before applying the next edit', () => {
    const current = row({
      monthlySpendCap: 1000,
      pendingSpendCap: 5000,
      pendingSpendCapAt: new Date(NOW.getTime() - 1),
    });
    // 3000 is a cut from the live 5000, so it applies now.
    const { next } = applySpendBudgetChange(current, { monthlySpendCap: 3000 }, NOW);
    expect(next.monthlySpendCap).toBe(3000);
    expect(next.pendingSpendCapAt).toBeNull();
  });

  it('cancels a waiting change without touching the live cap', () => {
    const current = row({
      monthlySpendCap: 2000,
      pendingSpendCap: 5000,
      pendingSpendCapAt: new Date(NOW.getTime() + 1000),
    });
    const { next } = applySpendBudgetChange(current, { cancelPendingSpendCap: true }, NOW);
    expect(next).toMatchObject({ monthlySpendCap: 2000, pendingSpendCap: null, pendingSpendCapAt: null });
  });

  it('keeps the notice month through a change', () => {
    const { next } = applySpendBudgetChange(
      row({ monthlySpendCap: 2000, spendNoticeMonth: '2026-11' }),
      { monthlySpendCap: 1000 },
      NOW,
    );
    expect(next.spendNoticeMonth).toBe('2026-11');
  });

  it('knows whether a request asks for anything', () => {
    expect(hasSpendBudgetChange({})).toBe(false);
    expect(hasSpendBudgetChange({ monthlySpendCap: null })).toBe(true);
    expect(hasSpendBudgetChange({ cancelPendingSpendCap: true })).toBe(true);
  });
});

describe('the cap and the 80% line', () => {
  it('allows spending exactly up to the cap and refuses one coin more', () => {
    expect(wouldExceed(1000, 900, 100)).toBe(false);
    expect(wouldExceed(1000, 900, 101)).toBe(true);
    expect(remainingBudget(1000, 900)).toBe(100);
    expect(remainingBudget(1000, 1200)).toBe(0);
  });

  it('crosses 80% on the spend that reaches it, not before and not after', () => {
    expect(crossesNotice(1000, 700, 99)).toBe(false);
    expect(crossesNotice(1000, 700, 100)).toBe(true);
    expect(crossesNotice(1000, 800, 10)).toBe(false);
    expect(crossesNotice(1000, 0, 1000)).toBe(true);
  });

  it('does not round the line on an odd cap', () => {
    // 80% of 101 is 80.8: 80 is below it, 81 is at or above it.
    expect(crossesNotice(101, 79, 1)).toBe(false);
    expect(crossesNotice(101, 79, 2)).toBe(true);
  });
});
