import { describe, expect, it } from 'vitest';
import {
  MAX_TEAMMATES,
  alreadyOnEntryMessage,
  conflictingPlacement,
  creditNames,
  discountTeamRatings,
  hasTeamRoom,
  listNames,
  mayRateEntry,
  personLabel,
  resolveTeamState,
  teamRefusalMessage,
  teamRefusalStatus,
  type TeamRefusal,
} from '@/lib/competitive/jam-teams';

describe('team state', () => {
  it('the submitter is the owner whatever a stray row says', () => {
    expect(resolveTeamState('o', 'o', undefined)).toBe('owner');
    expect(resolveTeamState('o', 'o', 'invited')).toBe('owner');
  });

  it('an accepted row is a teammate and an invited row is only invited', () => {
    expect(resolveTeamState('o', 'a', 'accepted')).toBe('teammate');
    expect(resolveTeamState('o', 'a', 'invited')).toBe('invited');
  });

  it('anyone else, a signed-out viewer or an unknown status is nothing', () => {
    expect(resolveTeamState('o', 'x', null)).toBeNull();
    expect(resolveTeamState('o', null, 'accepted')).toBeNull();
    expect(resolveTeamState('o', 'x', 'whatever')).toBeNull();
  });
});

describe('the cap', () => {
  it('is three teammates besides the submitter', () => {
    expect(MAX_TEAMMATES).toBe(3);
    expect(hasTeamRoom(0)).toBe(true);
    expect(hasTeamRoom(2)).toBe(true);
    expect(hasTeamRoom(3)).toBe(false);
  });
});

describe('who may rate', () => {
  const entry = { userId: 'owner', acceptedIds: ['a', 'b'] };

  it('not the submitter and not an accepted teammate', () => {
    expect(mayRateEntry(entry, 'owner')).toBe(false);
    expect(mayRateEntry(entry, 'a')).toBe(false);
    expect(mayRateEntry(entry, 'b')).toBe(false);
  });

  it('anyone else, including an invited member who has not accepted', () => {
    expect(mayRateEntry(entry, 'c')).toBe(true);
    expect(mayRateEntry({ userId: 'owner', acceptedIds: [] }, 'a')).toBe(true);
  });
});

describe('the one-entry rule', () => {
  it('finds the entry a member is already on, other than the one in question', () => {
    const placements = [{ entryId: 'e2', title: 'Other' }];
    expect(conflictingPlacement(placements, 'e1')).toEqual({ entryId: 'e2', title: 'Other' });
    expect(conflictingPlacement(placements, 'e2')).toBeNull();
    expect(conflictingPlacement([], 'e1')).toBeNull();
  });

  it('a first submission (no entry yet) conflicts with any placement', () => {
    expect(conflictingPlacement([{ entryId: 'e2' }], null)).toEqual({ entryId: 'e2' });
  });

  it('names the entry in the refusal', () => {
    expect(alreadyOnEntryMessage('Tiny Tower')).toBe('You are already on Tiny Tower');
  });
});

describe('credit line', () => {
  it('puts the submitter first and drops nameless members', () => {
    const names = creditNames({ name: 'Ada', handle: 'ada' }, [
      { name: null, handle: 'bo' },
      { name: '  ', handle: null },
      { name: 'Cy', handle: 'cy' },
    ]);
    expect(names).toEqual(['Ada', '@bo', 'Cy']);
  });

  it('joins as "A, B and C" in English and as a single name alone', () => {
    expect(listNames(['A', 'B', 'C'], 'en')).toBe('A, B, and C');
    expect(listNames(['A', 'B'], 'en')).toBe('A and B');
    expect(listNames(['A'], 'en')).toBe('A');
  });

  it('falls back to a comma list for a locale the runtime rejects', () => {
    expect(listNames(['A', 'B'], 'not a locale!!')).toBe('A, B');
  });

  it('labels a person by name, then handle', () => {
    expect(personLabel({ name: ' Ada ', handle: 'ada' })).toBe('Ada');
    expect(personLabel({ name: null, handle: 'ada' })).toBe('@ada');
    expect(personLabel({ name: null, handle: null })).toBeNull();
  });
});

describe('leaderboard discount', () => {
  const sum = (n: number) => ({ fun: n, creativity: n, theme: n, polish: n });
  const row = (entryId: string, raterId: string, n: number) => ({ entryId, raterId, ...sum(n) });

  it('removes the entry’s own team’s ratings from its means and count', () => {
    const out = discountTeamRatings(
      [{ entryId: 'e1', count: 3, sum: sum(5 + 1 + 3) }],
      [row('e1', 'a', 5)],
      new Set(['e1:a', 'e1:owner']),
    );
    expect(out.get('e1')).toEqual({ avg: sum(2), count: 2 });
  });

  it('keeps a teammate’s rating of someone else’s entry', () => {
    const out = discountTeamRatings(
      [{ entryId: 'e2', count: 1, sum: sum(5) }],
      [row('e2', 'a', 5)],
      new Set(['e1:a']),
    );
    expect(out.get('e2')).toEqual({ avg: sum(5), count: 1 });
  });

  it('an entry whose only ratings were the team’s has no average', () => {
    const out = discountTeamRatings(
      [{ entryId: 'e1', count: 1, sum: sum(5) }],
      [row('e1', 'a', 5)],
      new Set(['e1:a']),
    );
    expect(out.has('e1')).toBe(false);
  });
});

describe('refusals', () => {
  const codes: TeamRefusal[] = [
    'not-found',
    'not-owner',
    'self',
    'full',
    'blocked',
    'banned',
    'user-not-found',
    'closed',
    'no-invite',
    'already-accepted',
    'already-on-entry',
  ];

  it('every code has a 4xx status and a message', () => {
    for (const code of codes) {
      expect(teamRefusalStatus(code)).toBeGreaterThanOrEqual(400);
      expect(teamRefusalStatus(code)).toBeLessThan(500);
      expect(teamRefusalMessage(code).length).toBeGreaterThan(0);
    }
  });

  it('a block and a ban read the same to the submitter, and a closed jam is a conflict', () => {
    expect(teamRefusalStatus('blocked')).toBe(403);
    expect(teamRefusalStatus('closed')).toBe(409);
    expect(teamRefusalStatus('full')).toBe(409);
  });
});
