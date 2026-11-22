/**
 * `/api/v1/tournaments*` and `/api/v1/me/tournaments`, driven through the real developer-API wrapper with
 * Prisma and the site's write functions mocked: scopes per route, only public tournaments listed, the
 * serialiser leaving private fields and a claim's note out, a claim delegating to `claimResult` with
 * `me` / `opponent` mapped to entrants, every refusal mapped to the v1 envelope without echoing its
 * message, no coin movement starting from a key (a prize-deciding confirm, and a claim that would
 * confirm one, are refused before the site function runs) and an idempotent replay.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';
import { TournamentError } from '@/lib/tournaments/tournament-error';

const h = vi.hoisted(() => ({
  key: {
    current: null as Record<string, unknown> | null,
  },
  idem: new Map<
    string,
    {
      requestHash: string;
      responseBody: string;
      statusCode: number;
    }
  >(),
  tournamentFindMany: vi.fn(),
  tournamentFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  matchFindUnique: vi.fn(),
  matchCount: vi.fn(),
  entrantFindMany: vi.fn(),
  checkIn: vi.fn(),
  claimResult: vi.fn(),
  confirmResult: vi.fn(),
  withdrawClaim: vi.fn(),
}));

vi.mock('@/lib/tournaments/checkin.server', () => ({
  checkIn: h.checkIn,
}));
vi.mock('@/lib/tournaments/match-results.server', () => ({
  claimResult: h.claimResult,
  confirmResult: h.confirmResult,
  withdrawClaim: h.withdrawClaim,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    developerApiKey: {
      findUnique: vi.fn(async () => h.key.current),
      update: vi.fn(async () => ({})),
    },
    apiKeyRefusalDaily: {
      upsert: vi.fn(async () => ({})),
    },
    apiIdempotencyKey: {
      findUnique: vi.fn(
        async ({
          where,
        }: {
          where: {
            keyId_idempotency: {
              idempotency: string;
            };
          };
        }) => h.idem.get(where.keyId_idempotency.idempotency) ?? null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            idempotency: string;
            requestHash: string;
            responseBody: string;
            statusCode: number;
          };
        }) => {
          h.idem.set(data.idempotency, data);
          return {};
        },
      ),
      deleteMany: vi.fn(),
    },
    tournament: {
      findMany: h.tournamentFindMany,
      findUnique: h.tournamentFindUnique,
    },
    tournamentMatch: {
      findMany: h.matchFindMany,
      findUnique: h.matchFindUnique,
      count: h.matchCount,
    },
    tournamentEntrant: {
      findMany: h.entrantFindMany,
    },
  },
}));
vi.mock('@/lib/entitlements', () => ({
  getUserTier: vi.fn(async () => 'starter'),
  hasApiAccess: () => true,
}));
vi.mock('@/lib/admin-audit.server', () => ({
  getActiveBan: vi.fn(async () => null),
}));
vi.mock('@/lib/redis.server', () => ({
  redisRateLimit: vi.fn(async () => null),
  redisIncrBy: vi.fn(async () => null),
}));
vi.mock('@/lib/api/usage.server', () => ({
  recordUsage: vi.fn(),
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({
    options: config,
  }),
}));

const load = async (path: string) =>
  handlersOf<TestHandler>(
    (
      (await import(/* @vite-ignore */ path)) as {
        Route: unknown;
      }
    ).Route,
  );
const list = await load('../../../app/routes/api/v1/tournaments');
const detail = await load('../../../app/routes/api/v1/tournaments/$id');
const matches = await load('../../../app/routes/api/v1/tournaments/$id/matches');
const checkInRoute = await load('../../../app/routes/api/v1/tournaments/$id/check-in');
const claimRoute = await load('../../../app/routes/api/v1/tournaments/$id/matches/$matchId/claim');
const confirmRoute = await load('../../../app/routes/api/v1/tournaments/$id/matches/$matchId/claim/confirm');
const withdrawRoute = await load('../../../app/routes/api/v1/tournaments/$id/matches/$matchId/claim/withdraw');
const mine = await load('../../../app/routes/api/v1/me/tournaments');

