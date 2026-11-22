/* eslint-disable @typescript-eslint/no-explicit-any -- a stateful Prisma fake is untyped by nature. */
/**
 * Confirm or dispute a tournament result (s06-20), against an in-memory Prisma
 * fake. `settleMatch` is the real module's export replaced by a recorder, so the
 * tests count how often a match is settled and with which source.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNotification = vi.hoisted(() => vi.fn(async (_input: unknown) => {}));
const settleSpy = vi.hoisted(() => vi.fn());
vi.mock('@/lib/prisma.server', () => ({
  prisma: {},
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification,
}));
vi.mock('@/lib/tournaments/tournament.server', async (orig) => ({
  ...(await orig<object>()),
  settleMatch: settleSpy,
}));

const results = await import('@/lib/tournaments/match-results.server');
const { reportMatch } = await import('@/lib/tournaments/report.server');
const { CLAIM_WINDOW_MS } = await import('@/lib/tournaments/match-results');

const T0 = new Date('2026-12-01T12:00:00.000Z');
const AFTER = new Date(T0.getTime() + CLAIM_WINDOW_MS + 1000);

interface State {
  tournament: any;
  entrants: any[];
  matches: any[];
  locks: string[];
}
let state: State;

function matches(row: any, where: any = {}): boolean {
  return Object.entries(where).every(([k, v]: [string, any]) => {
    const val = row[k];
    if (v === null) return val == null;
    if (v instanceof Date) return val instanceof Date && val.getTime() === v.getTime();
    if (typeof v === 'object') {
      if ('in' in v && !v.in.includes(val)) return false;
      if ('notIn' in v && v.notIn.includes(val)) return false;
      if ('not' in v && (v.not === null ? val == null : val === v.not)) return false;
      if ('lte' in v && !(val != null && val.getTime() <= v.lte.getTime())) return false;
      return true;
    }
    return val === v;
  });
}

let chain: Promise<unknown> = Promise.resolve();
function makeDb() {
  const db: any = {
    $executeRaw: vi.fn(async (_s: TemplateStringsArray, key: string) => {
      state.locks.push(key);
    }),
    // One transaction at a time: what the advisory lock gives the real thing.
    $transaction: (fn: (tx: any) => Promise<unknown>) => {
      const run = chain.then(() => fn(db));
      chain = run.catch(() => undefined);
      return run;
    },
    tournament: {
      findUnique: async ({ where }: any) =>
        where.id === state.tournament.id
          ? {
              ...state.tournament,
            }
          : null,
    },
    tournamentEntrant: {
      findMany: async ({ where }: any) => state.entrants.filter((e) => matches(e, where)),
    },
    tournamentMatch: {
      findUnique: async ({ where }: any) => {
        const row = state.matches.find((m) => m.id === where.id);
        return row
          ? {
              ...row,
            }
          : null;
      },
      findMany: async ({ where, take }: any) =>
        state.matches
          .filter((m) => matches(m, where))
          .sort((a, b) => a.claimedAt - b.claimedAt)
          .slice(0, take),
      count: async ({ where }: any) => state.matches.filter((m) => matches(m, where)).length,
      updateMany: async ({ where, data }: any) => {
        const rows = state.matches.filter((m) => matches(m, where));
        rows.forEach((r) => Object.assign(r, data));
        return {
          count: rows.length,
        };
      },
      update: async ({ where, data }: any) => {
        const row = state.matches.find((m) => m.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  };
  return db;
}

const blank = {
  claimedWinnerId: null,
  claimedById: null,
  claimedAt: null,
  disputedAt: null,
  disputedById: null,
  disputeNote: null,
};
const match = (over: any = {}) => ({
  id: 'm1',
  tournamentId: 't1',
  round: 1,
  slot: 0,
  entrantAId: 'eA',
  entrantBId: 'eB',
  winnerEntrantId: null,
  state: 'READY',
  nextMatchId: 'm9',
  bracket: 'W',
  resultSource: null,
  ...blank,
  ...over,
});
let db: any;
const ids = {
  t: 't1',
  m: 'm1',
};

beforeEach(() => {
  state = {
    tournament: {
      id: 't1',
      name: 'Cup',
      createdById: 'host',
      format: 'SINGLE_ELIM',
      status: 'LIVE',
      swissRounds: null,
    },
    entrants: [
      {
        id: 'eA',
        userId: 'uA',
      },
      {
        id: 'eB',
        userId: 'uB',
      },
    ],
    matches: [match()],
    locks: [],
  };
  createNotification.mockClear();
  settleSpy.mockReset();
  settleSpy.mockImplementation(async (opts: any) => {
    const row = state.matches.find((m) => m.id === opts.matchId);
    if (row.state === 'COMPLETE')
      return {
        settled: false,
        tournamentComplete: false,
      };
    Object.assign(row, {
      state: 'COMPLETE',
      winnerEntrantId: opts.winnerEntrantId,
      resultSource: opts.source,
    });
    return {
      settled: true,
      tournamentComplete: false,
    };
  });
  db = makeDb();
});

const report = (reporterId: string, winnerEntrantId: string, extra: any = {}) =>
  reportMatch(
    {
      tournamentId: 't1',
      matchId: 'm1',
      winnerEntrantId,
      reporterId,
      ...extra,
    },
    db,
  );
const notifiedUsers = () => createNotification.mock.calls.map((c: any) => c[0].userId).sort();

describe('a participant report', () => {
  it('becomes a claim and does not settle; the opponent is notified', async () => {
    const res = await report('uA', 'eA');
    expect(res).toMatchObject({
      settled: false,
      claim: 'claimed',
    });
    expect(settleSpy).not.toHaveBeenCalled();
    expect(state.matches[0]).toMatchObject({
      claimedWinnerId: 'eA',
      claimedById: 'uA',
      state: 'READY',
    });
    expect(state.matches[0].claimedAt).toBeInstanceOf(Date);
    expect(notifiedUsers()).toEqual(['uB']);
    expect(createNotification.mock.calls[0]![0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'tournament_result',
      entityId: 't1',
    });
    expect(state.locks).toContain('tournament-match:m1');
  });

  it('the opponent reporting the same winner confirms: settles once with source agreement', async () => {
    await report('uA', 'eA');
    const res = await report('uB', 'eA');
    expect(res).toMatchObject({
      settled: true,
      claim: 'confirmed',
    });
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy.mock.calls[0]![0]).toMatchObject({
      winnerEntrantId: 'eA',
      source: 'agreement',
    });
    expect(state.matches[0]).toMatchObject({
      claimedAt: null,
      claimedById: null,
    });
  });

  it('the opponent reporting the other winner disputes: flagged, both claimant and host told, nothing settles', async () => {
    await report('uA', 'eA');
    createNotification.mockClear();
    const res = await report('uB', 'eB');
    expect(res).toMatchObject({
      settled: false,
      claim: 'disputed',
    });
    expect(settleSpy).not.toHaveBeenCalled();
    expect(state.matches[0]).toMatchObject({
      disputedById: 'uB',
    });
    expect(state.matches[0].disputedAt).toBeInstanceOf(Date);
    expect(notifiedUsers()).toEqual(['host', 'uA']);
  });

  it('the claimant repeating changes nothing; changing their mind replaces the claim', async () => {
    await report('uA', 'eA');
    expect(await report('uA', 'eA')).toMatchObject({
      claim: 'unchanged',
    });
    expect(await report('uA', 'eB')).toMatchObject({
      claim: 'claimed',
    });
    expect(state.matches[0].claimedWinnerId).toBe('eB');
  });

  it('is refused once disputed, for a stranger, and for a winner outside the match', async () => {
    await report('uA', 'eA');
    await report('uB', 'eB');
    await expect(report('uA', 'eB')).rejects.toMatchObject({
      code: 'DISPUTED',
      status: 409,
    });
    state.matches = [match()];
    await expect(report('stranger', 'eA')).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      results.claimResult(
        {
          tournamentId: 't1',
          matchId: 'm1',
          userId: 'stranger',
          winnerEntrantId: 'eA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(report('uA', 'eZ')).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe('confirm, dispute, withdraw', () => {
  beforeEach(async () => {
    await report('uA', 'eA');
    createNotification.mockClear();
  });

  it('the opponent confirms: settles once', async () => {
    const res = await results.confirmResult(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        userId: 'uB',
      },
      db,
    );
    expect(res.settled).toBe(true);
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy.mock.calls[0]![0].source).toBe('agreement');
    await expect(
      results.confirmResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uB',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 409,
    });
    expect(settleSpy).toHaveBeenCalledTimes(1);
  });

  it('the claimant cannot confirm or dispute their own claim; a stranger is 403', async () => {
    await expect(
      results.confirmResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      code: 'OWN_CLAIM',
      status: 403,
    });
    await expect(
      results.disputeResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      results.confirmResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'x',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      results.disputeResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'x',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it('a dispute keeps its note and tells the claimant and the host', async () => {
    await results.disputeResult(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        userId: 'uB',
        note: 'I won 2-1',
      },
      db,
    );
    expect(state.matches[0]).toMatchObject({
      disputedById: 'uB',
      disputeNote: 'I won 2-1',
    });
    expect(notifiedUsers()).toEqual(['host', 'uA']);
    await expect(
      results.confirmResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uB',
        },
        db,
      ),
    ).rejects.toMatchObject({
      code: 'DISPUTED',
    });
  });

  it('the claimant withdraws before an answer, nobody else, and not after a dispute', async () => {
    await expect(
      results.withdrawClaim(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uB',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    await results.withdrawClaim(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        userId: 'uA',
      },
      db,
    );
    expect(state.matches[0]).toMatchObject(blank);
    await report('uA', 'eA');
    await results.disputeResult(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        userId: 'uB',
      },
      db,
    );
    await expect(
      results.withdrawClaim(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('the unanswered-claim job', () => {
  it('settles a claim past the window as unanswered and tells both players', async () => {
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    createNotification.mockClear();
    expect(await results.settleUnansweredClaims(db, new Date(T0.getTime() + CLAIM_WINDOW_MS - 1))).toBe(0);
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(1);
    expect(settleSpy).toHaveBeenCalledTimes(1);
    expect(settleSpy.mock.calls[0]![0]).toMatchObject({
      winnerEntrantId: 'eA',
      source: 'unanswered',
    });
    expect(notifiedUsers()).toEqual(['uA', 'uB']);
  });

  it('a confirm and the job racing settle once', async () => {
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    await Promise.all([
      results.confirmResult(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          userId: 'uB',
        },
        db,
      ),
      results.settleUnansweredClaims(db, AFTER),
    ]);
    expect(settleSpy).toHaveBeenCalledTimes(1);
  });

  it('never settles a disputed claim', async () => {
    await report('uA', 'eA');
    await report('uB', 'eB');
    state.matches[0].claimedAt = T0;
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the final of single elimination',
      {
        nextMatchId: null,
      },
      {},
    ],
    [
      'the grand final',
      {
        bracket: 'GF',
        nextMatchId: null,
      },
      {
        format: 'DOUBLE_ELIM',
      },
    ],
    [
      'the bracket reset',
      {
        bracket: 'GR',
        nextMatchId: null,
      },
      {
        format: 'DOUBLE_ELIM',
      },
    ],
    [
      'the last match of a round robin',
      {},
      {
        format: 'ROUND_ROBIN',
      },
    ],
    [
      'the last match of swiss',
      {
        round: 3,
      },
      {
        format: 'SWISS',
        swissRounds: 3,
      },
    ],
  ])('never settles a claim on %s', async (_name, matchOver, tournamentOver) => {
    Object.assign(state.tournament, tournamentOver);
    state.matches = [match(matchOver)];
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(0);
    expect(settleSpy).not.toHaveBeenCalled();
    // It waits for the opponent, who can still confirm it.
    expect(
      (
        await results.confirmResult(
          {
            tournamentId: ids.t,
            matchId: ids.m,
            userId: 'uB',
          },
          db,
        )
      ).settled,
    ).toBe(true);
  });

  it('settles a round-robin match while others are still open', async () => {
    Object.assign(state.tournament, {
      format: 'ROUND_ROBIN',
    });
    state.matches = [
      match(),
      match({
        id: 'm2',
        slot: 1,
        entrantAId: 'eC',
        entrantBId: 'eD',
      }),
    ];
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(1);
  });

  it('leaves a claim alone when the tournament is no longer live', async () => {
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    state.tournament.status = 'CANCELLED';
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(0);
  });

  it('puts the claim back when settling fails, so the next run retries', async () => {
    await report('uA', 'eA');
    state.matches[0].claimedAt = T0;
    settleSpy.mockRejectedValueOnce(new Error('boom'));
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(0);
    expect(state.matches[0]).toMatchObject({
      claimedWinnerId: 'eA',
      claimedById: 'uA',
    });
    expect(await results.settleUnansweredClaims(db, AFTER)).toBe(1);
  });
});

describe('the host', () => {
  beforeEach(async () => {
    await report('uA', 'eA');
    await report('uB', 'eB');
    createNotification.mockClear();
  });

  it('decides a dispute: settles with source admin and tells both players', async () => {
    const res = await results.decideDispute(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        byUserId: 'host',
        winnerEntrantId: 'eB',
        note: 'seen the replay',
      },
      db,
    );
    expect(res.settled).toBe(true);
    expect(settleSpy.mock.calls[0]![0]).toMatchObject({
      winnerEntrantId: 'eB',
      source: 'admin',
    });
    expect(state.matches[0]).toMatchObject(blank);
    expect(notifiedUsers()).toEqual(['uA', 'uB']);
  });

  it('an admin may decide; a player or stranger may not', async () => {
    await expect(
      results.decideDispute(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          byUserId: 'uA',
          winnerEntrantId: 'eA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      results.decideDispute(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          byUserId: 'zed',
          winnerEntrantId: 'eA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 403,
    });
    expect(settleSpy).not.toHaveBeenCalled();
    await results.decideDispute(
      {
        tournamentId: ids.t,
        matchId: ids.m,
        byUserId: 'zed',
        isAdmin: true,
        winnerEntrantId: 'eA',
      },
      db,
    );
    expect(settleSpy).toHaveBeenCalledTimes(1);
  });

  it('refuses a winner outside the match and a match with nothing to decide', async () => {
    await expect(
      results.decideDispute(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          byUserId: 'host',
          winnerEntrantId: 'eZ',
        },
        db,
      ),
    ).rejects.toMatchObject({
      status: 400,
    });
    state.matches = [match()];
    await expect(
      results.decideDispute(
        {
          tournamentId: ids.t,
          matchId: ids.m,
          byUserId: 'host',
          winnerEntrantId: 'eA',
        },
        db,
      ),
    ).rejects.toMatchObject({
      code: 'NO_CLAIM',
    });
  });
});

describe('a direct settlement clears the claim', () => {
  it('an authoritative result removes a claim without notices', async () => {
    await report('uA', 'eA');
    createNotification.mockClear();
    await results.clearClaimAfterSettle(
      'm1',
      {
        notify: false,
      },
      db,
    );
    expect(state.matches[0]).toMatchObject(blank);
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('a host report over a claim tells both players', async () => {
    await report('uA', 'eA');
    createNotification.mockClear();
    await results.clearClaimAfterSettle(
      'm1',
      {
        notify: true,
        actorId: 'host',
      },
      db,
    );
    expect(state.matches[0]).toMatchObject(blank);
    expect(notifiedUsers()).toEqual(['uA', 'uB']);
  });
});

describe('erasure and export', () => {
  it('lists the member-actor columns it nulls', () => {
    // Shape only: the operations are Prisma promises, asserted for real in the erasure test.
    expect(typeof results.matchResultErasureOps).toBe('function');
  });
});

describe('the job pages past claims it cannot settle', () => {
  it('more than a batch of waiting claims at the head do not starve the rest', async () => {
    // 250 due claims, oldest first; every one this fake is asked to settle declines
    // (the transaction yields nothing, as for a prize-deciding claim).
    const rows = Array.from(
      {
        length: 250,
      },
      (_, i) => ({
        id: `m${String(i).padStart(3, '0')}`,
        tournamentId: 't',
      }),
    );
    const wheres: any[] = [];
    const fake: any = {
      tournamentMatch: {
        findMany: async ({ where, take }: any) => {
          wheres.push(where);
          const skip: string[] = where.id?.notIn ?? [];
          return rows.filter((r) => !skip.includes(r.id)).slice(0, take);
        },
      },
      $transaction: vi.fn(async () => null),
    };
    expect(await results.settleUnansweredClaims(fake, AFTER)).toBe(0);
    // every due claim was looked at once, over three pages and a final empty one
    expect(fake.$transaction).toHaveBeenCalledTimes(250);
    expect(wheres).toHaveLength(4);
    expect(wheres[0].id).toBeUndefined();
    expect(wheres[1].id.notIn).toHaveLength(100);
    expect(wheres[0].tournament).toEqual({
      status: 'LIVE',
    });
  });
});
