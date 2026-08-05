import { describe, expect, it } from 'vitest';
import {
  MIN_CONTACTS_TO_START,
  RECOVERY_HOLD_MS,
  RECOVERY_MIN_DELAY_MS,
  RECOVERY_WINDOW_MS,
  REQUIRED_APPROVALS,
  applyApproval,
  canApprove,
  evaluateRecoveryRequest,
  formatRecoveryCode,
  isRedeemable,
  isWellFormedRecoveryCode,
  maskEmail,
  normalizeRecoveryCode,
  recoveryExpiryFrom,
  recoveryUnlockFrom,
  type RecoveryRequestState,
} from '@/lib/recovery/policy';

/**
 * I3's controls are timing and quorum. Everything below is a rule that, if it
 * quietly stopped holding, would turn recovery from a way back into an account
 * into a way into somebody else's.
 */

const HOUR = 60 * 60 * 1000;
const T0 = new Date('2026-08-04T00:00:00.000Z');
const at = (hours: number) => new Date(T0.getTime() + hours * HOUR);

function request(overrides: Partial<RecoveryRequestState & { userId: string }> = {}) {
  return {
    userId: 'owner',
    status: 'PENDING',
    approvals: 0,
    approvedBy: [] as string[],
    createdAt: T0,
    expiresAt: recoveryExpiryFrom(T0),
    ...overrides,
  };
}

describe('recovery timing constants', () => {
  it('is a 72-hour window with a 24-hour mandatory delay inside it', () => {
    expect(RECOVERY_WINDOW_MS).toBe(72 * HOUR);
    expect(RECOVERY_MIN_DELAY_MS).toBe(24 * HOUR);
    expect(RECOVERY_MIN_DELAY_MS).toBeLessThan(RECOVERY_WINDOW_MS);
  });

  it('holds the economy for 72 hours after a completed recovery', () => {
    expect(RECOVERY_HOLD_MS).toBe(72 * HOUR);
  });

  it('needs two of three, and refuses to start below quorum', () => {
    expect(REQUIRED_APPROVALS).toBe(2);
    expect(MIN_CONTACTS_TO_START).toBe(REQUIRED_APPROVALS);
  });

  it('derives expiry and unlock from the creation time', () => {
    expect(recoveryExpiryFrom(T0).toISOString()).toBe(at(72).toISOString());
    expect(recoveryUnlockFrom(T0).toISOString()).toBe(at(24).toISOString());
  });
});

describe('evaluateRecoveryRequest', () => {
  it('collects while below quorum, however long it waits', () => {
    const evaluation = evaluateRecoveryRequest(request({ approvals: 1 }), at(48));
    expect(evaluation.phase).toBe('collecting');
    expect(evaluation.approvalsNeeded).toBe(1);
    expect(evaluation.redeemable).toBe(false);
  });

  it('waits out the mandatory delay even at full quorum', () => {
    const approved = request({ approvals: 2, status: 'APPROVED' });
    expect(evaluateRecoveryRequest(approved, at(0.01)).phase).toBe('waiting');
    expect(evaluateRecoveryRequest(approved, at(23.99)).phase).toBe('waiting');
    expect(isRedeemable(approved, at(23.99))).toBe(false);
  });

  it('becomes redeemable exactly at the 24-hour mark', () => {
    const approved = request({ approvals: 2, status: 'APPROVED' });
    expect(evaluateRecoveryRequest(approved, at(24)).phase).toBe('ready');
    expect(isRedeemable(approved, at(24))).toBe(true);
    expect(isRedeemable(approved, at(71.99))).toBe(true);
  });

  it('expires at 72 hours, approved or not', () => {
    const approved = request({ approvals: 2, status: 'APPROVED' });
    expect(evaluateRecoveryRequest(approved, at(72)).phase).toBe('expired');
    expect(isRedeemable(approved, at(72))).toBe(false);
    expect(isRedeemable(approved, at(100))).toBe(false);
    expect(evaluateRecoveryRequest(request(), at(73)).phase).toBe('expired');
  });

  it('never reopens a used or rejected request', () => {
    const used = request({ approvals: 2, status: 'USED' });
    expect(evaluateRecoveryRequest(used, at(30)).phase).toBe('used');
    expect(isRedeemable(used, at(30))).toBe(false);

    const rejected = request({ approvals: 2, status: 'REJECTED' });
    expect(evaluateRecoveryRequest(rejected, at(30)).phase).toBe('rejected');
    expect(isRedeemable(rejected, at(30))).toBe(false);
  });

  it('keeps a terminal status after the window closes', () => {
    expect(evaluateRecoveryRequest(request({ status: 'USED' }), at(999)).phase).toBe('used');
  });

  it('honours an explicitly EXPIRED status before the clock', () => {
    expect(evaluateRecoveryRequest(request({ status: 'EXPIRED' }), at(1)).phase).toBe('expired');
  });
});

