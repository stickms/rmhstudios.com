import { describe, expect, it } from 'vitest';
import {
  MAX_COHOSTS,
  canManage,
  cohostLabels,
  hasRoom,
  personLabel,
  refusalMessage,
  refusalStatus,
  resolveRole,
  type CohostRefusal,
} from '@/lib/events/cohosts';

describe('role resolution', () => {
  it('the host is the host whatever a stray row says', () => {
    expect(resolveRole('h', 'h', undefined)).toBe('host');
    expect(resolveRole('h', 'h', 'invited')).toBe('host');
  });

  it('an accepted row is a co-host and an invited row is only invited', () => {
    expect(resolveRole('h', 'c', 'accepted')).toBe('cohost');
    expect(resolveRole('h', 'c', 'invited')).toBe('invited');
  });

  it('anyone else, a signed-out viewer or an unknown status has no role', () => {
    expect(resolveRole('h', 'x', null)).toBeNull();
    expect(resolveRole('h', null, 'accepted')).toBeNull();
    expect(resolveRole('h', 'x', 'whatever')).toBeNull();
    expect(resolveRole(null, 'x', undefined)).toBeNull();
  });

  it('only the host and an accepted co-host manage', () => {
    expect(canManage('host')).toBe(true);
    expect(canManage('cohost')).toBe(true);
    expect(canManage('invited')).toBe(false);
    expect(canManage(null)).toBe(false);
  });
});

describe('the cap', () => {
  it('allows five co-hosts, invited and accepted together', () => {
    expect(MAX_COHOSTS).toBe(5);
    expect(hasRoom(4)).toBe(true);
    expect(hasRoom(5)).toBe(false);
  });
});

describe('"Hosted by A with B and C"', () => {
  it('labels a co-host by name, else by handle, and drops the nameless', () => {
    expect(personLabel({ name: ' Ada ', handle: 'ada' })).toBe('Ada');
    expect(personLabel({ name: '  ', handle: 'bob' })).toBe('@bob');
    expect(personLabel({ name: null, handle: null })).toBeNull();
    expect(
      cohostLabels([
        { name: 'Ada', handle: null },
        { name: null, handle: null },
        { name: null, handle: 'cy' },
      ]),
    ).toEqual(['Ada', '@cy']);
  });

  it('joins with the active locale’s list format', () => {
    const labels = cohostLabels([
      { name: 'B', handle: null },
      { name: 'C', handle: null },
    ]);
    expect(new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format(labels)).toBe('B and C');
    expect(new Intl.ListFormat('en', { style: 'long', type: 'conjunction' }).format([...labels, 'D'])).toBe(
      'B, C, and D',
    );
    expect(new Intl.ListFormat('ar', { style: 'long', type: 'conjunction' }).format(labels)).not.toBe('B and C');
  });
});

describe('refusals', () => {
  const codes: CohostRefusal[] = [
    'not-found',
    'not-host',
    'self',
    'full',
    'blocked',
    'banned',
    'not-member',
    'canceled',
    'user-not-found',
    'no-invite',
    'already-accepted',
  ];

  it('every refusal has its own message and an error status', () => {
    const messages = codes.map(refusalMessage);
    expect(new Set(messages).size).toBe(codes.length);
    for (const code of codes) expect(refusalStatus(code)).toBeGreaterThanOrEqual(400);
  });

  it('the cap message names the cap', () => {
    expect(refusalMessage('full')).toContain(String(MAX_COHOSTS));
  });
});