const ME = 'user_me';
const THEM = 'user_them';

function keyRecord(scopes: string[]) {
  return {
    id: 'key_1',
    userId: ME,
    revokedAt: null,
    expiresAt: null,
    scopes,
    testMode: false,
    allowedCidrs: [] as string[],
    rateLimitPerMinute: null,
  };
}

const person = (id: string, handle: string, name: string) => ({
  id,
  name,
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
  // Fields the API must never carry:
  email: `${handle}@example.invalid`,
});

const tournamentRow = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  name: 'Friday bracket',
  gameId: 'altair',
  format: 'SINGLE_ELIM',
  status: 'LIVE',
  entryFeeCoins: 100,
  prizePoolCoins: 300,
  seedPoolCoins: 0,
  rakeBps: 500,
  minPlayers: 2,
  maxPlayers: 8,
  swissRounds: null,
  seeding: 'join',
  visibility: 'public',
  createdById: 'host_1',
  startsAt: new Date('2026-11-26T19:00:00Z'),
  checkInMinutes: 30,
  matchDeadlineHours: 48,
  startedAt: null,
  completedAt: null,
  createdAt: new Date('2026-11-20T18:00:00Z'),
  createdBy: person('host_1', 'host', 'Host'),
  _count: {
    entrants: 4,
  },
  ...over,
});

const matchRow = (over: Record<string, unknown> = {}) => ({
  id: 'm1',
  tournamentId: 't1',
  round: 1,
  slot: 1,
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
  disputeNote: null,
  nextMatchId: 'm9',
  entrantAId: 'eA',
  entrantBId: 'eB',
  entrantA: {
    id: 'eA',
    userId: ME,
    seed: 1,
    user: person(ME, 'me', 'Me'),
  },
  entrantB: {
    id: 'eB',
    userId: THEM,
    seed: 2,
    user: person(THEM, 'them', 'Them'),
  },
  tournament: {
    format: 'SINGLE_ELIM',
    swissRounds: null,
    prizePoolCoins: 300,
  },
  ...over,
});

function call(
  handler: TestHandler,
  path: string,
  params: Record<string, string> = {},
  init: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
) {
  return handler({
    request: new Request(`https://rmhstudios.com${path}`, {
      method: init.method ?? 'GET',
      headers: {
        authorization: 'Bearer rmh_live_testsecret',
        'cf-connecting-ip': '203.0.113.9',
        ...(init.body !== undefined
          ? {
              'content-type': 'application/json',
            }
          : {}),
        ...init.headers,
      },
      ...(init.body !== undefined
        ? {
            body: JSON.stringify(init.body),
          }
        : {}),
    }),
    params,
  });
}

const post = (
  handler: TestHandler,
  path: string,
  params: Record<string, string>,
  body?: unknown,
  headers?: Record<string, string>,
) =>
  call(handler, path, params, {
    method: 'POST',
    body,
    headers,
  });

const errorOf = async (res: Response) =>
  (
    (await res.json()) as {
      error: {
        code: string;
        message: string;
      };
    }
  ).error;

const P = {
  id: 't1',
  matchId: 'm1',
};
const CLAIM = '/api/v1/tournaments/t1/matches/m1/claim';

beforeEach(() => {
  vi.clearAllMocks();
  h.idem.clear();
  h.key.current = keyRecord(['read:tournaments', 'write:tournaments']);
  h.matchCount.mockResolvedValue(0);
});

