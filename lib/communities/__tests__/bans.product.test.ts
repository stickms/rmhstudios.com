import { describe, expect, it } from 'vitest';
import {
  BAN_DURATIONS,
  TIMEOUT_DURATIONS,
  denyText,
  endsAtFor,
  isActive,
  isDurationAllowed,
  liftedNoticeText,
  sanctionNoticeText,
  standingNoticeKey,
} from '@/lib/communities/bans';
import { createSanctionBody } from '@/lib/communities/bans-schema';

const now = new Date('2026-12-01T12:00:00Z');
const hours = (n: number) => new Date(now.getTime() + n * 3_600_000);

describe('endsAtFor', () => {
  it.each([
    ['1h', 1],
    ['1d', 24],
    ['3d', 72],
    ['7d', 168],
    ['30d', 720],
  ] as const)('%s ends %i hours later', (d, h) => {
    expect(endsAtFor(d, now)).toEqual(hours(h));
  });
  it('forever has no end', () => expect(endsAtFor('forever', now)).toBeNull());
});

describe('isActive', () => {
  it('is over at the boundary, active just before, never when lifted', () => {
    expect(
      isActive(
        {
          endsAt: now,
          liftedAt: null,
        },
        now,
      ),
    ).toBe(false);
    expect(
      isActive(
        {
          endsAt: new Date(now.getTime() + 1),
          liftedAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isActive(
        {
          endsAt: null,
          liftedAt: null,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isActive(
        {
          endsAt: null,
          liftedAt: now,
        },
        now,
      ),
    ).toBe(false);
  });
});

describe('durations by kind', () => {
  it('a timeout is 1h to 7d, a ban 1d to forever', () => {
    expect(TIMEOUT_DURATIONS).toEqual(['1h', '1d', '3d', '7d']);
    expect(BAN_DURATIONS).toEqual(['1d', '7d', '30d', 'forever']);
    expect(isDurationAllowed('timeout', '30d')).toBe(false);
    expect(isDurationAllowed('ban', '1h')).toBe(false);
  });
  it('the schema takes an enum, never free minutes, and checks the pair', () => {
    expect(
      createSanctionBody.safeParse({
        userId: 'u',
        kind: 'ban',
        duration: '90',
      }).success,
    ).toBe(false);
    expect(
      createSanctionBody.safeParse({
        userId: 'u',
        kind: 'timeout',
        duration: 'forever',
      }).success,
    ).toBe(false);
    expect(
      createSanctionBody.safeParse({
        userId: 'u',
        kind: 'ban',
        duration: 'forever',
      }).success,
    ).toBe(true);
    expect(
      createSanctionBody.safeParse({
        userId: 'u',
        kind: 'ban',
        duration: '1d',
        reason: 'x'.repeat(301),
      }).success,
    ).toBe(false);
  });
});

describe('notice text', () => {
  it('selects the line by kind and whether it ends', () => {
    expect(standingNoticeKey('timeout', hours(1))).toBe('notice-timeout-until');
    expect(standingNoticeKey('timeout', null)).toBe('notice-timeout-open');
    expect(standingNoticeKey('ban', hours(1))).toBe('notice-ban-until');
    expect(standingNoticeKey('ban', null)).toBe('notice-ban-open');
  });
  it('carries kind, end and rule title', () => {
    const t = sanctionNoticeText({
      communityName: 'Chess',
      kind: 'ban',
      endsAt: null,
      ruleTitle: 'Be kind',
    });
    expect(t).toBe('You were banned from Chess until a moderator lifts it. Rule: Be kind');
    expect(denyText('timeout', hours(1))).toContain('read but not post');
    expect(
      liftedNoticeText({
        communityName: 'Chess',
        kind: 'timeout',
      }),
    ).toContain('timeout');
  });
});
