import { describe, expect, it } from 'vitest';
import { checkVerification, normalizeVerificationRule } from '@/lib/communities/verification';

const NOW = Date.parse('2026-10-12T12:00:00Z');
const subject = (over = {}) => ({
  emailVerified: true,
  accountCreatedAt: new Date(NOW - 10 * 86_400_000),
  memberSince: new Date(NOW - 60 * 60_000) as Date | null,
  ...over,
});

describe('checkVerification', () => {
  it('none always passes', () => {
    expect(
      checkVerification({ level: 'none', value: 0 }, subject({ emailVerified: false }), NOW).ok,
    ).toBe(true);
  });
  it('email', () => {
    const rule = { level: 'email', value: 0 } as const;
    expect(checkVerification(rule, subject(), NOW).ok).toBe(true);
    const r = checkVerification(rule, subject({ emailVerified: false }), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('email');
  });
  it('account age reports the time remaining', () => {
    const rule = { level: 'account_age', value: 14 } as const;
    const r = checkVerification(rule, subject(), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remainingMs).toBe(4 * 86_400_000);
    expect(checkVerification({ level: 'account_age', value: 10 }, subject(), NOW).ok).toBe(true);
  });
  it('member age counts from the join time and refuses non-members', () => {
    expect(checkVerification({ level: 'member_age', value: 30 }, subject(), NOW).ok).toBe(true);
    const r = checkVerification({ level: 'member_age', value: 120 }, subject(), NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remainingMs).toBe(60 * 60_000);
    expect(
      checkVerification({ level: 'member_age', value: 5 }, subject({ memberSince: null }), NOW).ok,
    ).toBe(false);
  });
  it('accepts ISO strings', () => {
    const r = checkVerification(
      { level: 'account_age', value: 1 },
      {
        emailVerified: true,
        accountCreatedAt: new Date(NOW - 2 * 86_400_000).toISOString(),
        memberSince: null,
      },
      NOW,
    );
    expect(r.ok).toBe(true);
  });
});

describe('normalizeVerificationRule', () => {
  it('clamps and zeroes', () => {
    expect(normalizeVerificationRule('account_age', 9999).value).toBe(365);
    expect(normalizeVerificationRule('member_age', 0).value).toBe(1);
    expect(normalizeVerificationRule('email', 50).value).toBe(0);
  });
});