describe('scopes', () => {
  const reads: [string, () => Promise<Response>][] = [
    ['list', () => call(list.GET!, '/api/v1/tournaments')],
    [
      'detail',
      () =>
        call(detail.GET!, '/api/v1/tournaments/t1', {
          id: 't1',
        }),
    ],
    [
      'matches',
      () =>
        call(matches.GET!, '/api/v1/tournaments/t1/matches', {
          id: 't1',
        }),
    ],
    ['me', () => call(mine.GET!, '/api/v1/me/tournaments')],
  ];
  const writes: [string, () => Promise<Response>][] = [
    [
      'check-in',
      () =>
        post(checkInRoute.POST!, '/api/v1/tournaments/t1/check-in', {
          id: 't1',
        }),
    ],
    [
      'claim',
      () =>
        post(claimRoute.POST!, CLAIM, P, {
          winner: 'me',
        }),
    ],
    ['confirm', () => post(confirmRoute.POST!, `${CLAIM}/confirm`, P)],
    ['withdraw', () => post(withdrawRoute.POST!, `${CLAIM}/withdraw`, P)],
  ];

  it.each(reads)('%s needs read:tournaments', async (_n, run) => {
    h.key.current = keyRecord(['write:tournaments']);
    const res = await run();
    expect(res.status).toBe(403);
    expect(res.headers.get('X-Accepted-Scope')).toBe('read:tournaments');
    expect((await errorOf(res)).code).toBe('insufficient_scope');
    expect(h.tournamentFindMany).not.toHaveBeenCalled();
    expect(h.tournamentFindUnique).not.toHaveBeenCalled();
  });

  it.each(writes)('%s needs write:tournaments', async (_n, run) => {
    h.key.current = keyRecord(['read:tournaments']);
    const res = await run();
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('insufficient_scope');
    expect(h.checkIn).not.toHaveBeenCalled();
    expect(h.claimResult).not.toHaveBeenCalled();
    expect(h.confirmResult).not.toHaveBeenCalled();
    expect(h.withdrawClaim).not.toHaveBeenCalled();
  });

  it('read:* satisfies a read', async () => {
    h.key.current = keyRecord(['read:*']);
    h.tournamentFindMany.mockResolvedValue([]);
    expect((await call(list.GET!, '/api/v1/tournaments')).status).toBe(200);
  });
});

describe('GET /api/v1/tournaments', () => {
  it('asks for public, non-cancelled tournaments only and serialises without private fields', async () => {
    h.tournamentFindMany.mockResolvedValue([tournamentRow()]);
    const res = await call(list.GET!, '/api/v1/tournaments?game=altair');
    expect(res.status).toBe(200);
    const where = h.tournamentFindMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      visibility: 'public',
      status: {
        not: 'CANCELLED',
      },
      gameId: 'altair',
    });
    const text = await res.text();
    const body = JSON.parse(text) as {
      data: Record<string, unknown>[];
      nextCursor: string | null;
    };
    expect(body.data[0]).toMatchObject({
      id: 't1',
      format: 'SINGLE_ELIM',
      prizePoolCoins: 300,
      playerCount: 4,
      host: {
        handle: 'host',
        name: 'Host',
      },
      checkInOpensAt: '2026-11-26T18:30:00.000Z',
    });
    for (const secret of ['email', 'example.invalid', 'rakeBps', 'seedPoolCoins', 'createdById', 'visibility'])
      expect(text).not.toContain(secret);
    expect(body.nextCursor).toBeNull();
  });

  it('filters by status and pages with a cursor', async () => {
    const rows = [
      tournamentRow({
        id: 'a',
      }),
      tournamentRow({
        id: 'b',
        createdAt: new Date('2026-11-19T00:00:00Z'),
      }),
    ];
    h.tournamentFindMany.mockResolvedValue(rows);
    const res = await call(list.GET!, '/api/v1/tournaments?status=LIVE&limit=1');
    const body = (await res.json()) as {
      data: unknown[];
      nextCursor: string;
    };
    expect(h.tournamentFindMany.mock.calls[0]![0]).toMatchObject({
      where: {
        status: 'LIVE',
      },
      take: 2,
    });
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeTruthy();
    h.tournamentFindMany.mockResolvedValue([]);
    await call(list.GET!, `/api/v1/tournaments?cursor=${body.nextCursor}`);
    expect(h.tournamentFindMany.mock.calls[1]![0].where.OR).toBeDefined();
  });

  it.each(['status=OPEN', 'limit=0', 'limit=101', 'cursor=%%%', 'game='])(
    'rejects ?%s with 400 invalid_request',
    async (q) => {
      const res = await call(list.GET!, `/api/v1/tournaments?${q}`);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe('invalid_request');
      expect(h.tournamentFindMany).not.toHaveBeenCalled();
    },
  );
});

