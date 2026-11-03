import { describe, expect, it } from 'vitest';
import { isLeagueCode, isLocked, leaderboard, leagueLockAt, sanitizePicks, leagueNameSchema, type LeagueMemberRow } from '../leagues';
import { generateRoomCode } from '../rooms';
import type { Race } from '../types';

const race = (id: string, winner: 'DEM' | 'GOP' | null): Race =>
  ({ id, office: 'senate', state: id, status: winner ? 'called' : 'upcoming', winnerParty: winner, candidates: [] } as unknown as Race);

const member = (userId: string, picks: Record<string, 'DEM' | 'GOP' | 'TOSS'>, pickedAt: string | null = '2026-11-01T00:00:00Z'): LeagueMemberRow => ({
  userId, name: userId, handle: null, image: null, picks, pickedAt,
});

describe('sanitizePicks', () => {
  it('keeps only known calls on well-formed keys that exist', () => {
    const out = sanitizePicks({ 'PA-G-S-2026-11-03': 'DEM', bad: 'MAYBE', 'x y': 'GOP', AZ: 'GOP' }, new Set(['PA-G-S-2026-11-03']));
    expect(out).toEqual({ 'PA-G-S-2026-11-03': 'DEM' });
  });
  it('accepts well-formed keys when the race list is not known yet, and rejects non-objects', () => {
    expect(sanitizePicks({ AZ: 'GOP' })).toEqual({ AZ: 'GOP' });
    expect(sanitizePicks([1, 2])).toEqual({});
    expect(sanitizePicks(null)).toEqual({});
  });
  it('caps the number of picks', () => {
    const big = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`K${i}`, 'DEM']));
    expect(Object.keys(sanitizePicks(big)).length).toBe(200);
  });
});

describe('leaderboard', () => {
  const races = [race('A', 'DEM'), race('B', 'GOP'), race('C', null)];
  it('ranks by right calls, then fewer wrong, then earlier map; ties share a rank', () => {
    const out = leaderboard(
      [
        member('late', { A: 'DEM', B: 'GOP' }, '2026-11-02T00:00:00Z'),
        member('early', { A: 'DEM', B: 'GOP' }, '2026-11-01T00:00:00Z'),
        member('one', { A: 'DEM', B: 'DEM' }),
        member('none', {}, null),
      ],
      races,
    );
    expect(out.map((s) => [s.userId, s.rank])).toEqual([['early', 1], ['late', 1], ['one', 3], ['none', 4]]);
    expect(out[0].score.correct).toBe(2);
    expect(out[2].score).toMatchObject({ correct: 1, wrong: 1 });
  });
});

describe('lock and codes', () => {
  it('locks when the first polls close on a general election, never for a primary', () => {
    expect(leagueLockAt('2026')?.toISOString()).toBe('2026-11-03T23:00:00.000Z');
    expect(isLocked('2026', new Date('2026-11-03T22:59:00Z'))).toBe(false);
    expect(isLocked('2026', new Date('2026-11-03T23:00:00Z'))).toBe(true);
    expect(leagueLockAt('2026-03-03')).toBeNull();
  });
  it('validates codes and names', () => {
    expect(isLeagueCode(generateRoomCode(() => 3))).toBe(true);
    expect(isLeagueCode('short')).toBe(false);
    expect(leagueNameSchema.safeParse('  Friends \n of   mine ').data).toBe('Friends of mine');
    expect(leagueNameSchema.safeParse('x').success).toBe(false);
  });
});
