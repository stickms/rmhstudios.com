/**
 * `GET /api/daily-puzzles/stats` is the caller's own statistics and nobody else's, a
 * signed-out request is refused, and a score write drops the member's cached copy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getSession: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  invalidateCached: vi.fn(async (_key: string) => undefined),
  cacheKeys: [] as string[],
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => h.getSession(...a),
    },
  },
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    dailyPuzzleScore: {
      findMany: (...a: unknown[]) => h.findMany(...a),
      findUnique: (...a: unknown[]) => h.findUnique(...a),
      create: (...a: unknown[]) => h.create(...a),
      update: (...a: unknown[]) => h.update(...a),
    },
  },
}));
vi.mock('@/lib/cached.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/cached.server')>()),
  cached: async (key: string, _ttl: number, load: () => Promise<unknown>) => {
    h.cacheKeys.push(key);
    return load();
  },
  invalidateCached: (...a: unknown[]) => h.invalidateCached(...(a as [string])),
}));
vi.mock('@/lib/quests/engine.server', () => ({
  recordGamePlay: vi.fn(async () => undefined),
}));

import { route as statsRoute } from '@/lib/daily-puzzles/api/daily-puzzles.stats.server';
import { route as scoreRoute } from '@/lib/daily-puzzles/api/daily-puzzles.score.server';
import { dailyStatsKey } from '@/lib/daily-puzzles/stats.server';

let n = 0;
const ip = () => ({
  'cf-connecting-ip': `10.0.0.${++n}`,
  cookie: 'better-auth.session_token=abc',
});

const getStats = (headers: Record<string, string> = ip()) =>
  statsRoute.handlers.GET!({
    request: new Request('https://rmhstudios.com/api/daily-puzzles/stats', {
      headers,
    }),
    params: {},
  });

const postScore = (body: unknown) =>
  scoreRoute.handlers.POST!({
    request: new Request('https://rmhstudios.com/api/daily-puzzles/score', {
      method: 'POST',
      headers: {
        ...ip(),
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    }),
    params: {},
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.cacheKeys.length = 0;
  h.getSession.mockResolvedValue({
    user: {
      id: 'ana',
    },
  });
  h.findMany.mockResolvedValue([]);
});

describe('GET /api/daily-puzzles/stats', () => {
  it('is 401 signed out, and reads nothing', async () => {
    h.getSession.mockResolvedValue(null);
    const res = await getStats();
    expect(res.status).toBe(401);
    expect(h.findMany).not.toHaveBeenCalled();
  });

  it('reads only the caller’s rows, selecting just the columns it needs', async () => {
    h.findMany.mockResolvedValue([
      {
        gameMode: 'alibi',
        dateKey: '2026-03-05',
        score: 300,
        moves: null,
        dnf: null,
        timeSeconds: 40,
      },
    ]);
    const res = await getStats();
    expect(res.status).toBe(200);
    expect(h.findMany).toHaveBeenCalledTimes(1);
    const arg = h.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({
      userId: 'ana',
    });
    expect(Object.keys(arg.select).sort()).toEqual(
      ['dateKey', 'dnf', 'gameMode', 'moves', 'score', 'timeSeconds'].sort(),
    );
    const body = await res.json();
    expect(body.totalSolves).toBe(1);
    expect(body.modes).toHaveLength(7);
    expect(body.days['2026-03-05']).toEqual(['alibi']);
  });

  it('caches per member under the key the score endpoint invalidates', async () => {
    await getStats();
    expect(h.cacheKeys).toEqual([dailyStatsKey('ana')]);
    h.getSession.mockResolvedValue({
      user: {
        id: 'ben',
      },
    });
    await getStats();
    expect(h.cacheKeys).toEqual([dailyStatsKey('ana'), dailyStatsKey('ben')]);
    expect(dailyStatsKey('ana')).not.toBe(dailyStatsKey('ben'));
  });
});

describe('POST /api/daily-puzzles/score', () => {
  it('drops the member’s cached statistics after a write', async () => {
    h.findUnique.mockResolvedValue(null);
    h.create.mockResolvedValue({});
    const res = await postScore({
      gameMode: 'alibi',
      dateKey: '2026-03-06',
      score: 400,
    });
    expect(res.status).toBe(200);
    expect(h.create).toHaveBeenCalledTimes(1);
    expect(h.invalidateCached).toHaveBeenCalledWith(dailyStatsKey('ana'));
  });

  it('leaves the cache alone when the write is refused', async () => {
    const res = await postScore({
      gameMode: 'alibi',
      dateKey: '2026-03-06',
      score: 5000,
    });
    expect(res.status).toBe(400);
    expect(h.invalidateCached).not.toHaveBeenCalled();
  });

  it('refuses a day that has not started in New York, and writes nothing', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      // 23:30 on 2026-12-10 in New York (04:30Z on the 11th): the 11th has not started there.
      vi.setSystemTime(new Date('2026-12-11T04:30:00Z'));
      h.findUnique.mockResolvedValue(null);
      h.create.mockResolvedValue({});
      const ahead = await postScore({ gameMode: 'alibi', dateKey: '2026-12-11', score: 400 });
      expect(ahead.status).toBe(400);
      expect(h.findUnique).not.toHaveBeenCalled();
      expect(h.create).not.toHaveBeenCalled();
      const today = await postScore({ gameMode: 'alibi', dateKey: '2026-12-10', score: 400 });
      expect(today.status).toBe(200);
      expect(h.create).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