describe('GET /api/v1/tournaments/{id}', () => {
  it('returns an unlisted tournament by id, as the site page does', async () => {
    h.tournamentFindUnique.mockResolvedValue(
      tournamentRow({
        visibility: 'unlisted',
        entrants: [
          {
            checkedInAt: new Date(),
          },
        ],
      }),
    );
    const res = await call(detail.GET!, '/api/v1/tournaments/t1', {
      id: 't1',
    });
    expect(res.status).toBe(200);
    expect(h.tournamentFindUnique.mock.calls[0]![0].where).toEqual({
      id: 't1',
    });
    expect(h.tournamentFindUnique.mock.calls[0]![0].include.entrants.where).toEqual({
      userId: ME,
    });
    expect(await res.json()).toMatchObject({
      id: 't1',
      you: {
        entered: true,
        checkedIn: true,
      },
    });
  });

  it('answers 404 for a missing tournament', async () => {
    h.tournamentFindUnique.mockResolvedValue(null);
    const res = await call(detail.GET!, '/api/v1/tournaments/x', {
      id: 'x',
    });
    expect(res.status).toBe(404);
    expect((await errorOf(res)).code).toBe('not_found');
  });
});

describe('GET /api/v1/tournaments/{id}/matches', () => {
  const claimed = () =>
    matchRow({
      claimedWinnerId: 'eB',
      claimedById: THEM,
      claimedAt: new Date('2026-11-26T19:20:00Z'),
      disputeNote: 'he disconnected on purpose',
    });

  it('is one match query with both sides joined, and never returns a note', async () => {
    h.tournamentFindUnique.mockResolvedValue({
      id: 't1',
      createdById: 'host_1',
    });
    h.matchFindMany.mockResolvedValue([claimed()]);
    const res = await call(matches.GET!, '/api/v1/tournaments/t1/matches', {
      id: 't1',
    });
    const text = await res.text();
    expect(h.matchFindMany).toHaveBeenCalledTimes(1);
    expect(h.entrantFindMany).not.toHaveBeenCalled();
    expect(h.matchFindMany.mock.calls[0]![0].include).toHaveProperty('entrantA');
    expect(text).not.toContain('disconnected');
    expect(text).not.toContain('example.invalid');
    const m = (
      JSON.parse(text) as {
        data: Record<string, unknown>[];
      }
    ).data[0]!;
    expect(m).toMatchObject({
      playerA: {
        entrantId: 'eA',
        handle: 'me',
        name: 'Me',
      },
      playerB: {
        entrantId: 'eB',
        handle: 'them',
      },
      claim: {
        state: 'open',
        winnerEntrantId: 'eB',
        claimedByEntrantId: 'eB',
        answerBy: '2026-11-26T19:35:00.000Z',
      },
    });
  });

  it("shows a claim's detail to the players and host only, its state to everyone", async () => {
    h.key.current = keyRecord(['read:tournaments']);
    h.tournamentFindUnique.mockResolvedValue({
      id: 't1',
      createdById: 'someone_else',
    });
    h.matchFindMany.mockResolvedValue([
      claimed(),
      matchRow({
        id: 'm2',
        entrantA: {
          id: 'e3',
          userId: 'u3',
          seed: 3,
          user: person('u3', 'c', 'C'),
        },
        entrantB: {
          id: 'e4',
          userId: 'u4',
          seed: 4,
          user: person('u4', 'd', 'D'),
        },
        claimedWinnerId: 'e3',
        claimedById: 'u3',
        claimedAt: new Date('2026-11-26T19:20:00Z'),
      }),
    ]);
    const res = await call(matches.GET!, '/api/v1/tournaments/t1/matches', {
      id: 't1',
    });
    const { data } = (await res.json()) as {
      data: {
        claim: Record<string, unknown>;
      }[];
    };
    expect(data[0]!.claim.winnerEntrantId).toBe('eB');
    expect(data[1]!.claim).toEqual({
      state: 'open',
      winnerEntrantId: null,
      claimedByEntrantId: null,
      claimedAt: null,
      answerBy: null,
    });
  });

  it('404s a missing tournament and 400s a bad cursor', async () => {
    h.tournamentFindUnique.mockResolvedValue(null);
    expect(
      (
        await call(matches.GET!, '/x', {
          id: 'x',
        })
      ).status,
    ).toBe(404);
    const bad = await call(matches.GET!, '/x?cursor=%%%', {
      id: 'x',
    });
    expect(bad.status).toBe(400);
  });
});

