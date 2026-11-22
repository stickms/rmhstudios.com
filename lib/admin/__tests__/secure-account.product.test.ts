import { describe, expect, it } from 'vitest';
import {
  SECURE_GROUPS,
  SECURE_REASON_MAX,
  cleanReason,
  isNothingRevoked,
  isSecureGroup,
  isValidReason,
  summaryLines,
  type SecureAccountResult,
} from '@/lib/admin/secure-account';
import { secureAccountBody } from '@/lib/admin/secure-account-schema';

const base: SecureAccountResult = {
  at: '2026-11-21T10:00:00.000Z',
  groups: [...SECURE_GROUPS],
  sessions: 3,
  apiKeys: 2,
  rmhCodeTokens: 1,
  webhooks: 4,
  calendarRotated: true,
};

describe('secure account summary', () => {
  it('lists a line per kind in a stable order', () => {
    expect(summaryLines(base).map((l) => [l.key, l.count])).toEqual([
      ['sessions', 3],
      ['apiKeys', 2],
      ['rmhCodeTokens', 1],
      ['webhooks', 4],
      ['calendar', 1],
    ]);
  });

  it('only lists the groups that ran', () => {
    expect(
      summaryLines({
        ...base,
        groups: ['webhooks'],
      }).map((l) => l.key),
    ).toEqual(['webhooks']);
  });

  it('knows when nothing was revoked', () => {
    const zero = {
      ...base,
      sessions: 0,
      apiKeys: 0,
      rmhCodeTokens: 0,
      webhooks: 0,
      calendarRotated: false,
    };
    expect(isNothingRevoked(zero)).toBe(true);
    expect(isNothingRevoked(base)).toBe(false);
  });
});

describe('secure account reason and groups', () => {
  it('requires a trimmed, non-empty reason within the limit', () => {
    expect(isValidReason('  ')).toBe(false);
    expect(isValidReason('Account taken over')).toBe(true);
    expect(isValidReason('x'.repeat(SECURE_REASON_MAX))).toBe(true);
    expect(isValidReason('x'.repeat(SECURE_REASON_MAX + 1))).toBe(false);
    expect(cleanReason('  a  ')).toBe('a');
  });

  it('recognises only the four groups', () => {
    expect(SECURE_GROUPS.every(isSecureGroup)).toBe(true);
    expect(isSecureGroup('passkeys')).toBe(false);
  });

  it('the body schema dedupes groups and rejects unknown ones', () => {
    const ok = secureAccountBody.parse({
      groups: ['sessions', 'sessions'],
      reason: ' why ',
    });
    expect(ok).toEqual({
      groups: ['sessions'],
      reason: 'why',
    });
    expect(
      secureAccountBody.safeParse({
        groups: ['passkeys'],
        reason: 'x',
      }).success,
    ).toBe(false);
  });
});
