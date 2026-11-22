/** The v1 tournament serialisers, refusal mapping and cursors: pure, no database. */
import { describe, expect, it } from 'vitest';
import {
  refusalOf,
  serializeMatch,
  serializeTournament,
  type MatchRow,
  type TournamentRow,
} from '@/lib/api/v1/tournaments-shape';
import {
  claimBody,
  decodeSlotCursor,
  decodeTimeCursor,
  encodeSlotCursor,
  encodeTimeCursor,
  listQuery,
  matchesQuery,
} from '@/lib/api/v1/tournaments-schema';

const user = (id: string, handle: string, name: string) => ({
  id,
  name: 'oauth name',
  image: null,
  username: handle,
  handle,
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: {
    displayName: name,
    customImage: null,
    hideCountsOnMine: false,
  },
  inventory: [],
});

const tournament = (over: Partial<TournamentRow> = {}): TournamentRow => ({
  id: 't1',
  name: 'Cup',
  gameId: 'no-such-game',
  format: 'SWISS',
  status: 'REGISTRATION',
  entryFeeCoins: 0,
  prizePoolCoins: 0,
  minPlayers: 2,
  maxPlayers: 16,
  swissRounds: 4,
  seeding: 'join',
  startsAt: null,
  checkInMinutes: null,
  matchDeadlineHours: null,
  startedAt: null,
  completedAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'),
  createdBy: user('h', 'host', 'Host'),
  _count: {
    entrants: 5,
  },
  ...over,
});

const match = (over: Partial<MatchRow> = {}): MatchRow => ({
  id: 'm1',
  round: 1,
  slot: 2,
  bracket: 'W',
  state: 'LIVE',
  winnerEntrantId: null,
  resultSource: null,
  scheduledAt: null,
  deadlineAt: null,
  claimedWinnerId: null,
  claimedById: null,
  claimedAt: null,
  disputedAt: null,
  entrantA: {
    id: 'eA',
    userId: 'uA',
    seed: 1,
    user: user('uA', 'a', 'Ann'),
  },
  entrantB: {
    id: 'eB',
    userId: 'uB',
    seed: null,
    user: user('uB', 'b', 'Bo'),
  },
  ...over,
});

const stranger = {
  userId: 'x',
  hostId: 'h',
};

describe('serializeTournament', () => {
  it('returns nulls for what is not set and counts the field', () => {
    expect(serializeTournament(tournament())).toMatchObject({
      gameTitle: null,
      startsAt: null,
      checkInOpensAt: null,
      checkInMinutes: null,
      playerCount: 5,
      swissRounds: 4,
      host: {
        handle: 'host',
        name: 'Host',
      },
    });
  });

  it('derives when check-in opens and ISO times', () => {
    const t = serializeTournament(
      tournament({
        startsAt: new Date('2026-11-26T19:00:00Z'),
        checkInMinutes: 15,
        startedAt: new Date('2026-11-26T19:05:00Z'),
      }),
    );
    expect(t.checkInOpensAt).toBe('2026-11-26T18:45:00.000Z');
    expect(t.startedAt).toBe('2026-11-26T19:05:00.000Z');
  });

  it('carries only the documented keys', () => {
    expect(Object.keys(serializeTournament(tournament())).sort()).toEqual(
      [
        'checkInMinutes',
        'checkInOpensAt',
        'completedAt',
        'createdAt',
        'entryFeeCoins',
        'format',
        'gameId',
        'gameTitle',
        'host',
        'id',
        'matchDeadlineHours',
        'maxPlayers',
        'minPlayers',
        'name',
        'playerCount',
        'prizePoolCoins',
        'seeding',
        'startedAt',
        'startsAt',
        'status',
        'swissRounds',
      ].sort(),
    );
  });
});