describe('GET /api/v1/me/tournaments', () => {
  it("lists the key owner's entries with the next match in two queries", async () => {
    h.entrantFindMany.mockResolvedValue([
      {
        id: 'eA',
        tournamentId: 't1',
        userId: ME,
        seed: 1,
        placement: null,
        wins: 0,
        losses: 0,
        checkedInAt: null,
        joinedAt: new Date('2026-11-21T00:00:00Z'),
        tournament: tournamentRow(),
      },
    ]);
    h.matchFindMany.mockResolvedValue([
      matchRow({
        tournamentId: 't1',
      }),
    ]);
    const res = await call(mine.GET!, '/api/v1/me/tournaments');
    expect(h.entrantFindMany.mock.calls[0]![0].where).toMatchObject({
      userId: ME,
    });
    expect(h.matchFindMany).toHaveBeenCalledTimes(1);
    const { data } = (await res.json()) as {
      data: {
        entry: Record<string, unknown>;
        nextMatch: {
          id: string;
        } | null;
      }[];
    };
    expect(data[0]!.entry).toMatchObject({
      entrantId: 'eA',
      checkedIn: false,
    });
    expect(data[0]!.nextMatch?.id).toBe('m1');
  });
});

describe('POST check-in', () => {
  it("runs the site's checkIn as the key owner", async () => {
    h.checkIn.mockResolvedValue(undefined);
    const res = await post(checkInRoute.POST!, '/api/v1/tournaments/t1/check-in', {
      id: 't1',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      tournamentId: 't1',
      checkedIn: true,
    });
    expect(h.checkIn).toHaveBeenCalledWith({
      tournamentId: 't1',
      userId: ME,
    });
  });

  it.each([
    ['CLOSED', 409, 409, 'conflict'],
    ['NOT_OPEN', 409, 409, 'conflict'],
    ['NOT_ENTERED', 404, 404, 'not_found'],
    ['FORBIDDEN', 403, 403, 'forbidden'],
  ])('maps %s to %i %s without echoing the message', async (code, status, expected, v1) => {
    h.checkIn.mockRejectedValue(new TournamentError('INTERNAL DETAIL 42', code, status));
    const res = await post(checkInRoute.POST!, '/api/v1/tournaments/t1/check-in', {
      id: 't1',
    });
    expect(res.status).toBe(expected);
    const e = await errorOf(res);
    expect(e.code).toBe(v1);
    expect(e.message).not.toContain('INTERNAL');
  });
});

