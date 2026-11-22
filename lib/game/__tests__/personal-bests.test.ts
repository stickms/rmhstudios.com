/**
 * Personal best history (sprint 05 #04), the mission-critical half: a first score and a new best write
 * one row and a non-record writes none, a failing history insert never fails the submission, the prune
 * keeps 100 and names the real table and columns, a retried submission writes nothing twice, the
 * endpoint reads and clears only the caller's rows, an unknown game is 400, and a signed-out caller
 * gets nothing. An in-memory stand-in for Prisma; no database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Row {
  id: bigint;
  userId: string;
  gameId: string;
  score: number;
  previous: number | null;
  progress: number | null;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  session: null as {
    user: {
      id: string;
      isAdmin: boolean;
    };
  } | null,
  rows: [] as unknown[],
  nextId: 1n,
  tick: 0,
  failInsert: false,
  raw: [] as {
    sql: string;
    values: unknown[];
  }[],
  stored: null as number | null | undefined,
  adapterLower: false,
  submitted: 0,
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn(async () => h.session),
    },
  },
}));

vi.mock('@/lib/prisma.server', () => {
  const rows = () => h.rows as Row[];
  const gamePersonalBest = {
    createMany: vi.fn(
      async ({ data, skipDuplicates }: { data: Omit<Row, 'id' | 'createdAt'>[]; skipDuplicates?: boolean }) => {
        if (h.failInsert) throw new Error('insert failed');
        let count = 0;
        for (const d of data) {
          const dup = rows().some((r) => r.userId === d.userId && r.gameId === d.gameId && r.score === d.score);
          if (dup) {
            if (skipDuplicates) continue;
            throw new Error('unique violation');
          }
          rows().push({
            ...d,
            id: h.nextId++,
            createdAt: new Date(Date.UTC(2026, 10, 1) + h.tick++ * 1000),
          });
          count++;
        }
        return {
          count,
        };
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        take,
      }: {
        where: {
          userId: string;
          gameId?: string;
        };
        take?: number;
      }) =>
        rows()
          .filter((r) => r.userId === where.userId && (where.gameId === undefined || r.gameId === where.gameId))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id - a.id))
          .slice(0, take),
    ),
    deleteMany: vi.fn(
      async ({
        where,
      }: {
        where: {
          userId: string;
          gameId: string;
        };
      }) => {
        const before = rows().length;
        h.rows = rows().filter((r) => !(r.userId === where.userId && r.gameId === where.gameId));
        return {
          count: before - rows().length,
        };
      },
    ),
  };
  const prisma = {
    gamePersonalBest,
    // s07-02: score submission reads the member's assist settings; none here.
    gameAssistPreference: {
      findUnique: async () => null,
    },
    // The prune: keep the newest `offset` rows of the member's game, delete the rest.
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.raw.push({
        sql: strings.join('?'),
        values,
      });
      const [userId, gameId, offset] = values as [string, string, number];
      const mine = rows()
        .filter((r) => r.userId === userId && r.gameId === gameId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || Number(b.id - a.id));
      const drop = new Set(mine.slice(offset).map((r) => r.id));
      h.rows = rows().filter((r) => !drop.has(r.id));
      return drop.size;
    }),
  };
  return {
    prisma,
  };
});

vi.mock('@/lib/rate-limit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit')>()),
  // The score pipeline's per-user limit is not under test here.
  rateLimit: () => ({
    allowed: true,
    retryAfter: 0,
  }),
}));
vi.mock('@/lib/developer/recipes.server', () => ({
  emitPersonalBest: vi.fn(),
}));
vi.mock('@/lib/quests/engine.server', () => ({
  recordGamePlay: vi.fn(async () => {}),
}));
vi.mock('@/lib/game/results.server', () => ({
  reportGameResult: vi.fn(async () => {}),
}));
vi.mock('@/lib/game/adapters.server', () => ({
  getGameAdapter: vi.fn(() => ({
    lowerIsBetter: h.adapterLower,
    personalBest: async () => h.stored,
    rankOf: async () => 3,
    submit: async () => {
      h.submitted++;
    },
    leaderboard: async () => [],
  })),
}));

import { recordPersonalBest } from '@/lib/game/personal-bests.server';
import { submitGameScore } from '@/lib/game/submit.server';
import { getGameScoreRules, scoredGameIds } from '@/lib/game/registry';
import { prisma } from '@/lib/prisma.server';

const GAME = scoredGameIds().find((id) => getGameScoreRules(id)?.direction === 'higher-is-better')!;
const OTHER_GAME = scoredGameIds().find((id) => id !== GAME)!;

const rowsOf = () => h.rows as Row[];

beforeEach(() => {
  h.session = {
    user: {
      id: 'me',
      isAdmin: false,
    },
  };
  h.rows = [];
  h.nextId = 1n;
  h.tick = 0;
  h.failInsert = false;
  h.raw = [];
  h.stored = undefined;
  h.adapterLower = false;
  h.submitted = 0;
});

const submit = (score: number, userId = 'me') =>
  submitGameScore({
    gameId: GAME,
    userId,
    score,
    progress: 4,
  });

describe('submitGameScore records the history', () => {
  it('writes a row for a first score', async () => {
    h.stored = null;
    const res = await submit(120);
    expect(res).toMatchObject({
      ok: true,
      moment: {
        kind: 'first-score',
      },
    });
    expect(rowsOf()).toHaveLength(1);
    expect(rowsOf()[0]).toMatchObject({
      userId: 'me',
      gameId: GAME,
      score: 120,
      previous: null,
      progress: 4,
    });
  });

  it('writes a row for a new best, with the previous best', async () => {
    h.stored = 100;
    await submit(150);
    expect(rowsOf()).toHaveLength(1);
    expect(rowsOf()[0]).toMatchObject({
      score: 150,
      previous: 100,
    });
  });

  it('writes nothing for a run that is not a record, and does not even prune', async () => {
    h.stored = 100;
    await submit(100);
    await submit(40);
    expect(rowsOf()).toHaveLength(0);
    expect(h.raw).toHaveLength(0);
    expect(prisma.gamePersonalBest.createMany).not.toHaveBeenCalled();
  });

  it('writes nothing when the stored best could not be read', async () => {
    h.stored = undefined;
    await submit(100);
    expect(rowsOf()).toHaveLength(0);
  });

  it('honours lower-is-better', async () => {
    h.adapterLower = true;
    h.stored = 5000;
    await submit(4200);
    expect(rowsOf()[0]).toMatchObject({
      score: 4200,
      previous: 5000,
    });
  });

  it('a failing history insert does not fail the submission', async () => {
    h.stored = null;
    h.failInsert = true;
    const res = await submit(120);
    expect(res).toMatchObject({
      ok: true,
      moment: {
        kind: 'first-score',
      },
    });
    expect(h.submitted).toBe(1);
    expect(rowsOf()).toHaveLength(0);
  });

  it('a retried submission of the same best writes one row', async () => {
    h.stored = 100;
    await submit(150);
    await submit(150);
    expect(rowsOf()).toHaveLength(1);
  });
});

describe('recordPersonalBest', () => {
  it('prunes to the newest 100 per member and game, leaving other members and games alone', async () => {
    for (let i = 1; i <= 100; i++)
      await recordPersonalBest(prisma, {
        userId: 'me',
        gameId: GAME,
        score: i,
        previous: i - 1 || null,
      });
    await recordPersonalBest(prisma, {
      userId: 'other',
      gameId: GAME,
      score: 1,
      previous: null,
    });
    await recordPersonalBest(prisma, {
      userId: 'me',
      gameId: OTHER_GAME,
      score: 1,
      previous: null,
    });
    expect(rowsOf().filter((r) => r.userId === 'me' && r.gameId === GAME)).toHaveLength(100);

    await recordPersonalBest(prisma, {
      userId: 'me',
      gameId: GAME,
      score: 101,
      previous: 100,
    });
    const mine = rowsOf().filter((r) => r.userId === 'me' && r.gameId === GAME);
    expect(mine).toHaveLength(100);
    expect(mine.some((r) => r.score === 1)).toBe(false);
    expect(mine.some((r) => r.score === 101)).toBe(true);
    expect(rowsOf().filter((r) => r.userId === 'other')).toHaveLength(1);
    expect(rowsOf().filter((r) => r.gameId === OTHER_GAME)).toHaveLength(1);
  });

  it('reports a duplicate as not recorded and skips the prune', async () => {
    expect(
      await recordPersonalBest(prisma, {
        userId: 'me',
        gameId: GAME,
        score: 9,
        previous: null,
      }),
    ).toBe(true);
    const pruned = h.raw.length;
    expect(
      await recordPersonalBest(prisma, {
        userId: 'me',
        gameId: GAME,
        score: 9,
        previous: null,
      }),
    ).toBe(false);
    expect(h.raw).toHaveLength(pruned);
  });

  it('the prune names the real table and quoted camelCase columns, and the keep count', async () => {
    await recordPersonalBest(prisma, {
      userId: 'me',
      gameId: GAME,
      score: 9,
      previous: null,
    });
    const { sql, values } = h.raw[0]!;
    expect(sql).toContain('DELETE FROM "game_personal_best"');
    for (const col of ['"id"', '"userId"', '"gameId"', '"createdAt"']) expect(sql).toContain(col);
    expect(values).toEqual(['me', GAME, 100]);
  });
});

type Handlers = Record<string, (a: { request: Request; params: Record<string, string> }) => Promise<Response>>;

async function call(method: 'GET' | 'DELETE', id: string) {
  const { route } = await import('@/lib/game/api/games.$id.personal-bests.server');
  const res = await (route.handlers as Handlers)[method]!({
    request: new Request(`https://rmhstudios.com/api/games/${id}/personal-bests`, {
      method,
      headers: {
        cookie: 'better-auth.session_token=abc',
        'cf-connecting-ip': String(Math.random()),
      },
    }),
    params: {
      id,
    },
  });
  return {
    status: res.status,
    json: (await res.json()) as Record<string, unknown>,
  };
}

describe('/api/games/$id/personal-bests', () => {
  beforeEach(async () => {
    for (const [userId, gameId, score] of [
      ['me', GAME, 10],
      ['me', GAME, 20],
      ['me', OTHER_GAME, 7],
      ['someone-else', GAME, 999],
    ] as const) {
      await recordPersonalBest(prisma, {
        userId,
        gameId,
        score,
        previous: null,
      });
    }
  });

  it('GET returns only the caller’s rows for that game, newest first', async () => {
    const { status, json } = await call('GET', GAME);
    expect(status).toBe(200);
    const rows = json.rows as {
      score: number;
      id: string;
    }[];
    expect(rows.map((r) => r.score)).toEqual([20, 10]);
    expect(typeof rows[0]!.id).toBe('string');
    expect(json.lowerIsBetter).toBe(false);
    expect(JSON.stringify(json)).not.toContain('someone-else');
  });

  it('an unknown game id is 400 on both methods', async () => {
    expect((await call('GET', 'not-a-game')).status).toBe(400);
    expect((await call('DELETE', 'not-a-game')).status).toBe(400);
  });

  it('a signed-out caller is refused and reads nothing', async () => {
    h.session = null;
    expect((await call('GET', GAME)).status).toBe(401);
    expect((await call('DELETE', GAME)).status).toBe(401);
    expect(rowsOf()).toHaveLength(4);
  });

  it('DELETE clears only the caller’s rows in that game', async () => {
    const { status, json } = await call('DELETE', GAME);
    expect(status).toBe(200);
    expect(json).toEqual({
      cleared: 2,
    });
    expect(rowsOf().map((r) => [r.userId, r.gameId])).toEqual([
      ['me', OTHER_GAME],
      ['someone-else', GAME],
    ]);
  });
});