describe('canApprove', () => {
  const contact = { id: 'friend', confirmed: true, isTrustedContact: true };

  it('lets a confirmed trusted contact vouch inside the window', () => {
    expect(canApprove(request(), contact, at(1))).toEqual({ ok: true });
  });

  it('refuses a stranger', () => {
    expect(canApprove(request(), { ...contact, isTrustedContact: false }, at(1))).toEqual({
      ok: false,
      reason: 'not-a-contact',
    });
  });

  it('refuses a nominee who never accepted', () => {
    expect(canApprove(request(), { ...contact, confirmed: false }, at(1))).toEqual({
      ok: false,
      reason: 'unconfirmed-contact',
    });
  });

  it('refuses the account approving its own recovery', () => {
    expect(canApprove(request(), { ...contact, id: 'owner' }, at(1))).toEqual({
      ok: false,
      reason: 'self',
    });
  });

  it('refuses a second vote from the same contact', () => {
    const twice = request({ approvals: 1, approvedBy: ['friend'] });
    expect(canApprove(twice, contact, at(1))).toEqual({ ok: false, reason: 'already-approved' });
  });

  it('refuses once the request is closed', () => {
    expect(canApprove(request(), contact, at(73))).toEqual({ ok: false, reason: 'not-open' });
    expect(canApprove(request({ status: 'USED' }), contact, at(1))).toEqual({
      ok: false,
      reason: 'not-open',
    });
    expect(canApprove(request({ status: 'REJECTED' }), contact, at(1))).toEqual({
      ok: false,
      reason: 'not-open',
    });
  });
});

describe('applyApproval', () => {
  it('reaches APPROVED on the second distinct contact', () => {
    const first = applyApproval(request(), 'friend-a');
    expect(first).toEqual({ approvals: 1, approvedBy: ['friend-a'], status: 'PENDING' });

    const second = applyApproval(request({ ...first }), 'friend-b');
    expect(second.approvals).toBe(2);
    expect(second.status).toBe('APPROVED');
  });

  it('cannot be inflated by replaying the same approver', () => {
    const state = request({ approvals: 1, approvedBy: ['friend-a'] });
    const replay = applyApproval(state, 'friend-a');
    expect(replay.approvals).toBe(1);
    expect(replay.approvedBy).toEqual(['friend-a']);
    expect(replay.status).toBe('PENDING');
  });

  it('derives the count from the approver list, not from the stored number', () => {
    // A corrupted/pre-inflated counter must not survive an approval.
    const bogus = request({ approvals: 99, approvedBy: ['friend-a'] });
    expect(applyApproval(bogus, 'friend-b').approvals).toBe(2);
  });
});

describe('recovery codes', () => {
  it('normalises the Crockford confusables a human will mistype', () => {
    expect(normalizeRecoveryCode('o0-il1 u')).toBe('00111V');
    expect(normalizeRecoveryCode('a1b2c-d3e4f')).toBe('A1B2CD3E4F');
  });

  it('accepts a well-formed code however it was transcribed', () => {
    expect(isWellFormedRecoveryCode('A1B2C-D3E4F')).toBe(true);
    expect(isWellFormedRecoveryCode('a1b2cd3e4f')).toBe(true);
    expect(isWellFormedRecoveryCode('a1b2c d3e4f')).toBe(true);
  });

  it('rejects the wrong length or an out-of-alphabet character', () => {
    expect(isWellFormedRecoveryCode('A1B2C')).toBe(false);
    expect(isWellFormedRecoveryCode('A1B2CD3E4F5')).toBe(false);
    expect(isWellFormedRecoveryCode('')).toBe(false);
    // `!` survives no normalisation step, so the length check catches it.
    expect(isWellFormedRecoveryCode('A1B2C-D3E4!')).toBe(false);
  });

  it('round-trips display formatting', () => {
    const formatted = formatRecoveryCode('A1B2CD3E4F');
    expect(formatted).toBe('A1B2C-D3E4F');
    expect(normalizeRecoveryCode(formatted)).toBe('A1B2CD3E4F');
    expect(isWellFormedRecoveryCode(formatted)).toBe(true);
  });
});

describe('maskEmail', () => {
  it('shows enough to recognise and not enough to guess', () => {
    expect(maskEmail('alice@example.com')).toBe('al***@example.com');
    expect(maskEmail('a@example.com')).toBe('a*@example.com');
  });

  it('never leaks a malformed value verbatim', () => {
    expect(maskEmail('nonsense')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });
});