describe('POST claim', () => {
  it('maps me and opponent to entrants and delegates to claimResult', async () => {
    h.matchFindUnique.mockResolvedValue(matchRow());
    h.claimResult.mockResolvedValue({
      status: 'claimed',
      settled: false,
      tournamentComplete: false,
    });
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'me',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      status: 'claimed',
      settled: false,
      tournamentComplete: false,
    });
    expect(h.claimResult).toHaveBeenCalledWith({
      tournamentId: 't1',
      matchId: 'm1',
      userId: ME,
      winnerEntrantId: 'eA',
      refuseIfPays: true,
    });
    await post(claimRoute.POST!, CLAIM, P, {
      winner: 'opponent',
    });
    expect(h.claimResult.mock.calls[1]![0].winnerEntrantId).toBe('eB');
  });

  it.each([
    [
      {
        winner: 'them',
      },
    ],
    [{}],
    [
      {
        winner: 'me',
        score: '2-1',
      },
    ],
    [
      {
        winner: 'me',
        winnerEntrantId: 'eB',
      },
    ],
  ])('rejects the body %j with 400 before anything runs', async (body) => {
    const res = await post(claimRoute.POST!, CLAIM, P, body);
    expect(res.status).toBe(400);
    expect(h.claimResult).not.toHaveBeenCalled();
  });

  it('404s a match that is not in the tournament', async () => {
    h.matchFindUnique.mockResolvedValue(
      matchRow({
        tournamentId: 'other',
      }),
    );
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'me',
    });
    expect(res.status).toBe(404);
    expect(h.claimResult).not.toHaveBeenCalled();
  });

  it.each([
    ['FORBIDDEN', 403, 403, 'forbidden'],
    ['NOT_LIVE', 409, 409, 'conflict'],
    ['NOT_READY', 409, 409, 'conflict'],
    ['MATCH_CANCELLED', 409, 409, 'conflict'],
    ['DISPUTED', 409, 409, 'conflict'],
    ['NOT_FOUND', 404, 404, 'not_found'],
  ])("maps the site's %s to %i %s without echoing its message", async (code, status, expected, v1) => {
    h.matchFindUnique.mockResolvedValue(matchRow());
    h.claimResult.mockRejectedValue(new TournamentError('SECRET INTERNALS', code, status));
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'me',
    });
    expect(res.status).toBe(expected);
    const e = await errorOf(res);
    expect(e.code).toBe(v1);
    expect(e.message).not.toContain('SECRET');
  });

  const theirClaim = (winner: string, over: Record<string, unknown> = {}) =>
    matchRow({
      claimedWinnerId: winner,
      claimedById: THEM,
      claimedAt: new Date(),
      ...over,
    });

  it('passes refuseIfPays to claimResult and maps its CONFIRM_ON_SITE refusal to 409 confirm_on_site', async () => {
    h.matchFindUnique.mockResolvedValue(
      theirClaim('eB', {
        nextMatchId: null,
      }),
    );
    h.claimResult.mockRejectedValue(new TournamentError('SECRET', 'CONFIRM_ON_SITE', 409));
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'opponent',
    });
    expect(res.status).toBe(409);
    const e = await errorOf(res);
    expect(e.code).toBe('confirm_on_site');
    expect(e.message).toBe('Confirm this result on the site: it decides the prizes.');
    expect(h.claimResult).toHaveBeenCalledWith(
      expect.objectContaining({
        refuseIfPays: true,
      }),
    );
  });

  it('lets a report that confirms a match which pays nothing through', async () => {
    h.matchFindUnique.mockResolvedValue(theirClaim('eB'));
    h.claimResult.mockResolvedValue({
      status: 'confirmed',
      settled: true,
      tournamentComplete: false,
    });
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'opponent',
    });
    expect(res.status).toBe(200);
    expect(h.claimResult).toHaveBeenCalledTimes(1);
  });

  it('refuses, before claimResult runs, a report that would dispute an existing claim', async () => {
    h.matchFindUnique.mockResolvedValue(theirClaim('eB'));
    const res = await post(claimRoute.POST!, CLAIM, P, {
      winner: 'me',
    });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('conflict');
    expect(h.claimResult).not.toHaveBeenCalled();
  });

  it('lets the claimant repeat or change their own claim', async () => {
    h.matchFindUnique.mockResolvedValue(
      matchRow({
        claimedWinnerId: 'eA',
        claimedById: ME,
        claimedAt: new Date(),
        nextMatchId: null,
      }),
    );
    h.claimResult.mockResolvedValue({
      status: 'unchanged',
      settled: false,
      tournamentComplete: false,
    });
    expect(
      (
        await post(claimRoute.POST!, CLAIM, P, {
          winner: 'me',
        })
      ).status,
    ).toBe(200);
  });
});

