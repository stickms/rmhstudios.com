/**
 * `/api/v1/me/typing*`, `/api/v1/me/music/practice`, `/api/v1/me/focus-sessions` (s09-09), driven through the real
 * developer-API wrapper and the real adapters. Prisma is a stand-in that honours `where.userId`, so a read that forgot
 * the owner filter would show another member's rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf, type TestHandler } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => ({
  scopes: [] as string[],
  profiles: [] as Record<string, unknown>[],
  lessons: [] as Record<string, unknown>[],
  daily: [] as Record<string, unknown>[],
  keys: [] as Record<string, unknown>[],
  music: [] as Record<string, unknown>[],
  sessions: [] as Record<string, unknown>[],
  studyProfiles: [] as Record<string, unknown>[],
  calls: [] as { model: string; args: Record<string, unknown> }[],
}));

vi.mock('@/lib/api/developer-auth.server', async (orig) => ({
  ...(await orig<typeof import('@/lib/api/developer-auth.server')>()),
  authenticateApiKey: async () => ({
    ok: true,
    userId: 'owner_1',
    tier: 'starter',
    keyId: 'key_1',
    scopes: h.scopes,
    testMode: false,
    allowedCidrs: [],
    rateLimitPerMinute: null,
  }),
  touchApiKeyLastUsed: () => undefined,
}));
vi.mock('@/lib/redis.server', () => ({ redisRateLimit: async () => null, redisIncrBy: async () => null }));
vi.mock('@/lib/api/usage.server', () => ({ recordUsage: vi.fn() }));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

/** A where-clause evaluator for the few shapes the adapters send. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Where[]).some((w) => matches(row, w));
    const have = row[k];
    if (v instanceof Date) return have instanceof Date && have.getTime() === v.getTime();
    if (typeof v === 'bigint' || typeof v === 'string' || typeof v === 'number') return have === v;
    if (v && typeof v === 'object') {
      const c = v as { gte?: unknown; lte?: unknown; lt?: unknown };
      const val = have as number | string | bigint | Date;
      const cmp = (a: unknown, b: unknown) =>
        a instanceof Date && b instanceof Date
          ? a.getTime() - b.getTime()
          : (a as number) < (b as number)
            ? -1
            : (a as number) > (b as number)
              ? 1
              : 0;
      if (c.gte !== undefined && cmp(val, c.gte) < 0) return false;
      if (c.lte !== undefined && cmp(val, c.lte) > 0) return false;
      if (c.lt !== undefined && cmp(val, c.lt) >= 0) return false;
      return true;
    }
    return true;
  });
}

function table(model: string, rows: () => Row[], sort?: (a: Row, b: Row) => number) {
  return {
    findMany: vi.fn(async (args: { where: Where; take?: number }) => {
      h.calls.push({ model, args });
      const out = rows().filter((r) => matches(r, args.where));
      if (sort) out.sort(sort);
      return out.slice(0, args.take ?? out.length);
    }),
    findUnique: vi.fn(async (args: { where: Where }) => {
      h.calls.push({ model, args });
      return rows().find((r) => matches(r, args.where)) ?? null;
    }),
  };
}
const byTimeDesc = (field: string) => (a: Row, b: Row) => {
  const d = (b[field] as Date).getTime() - (a[field] as Date).getTime();
  if (d !== 0) return d;
  return (b.id as bigint | string) > (a.id as bigint | string) ? 1 : -1;
};

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    rmhTypeProfile: table('profile', () => h.profiles),
    rmhTypeLessonProgress: table('lesson', () => h.lessons),
    rmhTypeDailyEntry: table(
      'daily',
      () => h.daily,
      (a, b) => (a.day as string).localeCompare(b.day as string),
    ),
    rmhTypeKeyStat: table('key', () => h.keys),
    musicPracticeEntry: table('music', () => h.music, byTimeDesc('createdAt')),
    rmhStudySession: table('session', () => h.sessions, byTimeDesc('startedAt')),
    rmhStudyProfile: table('studyProfile', () => h.studyProfiles),
  },
}));

const routes = {
  typing: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/typing')).Route),
  daily: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/typing/daily')).Route),
  keys: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/typing/keys')).Route),
  music: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/music/practice')).Route),
  focus: handlersOf<TestHandler>((await import('../../../../app/routes/api/v1/me/focus-sessions')).Route),
};

const { KEY_PREFIX } = await import('@/lib/api/developer-auth.server');
const { resolveDailyRange, normalizeDay } = await import('@/lib/api/v1/practice-schema');
const BEARER = `Bearer ${KEY_PREFIX}${'k'.repeat(24)}`;
const get = (handler: TestHandler, path: string) =>
  handler({ request: new Request(`https://x.test${path}`, { headers: { authorization: BEARER } }), params: {} });

beforeEach(() => {
  h.scopes = ['read:practice'];
  h.profiles = [];
  h.lessons = [];
  h.daily = [];
  h.keys = [];
  h.music = [];
  h.sessions = [];
  h.studyProfiles = [];
  h.calls = [];
});

describe('scope', () => {
  it('refuses a key without read:practice on all five endpoints', async () => {
    h.scopes = ['read:posts'];
    for (const [handler, path] of [
      [routes.typing.GET, '/api/v1/me/typing'],
      [routes.daily.GET, '/api/v1/me/typing/daily'],
      [routes.keys.GET, '/api/v1/me/typing/keys'],
      [routes.music.GET, '/api/v1/me/music/practice'],
      [routes.focus.GET, '/api/v1/me/focus-sessions'],
    ] as const) {
      const res = await get(handler, path);
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe('insufficient_scope');
    }
    expect(h.calls).toHaveLength(0);
  });

  it('accepts read:*', async () => {
    h.scopes = ['read:*'];
    expect((await get(routes.typing.GET, '/api/v1/me/typing')).status).toBe(200);
  });
});

describe('GET /api/v1/me/typing', () => {
  it('returns the owner profiles and lessons only', async () => {
    const base = {
      totalGamesPlayed: 1,
      totalWins: 0,
      bestWpm: 60.5,
      bestWpmAccuracy: 97,
      avgWpm: 50,
      bestAccuracy: 99,
      avgAccuracy: 95,
      totalCharsTyped: 100,
      totalTimeMs: 5000,
      currentStreak: 1,
      bestStreak: 2,
      updatedAt: new Date('2026-11-20T10:00:00Z'),
    };
    h.profiles = [
      { userId: 'owner_1', difficulty: 'easy', ...base },
      { userId: 'owner_1', difficulty: 'hard', ...base },
      { userId: 'other', difficulty: 'easy', ...base, bestWpm: 200 },
    ];
    h.lessons = [
      { userId: 'owner_1', lessonId: 'l1', bestWpm: 30, bestAccuracy: 98, stars: 3, attempts: 2, completedAt: null },
      {
        userId: 'other',
        lessonId: 'l1',
        bestWpm: 99,
        bestAccuracy: 99,
        stars: 3,
        attempts: 9,
        completedAt: new Date(),
      },
    ];
    const body = await (await get(routes.typing.GET, '/api/v1/me/typing')).json();
    expect(body.profiles.map((p: { difficulty: string }) => p.difficulty)).toEqual(['easy', 'hard']);
    expect(body.profiles[0].bestWpm).toBe(60.5);
    expect(body.profiles[0].updatedAt).toBe('2026-11-20T10:00:00.000Z');
    expect(body.lessons).toHaveLength(1);
    expect(body.lessons[0]).toMatchObject({ lessonId: 'l1', completedAt: null });
    for (const c of h.calls) expect((c.args.where as Where).userId).toBe('owner_1');
  });
});

describe('GET /api/v1/me/typing/daily', () => {
  const entry = (userId: string, day: string, wpm: number | null) => ({
    userId,
    day,
    passageId: 'p',
    wpm,
    accuracy: wpm === null ? null : 95,
    timeMs: wpm === null ? null : 30000,
    finishedAt: wpm === null ? null : new Date('2026-11-21T08:00:00Z'),
  });

  it('returns the owner entries in range, oldest first, nulls kept', async () => {
    h.daily = [
      entry('owner_1', '20261121', 70),
      entry('owner_1', '20261120', null),
      entry('owner_1', '20261001', 60),
      entry('other', '20261120', 150),
    ];
    const res = await get(routes.daily.GET, '/api/v1/me/typing/daily?from=20261110&to=2026-11-21');
    const body = await res.json();
    expect(body.from).toBe('20261110');
    expect(body.data.map((d: { day: string }) => d.day)).toEqual(['20261120', '20261121']);
    expect(body.data[0]).toMatchObject({ wpm: null, accuracy: null, timeMs: null, finishedAt: null });
    expect(body.data[1].finishedAt).toBe('2026-11-21T08:00:00.000Z');
  });

  it('rejects a bad day, a reversed range and a range over 366 days', async () => {
    for (const q of ['from=20261301', 'to=nope', 'from=20261121&to=20261120', 'from=20250101&to=20261121']) {
      const res = await get(routes.daily.GET, `/api/v1/me/typing/daily?${q}`);
      expect(res.status, q).toBe(400);
      expect((await res.json()).error.code).toBe('invalid_request');
    }
    expect(h.calls).toHaveLength(0);
  });

  it('allows exactly 366 days and defaults to the last 30', () => {
    expect(resolveDailyRange({ from: '20250101', to: '20251231' }, new Date()).ok).toBe(true);
    expect(resolveDailyRange({ from: '20240101', to: '20241231' }, new Date()).ok).toBe(true);
    expect(resolveDailyRange({ from: '20240101', to: '20250101' }, new Date()).ok).toBe(false);
    expect(resolveDailyRange({}, new Date('2026-11-22T12:00:00Z'))).toEqual({
      ok: true,
      from: '20261024',
      to: '20261122',
    });
    expect(normalizeDay('2026-02-30')).toBeNull();
  });
});

describe('GET /api/v1/me/typing/keys', () => {
  it('returns only keys past the threshold, slowest first, for the owner', async () => {
    h.keys = [
      { userId: 'owner_1', key: 'a', layout: 'qwerty', attempts: 100, errors: 1, totalMs: 10000 },
      { userId: 'owner_1', key: 'q', layout: 'qwerty', attempts: 20, errors: 10, totalMs: 8000 },
      { userId: 'owner_1', key: 'z', layout: 'qwerty', attempts: 4, errors: 4, totalMs: 9000 },
      { userId: 'owner_1', key: 'e', layout: 'dvorak', attempts: 10, errors: 0, totalMs: 1000 },
      { userId: 'other', key: 'x', layout: 'qwerty', attempts: 500, errors: 400, totalMs: 900000 },
    ];
    const body = await (await get(routes.keys.GET, '/api/v1/me/typing/keys')).json();
    expect(body.minAttempts).toBe(5);
    expect(body.data.map((k: { key: string }) => k.key)).toEqual(['q', 'a', 'e']);
    expect(body.data[0]).toMatchObject({ key: 'q', layout: 'qwerty', msPerKey: 400, errorRate: 0.5, weakness: 1200 });
    const one = await (await get(routes.keys.GET, '/api/v1/me/typing/keys?layout=dvorak')).json();
    expect(one.data.map((k: { key: string }) => k.key)).toEqual(['e']);
  });

  it('rejects an unknown layout', async () => {
    expect((await get(routes.keys.GET, '/api/v1/me/typing/keys?layout=abc')).status).toBe(400);
  });
});

describe('GET /api/v1/me/music/practice', () => {
  const entry = (id: number, userId: string, at: string) => ({
    id: BigInt(id),
    userId,
    kind: 'song',
    refId: 'ode',
    mode: id % 2 ? null : 'wait',
    score: id % 2 ? null : 900,
    durationMs: id % 2 ? null : 1000,
    createdAt: new Date(at),
  });

  it('pages newest first with a keyset cursor, serialising the BigInt id as a number', async () => {
    h.music = [
      entry(1, 'owner_1', '2026-11-20T10:00:00Z'),
      entry(2, 'owner_1', '2026-11-21T10:00:00Z'),
      entry(3, 'owner_1', '2026-11-21T10:00:00Z'),
      entry(4, 'other', '2026-11-22T10:00:00Z'),
    ];
    const first = await (await get(routes.music.GET, '/api/v1/me/music/practice?limit=2')).json();
    expect(first.data.map((e: { id: number }) => e.id)).toEqual([3, 2]);
    expect(typeof first.data[0].id).toBe('number');
    expect(first.data[1]).toMatchObject({ mode: 'wait', score: 900, durationMs: 1000 });
    expect(first.nextCursor).toBe('2026-11-21T10:00:00.000Z|2');
    const second = await (
      await get(routes.music.GET, `/api/v1/me/music/practice?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    expect(second.data.map((e: { id: number }) => e.id)).toEqual([1]);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by since and validates since, limit and cursor', async () => {
    h.music = [entry(1, 'owner_1', '2026-11-20T10:00:00Z'), entry(2, 'owner_1', '2026-11-21T10:00:00Z')];
    const body = await (await get(routes.music.GET, '/api/v1/me/music/practice?since=2026-11-21T00:00:00Z')).json();
    expect(body.data.map((e: { id: number }) => e.id)).toEqual([2]);
    for (const q of [
      'since=yesterday',
      'limit=101',
      'limit=0',
      'cursor=junk',
      'cursor=x|1',
      'cursor=2026-11-21T10:00:00.000Z|1;2',
    ]) {
      expect((await get(routes.music.GET, `/api/v1/me/music/practice?${q}`)).status, q).toBe(400);
    }
  });
});

describe('GET /api/v1/me/focus-sessions', () => {
  const session = (id: string, userId: string, at: string, endedAt: string | null = null) => ({
    id,
    userId,
    roomId: 'room-secret',
    focusTimeMs: 1500000,
    breakTimeMs: 300000,
    sessionsInRun: 2,
    startedAt: new Date(at),
    endedAt: endedAt ? new Date(endedAt) : null,
  });

  it('returns the owner sessions with a summary on the first page only', async () => {
    h.studyProfiles = [{ userId: 'owner_1', weeklyGoalMinutes: 300, timeZone: 'Europe/London' }];
    h.sessions = [
      session('s1', 'owner_1', '2026-11-19T09:00:00Z', '2026-11-19T09:30:00Z'),
      session('s2', 'owner_1', '2026-11-20T09:00:00Z'),
      session('s3', 'owner_1', '2026-11-21T09:00:00Z'),
      session('sx', 'other', '2026-11-22T09:00:00Z'),
    ];
    const first = await (await get(routes.focus.GET, '/api/v1/me/focus-sessions?limit=2')).json();
    expect(first.summary).toEqual({ weeklyGoalMinutes: 300, timeZone: 'Europe/London' });
    expect(first.data.map((s: { id: string }) => s.id)).toEqual(['s3', 's2']);
    expect(first.data[0]).toMatchObject({ focusTimeMs: 1500000, endedAt: null });
    expect(JSON.stringify(first)).not.toContain('room-secret');
    const second = await (
      await get(routes.focus.GET, `/api/v1/me/focus-sessions?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`)
    ).json();
    expect(second.summary).toBeUndefined();
    expect(second.data.map((s: { id: string }) => s.id)).toEqual(['s1']);
    expect(second.data[0].endedAt).toBe('2026-11-19T09:30:00.000Z');
    expect(second.nextCursor).toBeNull();
  });

  it('has a null summary for a member with no study profile', async () => {
    const body = await (await get(routes.focus.GET, '/api/v1/me/focus-sessions')).json();
    expect(body).toMatchObject({ summary: { weeklyGoalMinutes: null, timeZone: null }, data: [], nextCursor: null });
  });
});

describe('owner scoping', () => {
  it('every query carries userId equal to the key owner', async () => {
    h.studyProfiles = [{ userId: 'owner_1', weeklyGoalMinutes: null, timeZone: null }];
    for (const [handler, path] of [
      [routes.typing.GET, '/api/v1/me/typing'],
      [routes.daily.GET, '/api/v1/me/typing/daily'],
      [routes.keys.GET, '/api/v1/me/typing/keys'],
      [routes.music.GET, '/api/v1/me/music/practice'],
      [routes.focus.GET, '/api/v1/me/focus-sessions'],
    ] as const) {
      await get(handler, `${path}${path.includes('?') ? '&' : '?'}userId=other&id=other`);
    }
    expect(h.calls.length).toBeGreaterThanOrEqual(7);
    for (const c of h.calls) expect((c.args.where as Where).userId).toBe('owner_1');
  });
});