describe('serializeMatch', () => {
  it('shows players by handle and display name and no user ids', () => {
    const m = serializeMatch(match(), stranger);
    expect(m.playerA).toEqual({
      entrantId: 'eA',
      seed: 1,
      handle: 'a',
      name: 'Ann',
    });
    expect(JSON.stringify(m)).not.toContain('uA');
    expect(m.claim).toBeNull();
  });

  it('leaves a side null until the bracket fills it', () => {
    expect(
      serializeMatch(
        match({
          entrantB: null,
          state: 'PENDING',
        }),
        stranger,
      ).playerB,
    ).toBeNull();
  });

  const claimed = match({
    claimedWinnerId: 'eA',
    claimedById: 'uA',
    claimedAt: new Date('2026-11-26T19:00:00Z'),
  });

  it("gives an open claim's detail to the players and the host, only its state to others", () => {
    for (const viewer of [
      {
        userId: 'uB',
        hostId: 'h',
      },
      {
        userId: 'h',
        hostId: 'h',
      },
    ]) {
      expect(serializeMatch(claimed, viewer).claim).toEqual({
        state: 'open',
        winnerEntrantId: 'eA',
        claimedByEntrantId: 'eA',
        claimedAt: '2026-11-26T19:00:00.000Z',
        answerBy: '2026-11-26T19:15:00.000Z',
      });
    }
    expect(serializeMatch(claimed, stranger).claim).toEqual({
      state: 'open',
      winnerEntrantId: null,
      claimedByEntrantId: null,
      claimedAt: null,
      answerBy: null,
    });
  });

  it('reads a disputed claim as disputed to everyone and never carries a note', () => {
    const disputed = {
      ...claimed,
      disputedAt: new Date(),
      disputeNote: 'private words',
    } as MatchRow;
    const out = serializeMatch(disputed, stranger);
    expect(out.claim?.state).toBe('disputed');
    expect(JSON.stringify(out)).not.toContain('private words');
  });

  it('has no claim once the match is settled', () => {
    expect(
      serializeMatch(
        {
          ...claimed,
          state: 'COMPLETE',
          winnerEntrantId: 'eA',
        },
        stranger,
      ).claim,
    ).toBeNull();
  });

  it('names an erased claimant as null', () => {
    const erased = {
      ...claimed,
      claimedById: null,
    };
    expect(
      serializeMatch(erased, {
        userId: 'uB',
        hostId: 'h',
      }).claim?.claimedByEntrantId,
    ).toBeNull();
  });
});

describe('refusalOf', () => {
  it.each([
    [404, 'not_found'],
    [403, 'forbidden'],
    [400, 'invalid_request'],
    [409, 'conflict'],
    [500, 'conflict'],
  ])('maps status %i to %s', (status, code) => {
    expect(
      refusalOf({
        code: 'X',
        status,
      }),
    ).toMatchObject({
      status: status === 500 ? 409 : status,
      code,
    });
  });
  it('uses fixed text per code, never the site message', () => {
    expect(
      refusalOf({
        code: 'OWN_CLAIM',
        status: 403,
      }).message,
    ).toBe('You cannot confirm your own report.');
  });
});

describe('queries and cursors', () => {
  it('defaults and bounds the page size', () => {
    expect(listQuery.parse({}).limit).toBe(25);
    expect(matchesQuery.parse({}).limit).toBe(100);
    expect(
      matchesQuery.safeParse({
        limit: '201',
      }).success,
    ).toBe(false);
    expect(
      listQuery.safeParse({
        limit: '101',
      }).success,
    ).toBe(false);
  });
  it('takes one status, as a single value', () => {
    expect(
      listQuery.safeParse({
        status: 'LIVE',
      }).success,
    ).toBe(true);
    expect(
      listQuery.safeParse({
        status: 'LIVE,COMPLETE',
      }).success,
    ).toBe(false);
  });
  it('bounds the claim body', () => {
    expect(
      claimBody.safeParse({
        winner: 'opponent',
      }).success,
    ).toBe(true);
    expect(
      claimBody.safeParse({
        winner: 'opponent',
        score: '2-1',
      }).success,
    ).toBe(false);
    expect(
      claimBody.safeParse({
        winner: 'me',
        extra: 1,
      }).success,
    ).toBe(false);
  });
  it('round-trips cursors and refuses garbage', () => {
    expect(
      decodeTimeCursor(
        encodeTimeCursor({
          ms: 1700000000000,
          id: 'abc|d',
        }),
      ),
    ).toEqual({
      ms: 1700000000000,
      id: 'abc|d',
    });
    expect(
      decodeSlotCursor(
        encodeSlotCursor({
          round: 2,
          slot: 5,
        }),
      ),
    ).toEqual({
      round: 2,
      slot: 5,
    });
    expect(decodeTimeCursor('%%%')).toBeNull();
    expect(
      decodeSlotCursor(
        encodeTimeCursor({
          ms: 1,
          id: 'x',
        }),
      ),
    ).toBeNull();
  });
});