describe('POST claim/confirm: no coin movement from a key', () => {
  const final = (over: Record<string, unknown> = {}) =>
    matchRow({
      nextMatchId: null,
      claimedWinnerId: 'eB',
      claimedById: THEM,
      claimedAt: new Date(),
      ...over,
    });

  it('always asks confirmResult to refuse a prize-paying settlement under its lock, and maps that refusal to 409 confirm_on_site', async () => {
    h.confirmResult.mockRejectedValue(new TournamentError('SECRET', 'CONFIRM_ON_SITE', 409));
    const res = await post(confirmRoute.POST!, `${CLAIM}/confirm`, P);
    expect(res.status).toBe(409);
    const e = await errorOf(res);
    expect(e.code).toBe('confirm_on_site');
    expect(e.message).toBe('Confirm this result on the site: it decides the prizes.');
    expect(h.confirmResult).toHaveBeenCalledTimes(1);
    expect(h.confirmResult).toHaveBeenCalledWith({
      tournamentId: 't1',
      matchId: 'm1',
      userId: ME,
      refuseIfPays: true,
    });
  });

  it('delegates when the site function settles (no prize decided)', async () => {
    h.confirmResult.mockResolvedValue({
      settled: true,
      tournamentComplete: false,
    });
    const res = await post(confirmRoute.POST!, `${CLAIM}/confirm`, P);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      settled: true,
      tournamentComplete: false,
    });
  });

  it('leaves a refusal the site words (own claim, no claim) to the site function', async () => {
    h.matchFindUnique.mockResolvedValue(
      final({
        claimedById: ME,
      }),
    );
    h.confirmResult.mockRejectedValue(new TournamentError('own', 'OWN_CLAIM', 403));
    const res = await post(confirmRoute.POST!, `${CLAIM}/confirm`, P);
    expect(res.status).toBe(403);
    expect((await errorOf(res)).code).toBe('forbidden');
    expect(h.confirmResult).toHaveBeenCalledTimes(1);
  });

  it('is an idempotent write: a retry with the same key replays and confirms once', async () => {
    h.matchFindUnique.mockResolvedValue(
      final({
        nextMatchId: 'm9',
      }),
    );
    h.confirmResult.mockResolvedValue({
      settled: true,
      tournamentComplete: false,
    });
    const headers = {
      'idempotency-key': 'retry-1',
    };
    const first = await post(confirmRoute.POST!, `${CLAIM}/confirm`, P, undefined, headers);
    const replay = await post(confirmRoute.POST!, `${CLAIM}/confirm`, P, undefined, headers);
    expect(first.status).toBe(200);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    expect(await replay.json()).toEqual({
      settled: true,
      tournamentComplete: false,
    });
    expect(h.confirmResult).toHaveBeenCalledTimes(1);
  });
});

describe('POST claim/withdraw', () => {
  it('delegates to withdrawClaim as the key owner', async () => {
    h.withdrawClaim.mockResolvedValue(undefined);
    const res = await post(withdrawRoute.POST!, `${CLAIM}/withdraw`, P);
    expect(await res.json()).toEqual({
      withdrawn: true,
    });
    expect(h.withdrawClaim).toHaveBeenCalledWith({
      tournamentId: 't1',
      matchId: 'm1',
      userId: ME,
    });
  });

  it('maps CLAIM_GONE to 409 conflict', async () => {
    h.withdrawClaim.mockRejectedValue(new TournamentError('gone', 'CLAIM_GONE', 409));
    const res = await post(withdrawRoute.POST!, `${CLAIM}/withdraw`, P);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('conflict');
  });
});

describe('what the API does not offer', () => {
  it('has no registration, withdrawal-from-tournament, creation or dispute endpoint', async () => {
    const { ENDPOINTS } = await import('@/lib/api/registry');
    const paths = ENDPOINTS.filter((e) => e.group === 'Tournaments').map((e) => `${e.method} ${e.path}`);
    expect(paths.sort()).toEqual(
      [
        'GET /api/v1/me/tournaments',
        'GET /api/v1/tournaments',
        'GET /api/v1/tournaments/{id}',
        'GET /api/v1/tournaments/{id}/matches',
        'POST /api/v1/tournaments/{id}/check-in',
        'POST /api/v1/tournaments/{id}/matches/{matchId}/claim',
        'POST /api/v1/tournaments/{id}/matches/{matchId}/claim/confirm',
        'POST /api/v1/tournaments/{id}/matches/{matchId}/claim/withdraw',
      ].sort(),
    );
  });
});
