import { describe, expect, it } from 'vitest';
import {
  ADJUSTMENT_CONFIRM_ABOVE,
  ADJUSTMENT_MAX,
  ADJUSTMENT_REASONS,
  adjustmentLedgerKey,
  confirmationSatisfied,
  isAdjustmentReason,
  isValidAmount,
  ledgerNote,
  noteSatisfied,
  notificationPreview,
  requiresConfirmation,
  reversalLedgerKey,
  signedDelta,
} from '@/lib/economy/adjustments';
import { adjustBody } from '@/lib/economy/adjustments-schema';

const body = { direction: 'add', amount: 500, reason: 'goodwill', key: 'abcdefgh-1234' };

describe('amount limits', () => {
  it('accepts whole numbers from 1 to the maximum only', () => {
    expect(isValidAmount(1)).toBe(true);
    expect(isValidAmount(ADJUSTMENT_MAX)).toBe(true);
    for (const bad of [0, -5, 1.5, ADJUSTMENT_MAX + 1, Number.NaN, Infinity]) {
      expect(isValidAmount(bad)).toBe(false);
    }
  });
});

describe('sign handling', () => {
  it('add is positive and remove is negative', () => {
    expect(signedDelta('add', 500)).toBe(500);
    expect(signedDelta('remove', 500)).toBe(-500);
  });

  it('writes the sign and the reason into the member’s notification', () => {
    expect(notificationPreview(500, 'goodwill')).toBe('RMH Studios added 500 coins: goodwill');
    expect(notificationPreview(-1500, 'exploit_clawback')).toBe(
      'RMH Studios removed 1,500 coins: exploit clawback',
    );
  });

  it('labels the statement row from the reason', () => {
    expect(ledgerNote('goodwill')).toBe('Adjustment · goodwill');
    expect(ledgerNote('exploit_clawback')).toBe('Adjustment · exploit clawback');
  });
});

describe('confirmation threshold', () => {
  it('is required only above 100,000', () => {
    expect(requiresConfirmation(ADJUSTMENT_CONFIRM_ABOVE)).toBe(false);
    expect(requiresConfirmation(ADJUSTMENT_CONFIRM_ABOVE + 1)).toBe(true);
  });

  it('is satisfied only by the same amount typed again', () => {
    expect(confirmationSatisfied(500, undefined)).toBe(true);
    expect(confirmationSatisfied(100_001, undefined)).toBe(false);
    expect(confirmationSatisfied(100_001, 100_000)).toBe(false);
    expect(confirmationSatisfied(100_001, 100_001)).toBe(true);
  });
});

describe('reasons and notes', () => {
  it('offers the four admin reasons and knows reversal as a stored one', () => {
    expect([...ADJUSTMENT_REASONS]).toEqual(['correction', 'goodwill', 'compensation', 'exploit_clawback']);
    expect(isAdjustmentReason('reversal')).toBe(true);
    expect(isAdjustmentReason('bonus')).toBe(false);
  });

  it('requires a note for a correction only', () => {
    expect(noteSatisfied('correction', undefined)).toBe(false);
    expect(noteSatisfied('correction', '   ')).toBe(false);
    expect(noteSatisfied('correction', 'refund')).toBe(true);
    expect(noteSatisfied('goodwill', undefined)).toBe(true);
  });
});

describe('idempotency keys', () => {
  it('namespaces the client key and keeps one key per reversed adjustment', () => {
    expect(adjustmentLedgerKey('abc')).toBe('coin-adjustment:abc');
    expect(reversalLedgerKey('adj1')).toBe('coin-adjustment-reversal:adj1');
  });
});

describe('request body', () => {
  it('accepts a valid adjustment', () => {
    expect(adjustBody.safeParse(body).success).toBe(true);
  });

  it('rejects bad amounts, reasons, notes and keys', () => {
    for (const bad of [
      { ...body, amount: 0 },
      { ...body, amount: 2.5 },
      { ...body, amount: ADJUSTMENT_MAX + 1 },
      { ...body, reason: 'reversal' },
      { ...body, reason: 'correction' },
      { ...body, note: 'x'.repeat(281) },
      { ...body, key: 'short' },
      { ...body, key: 'has spaces in it!' },
    ]) {
      expect(adjustBody.safeParse(bad).success).toBe(false);
    }
  });

  it('needs the amount typed again above the threshold', () => {
    const big = { ...body, amount: 100_001 };
    expect(adjustBody.safeParse(big).success).toBe(false);
    expect(adjustBody.safeParse({ ...big, confirmAmount: 100_001 }).success).toBe(true);
  });
});
