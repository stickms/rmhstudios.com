/**
 * The RMHMusic practice log is a member's own data: every endpoint is signed-in only and scoped
 * to the caller, the writers add exactly one entry from the values they already validated, and a
 * log that cannot be written never fails the save. Prisma is replaced by an in-memory table that
 * honours `where` (user, kind, reference, mode, id cursor), so a query that forgot its `userId`
 * would return the other member's rows here; the endpoints are driven directly.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOf } from '@/lib/__tests__/api-handlers-of';

interface Row {
  id: bigint;
  userId: string;
  kind: string;
  refId: string;
  mode: string | null;
  score: number | null;
  durationMs: number | null;
  createdAt: Date;
}
interface Where {
  userId: string;
  kind?: string;
  refId?: string;
  mode?: string | null;
  id?: { lt: bigint };
}

const m = vi.hoisted(() => {
  const table: Row[] = [];
  let next = 1n;
  const matches = (r: Row, w: Where) =>
    r.userId === w.userId &&
    (w.kind === undefined || r.kind === w.kind) &&
    (w.refId === undefined || r.refId === w.refId) &&
    (w.mode === undefined || r.mode === w.mode) &&
    (w.id === undefined || r.id < w.id.lt);
  const entry = {
    create: vi.fn(async ({ data }: { data: Omit<Row, 'id' | 'createdAt'> }) => {
      const row: Row = { ...data, id: next++, createdAt: new Date('2026-11-23T10:00:00Z') };
      table.push(row);
      return row;
    }),
    findFirst: vi.fn(async ({ where }: { where: Where }) => table.find((r) => matches(r, where)) ?? null),
    findMany: vi.fn(async ({ where, take }: { where: Where; take: number }) =>
      table
        .filter((r) => matches(r, where))
        .sort((a, b) => (a.id < b.id ? 1 : -1))
        .slice(0, take),
    ),
    count: vi.fn(async ({ where }: { where: Where }) => table.filter((r) => matches(r, where)).length),
    deleteMany: vi.fn(async ({ where }: { where: Where }) => {
      const gone = table.filter((r) => matches(r, where));
      for (const r of gone) table.splice(table.indexOf(r), 1);
      return { count: gone.length };
    }),
  };
  return {
    table,
    reset: () => {
      table.length = 0;
      next = 1n;
    },
    seed: (userId: string, over: Partial<Row> = {}) => {
      const row: Row = {
        id: next++,
        userId,
        kind: 'song',
        refId: 'ode-to-joy',
        mode: 'wait',
        score: 80,
        durationMs: 60_000,
        createdAt: new Date('2026-11-22T10:00:00Z'),
        ...over,
      };
      table.push(row);
      return row;
    },
    entry,
    session: vi.fn(),
    queryRaw: vi.fn(),
    profile: vi.fn(),
    bestDelete: vi.fn(),
    progressDelete: vi.fn(),
    completeLesson: vi.fn(),
    saveSongRun: vi.fn(),
    saveSprintFreeplay: vi.fn(),
    saveSprintDaily: vi.fn(),
    applyReviews: vi.fn(),
    loadBoardMe: vi.fn(),
  };
});

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: m.session } } }));
vi.mock('@/lib/rate-limit.server', () => ({ withRateLimitAsync: async () => null }));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    musicPracticeEntry: m.entry,
    musicLearnProfile: { findUnique: m.profile },
    musicSongBest: { deleteMany: m.bestDelete },
    musicLearnLessonProgress: { deleteMany: m.progressDelete },
    $queryRaw: m.queryRaw,
  },
}));
vi.mock('@/lib/rmhmusic/learn/progress.server', () => ({
  completeLesson: m.completeLesson,
  UnknownLessonError: class UnknownLessonError extends Error {},
}));
vi.mock('@/lib/rmhmusic/learn/songs/songs.server', () => ({ saveSongRun: m.saveSongRun }));
vi.mock('@/lib/rmhmusic/learn/sprint/sprint.server', () => ({
  saveSprintFreeplay: m.saveSprintFreeplay,
  saveSprintDaily: m.saveSprintDaily,
}));
vi.mock('@/lib/rmhmusic/learn/cards.server', () => ({
  applyReviews: m.applyReviews,
  loadCards: vi.fn(),
  UnknownCardError: class UnknownCardError extends Error {},
}));
vi.mock('@/lib/rmhmusic/learn/social/board.server', () => ({ loadBoardMe: m.loadBoardMe }));

import { route as lessonRoute } from '@/lib/rmhmusic/api/rmhmusic.learn.lesson-complete.server';
import { route as songRoute } from '@/lib/rmhmusic/api/rmhmusic.songs.best.server';
import { route as freeplayRoute } from '@/lib/rmhmusic/api/rmhmusic.sprint.freeplay.server';
import { route as dailyRoute } from '@/lib/rmhmusic/api/rmhmusic.sprint.daily.server';
import { route as cardsRoute } from '@/lib/rmhmusic/api/rmhmusic.learn.cards.server';
import { route as summaryRoute } from '@/lib/rmhmusic/api/rmhmusic.history.server';
import { route as entriesRoute } from '@/lib/rmhmusic/api/rmhmusic.history.entries.server';
import { route as songProgressRoute } from '@/lib/rmhmusic/api/rmhmusic.history.songs.$songId.server';
import {
  DAILY_LEVELS,
  FREEPLAY_PROMPTS,
  DAILY_PROMPTS_PER_LEVEL,
  sprintLevel,
} from '@/lib/rmhmusic/learn/sprint/levels';

type Handler = (ctx: { request: Request; params: Record<string, string> }) => Promise<Response>;
const call = (route: unknown, method: string, path: string, body?: unknown, params = {}) =>
  (handlersOf<Handler>(route)[method] as Handler)({
    request: new Request(`https://rmhstudios.com${path}`, {
      method,
      headers: { cookie: 'better-auth.session_token=abc', 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params,
  });
const signIn = (id: string) => m.session.mockResolvedValue({ user: { id, isAdmin: false }, session: { id: 's' } });

const prompt = (level: string) => ({
  level,
  kind: sprintLevel(level as never)?.kind ?? 'note',
  correct: true,
  ms: 1,
  noteMs: [] as number[],
  points: 100,
  skipped: false,
});
const freeplayResults = Array.from({ length: FREEPLAY_PROMPTS }, () => prompt('note'));
const dailyResults = DAILY_LEVELS.flatMap((level) =>
  Array.from({ length: DAILY_PROMPTS_PER_LEVEL }, () => prompt(level)),
);

beforeEach(() => {
  m.reset();
  vi.clearAllMocks();
  signIn('u1');
  m.profile.mockResolvedValue({ dailyGoal: 2 });
});

describe('the six writers each log one entry from the values they validated', () => {
  it('a finished lesson', async () => {
    m.completeLesson.mockResolvedValue({ stars: 3, xpAwarded: 10, progress: [] });
    const res = await call(lessonRoute, 'POST', '/api/rmhmusic/learn/lesson-complete', {
      lessonId: 'staff-1',
      stars: 3,
      score: 96,
      durationMs: 90_000,
    });
    expect(res.status).toBe(200);
    expect(m.table).toEqual([
      expect.objectContaining({
        userId: 'u1',
        kind: 'lesson',
        refId: 'staff-1',
        mode: null,
        score: 96,
        durationMs: 90_000,
      }),
    ]);
  });

  it('a song run logs the run’s own score and mode, not the best', async () => {
    m.saveSongRun.mockResolvedValue({ songId: 'ode-to-joy', mode: 'play', bestScore: 95, score: 62 });
    const res = await call(songRoute, 'POST', '/api/rmhmusic/songs/best', {
      songId: 'ode-to-joy',
      run: { mode: 'wait', wrong: [] },
      durationMs: 45_000,
    });
    expect(res.status).toBe(200);
    expect(m.table).toHaveLength(1);
    expect(m.table[0]).toMatchObject({
      userId: 'u1',
      kind: 'song',
      refId: 'ode-to-joy',
      mode: 'play',
      score: 62,
      durationMs: 45_000,
    });
  });

  it('a freeplay sprint logs its level and its recomputed score', async () => {
    m.saveSprintFreeplay.mockResolvedValue({ level: 'note', bestScore: 100, bestAvgMs: 1 });
    const res = await call(freeplayRoute, 'POST', '/api/rmhmusic/sprint/freeplay', {
      level: 'note',
      results: freeplayResults,
      durationMs: 30_000,
    });
    expect(res.status).toBe(200);
    expect(m.table).toHaveLength(1);
    expect(m.table[0]).toMatchObject({
      kind: 'sprint',
      refId: 'note',
      mode: 'free',
      score: 100,
      durationMs: 30_000,
    });
  });

  it('a daily sprint logs under its date, once, even when the save is retried', async () => {
    m.saveSprintDaily.mockResolvedValue('saved');
    m.loadBoardMe.mockResolvedValue(undefined);
    const send = () =>
      call(dailyRoute, 'POST', '/api/rmhmusic/sprint/daily', {
        date: '2026-11-23',
        results: dailyResults,
        durationMs: 120_000,
      });
    expect((await send()).status).toBe(200);
    expect((await send()).status).toBe(200);
    expect(m.table).toHaveLength(1);
    expect(m.table[0]).toMatchObject({
      kind: 'sprint',
      refId: '2026-11-23',
      mode: 'daily',
      score: 100,
      durationMs: 120_000,
    });
  });

  it('a daily sprint that was not saved logs nothing', async () => {
    m.saveSprintDaily.mockResolvedValue('already-scored');
    m.loadBoardMe.mockResolvedValue(undefined);
    await call(dailyRoute, 'POST', '/api/rmhmusic/sprint/daily', {
      date: '2026-11-23',
      results: dailyResults,
    });
    expect(m.table).toHaveLength(0);
  });

  it('a card-review session is one entry, however many cards, with no score', async () => {
    m.applyReviews.mockResolvedValue([]);
    const res = await call(cardsRoute, 'POST', '/api/rmhmusic/learn/cards', {
      reviews: [
        { cardId: 'a', grade: 'good' },
        { cardId: 'b', grade: 'again' },
        { cardId: 'c', grade: 'easy' },
      ],
      durationMs: 75_000,
    });
    expect(res.status).toBe(200);
    expect(m.table).toHaveLength(1);
    expect(m.table[0]).toMatchObject({
      kind: 'cards',
      refId: 'cards',
      mode: null,
      score: null,
      durationMs: 75_000,
    });
  });

  it('a save with no duration is an activity with no minutes', async () => {
    m.completeLesson.mockResolvedValue({ stars: 1, xpAwarded: 0, progress: [] });
    await call(lessonRoute, 'POST', '/api/rmhmusic/learn/lesson-complete', {
      lessonId: 'staff-1',
      stars: 1,
      score: 70,
    });
    expect(m.table[0]).toMatchObject({ kind: 'lesson', durationMs: null });
  });

  it('refuses a duration over two hours instead of storing it', async () => {
    const res = await call(lessonRoute, 'POST', '/api/rmhmusic/learn/lesson-complete', {
      lessonId: 'staff-1',
      stars: 1,
      score: 70,
      durationMs: 3 * 3_600_000,
    });
    expect(res.status).toBe(400);
    expect(m.completeLesson).not.toHaveBeenCalled();
    expect(m.table).toHaveLength(0);
  });
});

describe('a log that cannot be written never fails the save', () => {
  it('answers the lesson save as if nothing happened and logs the failure', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.completeLesson.mockResolvedValue({ stars: 2, xpAwarded: 5, progress: [] });
    m.entry.create.mockRejectedValueOnce(new Error('db down'));
    const res = await call(lessonRoute, 'POST', '/api/rmhmusic/learn/lesson-complete', {
      lessonId: 'staff-1',
      stars: 2,
      score: 80,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stars: 2, xpAwarded: 5 });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('answers the song save, the card review and a daily sprint the same way', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    m.entry.create.mockRejectedValue(new Error('db down'));
    m.saveSongRun.mockResolvedValue({ songId: 'ode-to-joy', mode: 'wait', bestScore: 90, score: 90 });
    m.applyReviews.mockResolvedValue([]);
    m.saveSprintDaily.mockResolvedValue('saved');
    m.loadBoardMe.mockResolvedValue(undefined);
    const song = await call(songRoute, 'POST', '/api/rmhmusic/songs/best', {
      songId: 'ode-to-joy',
      run: { mode: 'wait', wrong: [] },
    });
    const cards = await call(cardsRoute, 'POST', '/api/rmhmusic/learn/cards', {
      reviews: [{ cardId: 'a', grade: 'good' }],
    });
    const daily = await call(dailyRoute, 'POST', '/api/rmhmusic/sprint/daily', {
      date: '2026-11-23',
      results: dailyResults,
    });
    expect([song.status, cards.status, daily.status]).toEqual([200, 200, 200]);
    error.mockRestore();
  });
});

describe('the entries and song endpoints never return another member’s rows', () => {
  beforeEach(() => {
    m.seed('u1', { id: 1n, refId: 'ode-to-joy', score: 40 });
    m.seed('u2', { id: 2n, refId: 'ode-to-joy', score: 99 });
    m.seed('u1', { id: 3n, refId: 'ode-to-joy', mode: 'play', score: 70 });
    m.seed('u2', { id: 4n, kind: 'lesson', refId: 'staff-1', mode: null, score: 100 });
    m.seed('u1', { id: 5n, kind: 'lesson', refId: 'staff-1', mode: null, score: 90 });
  });

  it('lists only the caller’s entries, newest first', async () => {
    const res = await call(entriesRoute, 'GET', '/api/rmhmusic/history/entries');
    const body = (await res.json()) as { entries: { id: string; score: number }[]; nextCursor: null };
    expect(body.entries.map((e) => e.id)).toEqual(['5', '3', '1']);
    expect(body.nextCursor).toBeNull();
    expect(m.entry.findMany.mock.calls[0]?.[0].where.userId).toBe('u1');
  });

  it('filters by kind and pages by the id cursor, still only the caller’s', async () => {
    const lessons = (await (await call(entriesRoute, 'GET', '/api/rmhmusic/history/entries?kind=lesson')).json()) as {
      entries: { id: string }[];
    };
    expect(lessons.entries.map((e) => e.id)).toEqual(['5']);
    const older = (await (await call(entriesRoute, 'GET', '/api/rmhmusic/history/entries?cursor=5')).json()) as {
      entries: { id: string }[];
    };
    expect(older.entries.map((e) => e.id)).toEqual(['3', '1']);
  });

  it('gives a next cursor only when a page is full', async () => {
    for (let i = 0; i < 30; i++) m.seed('u1');
    const page = (await (await call(entriesRoute, 'GET', '/api/rmhmusic/history/entries')).json()) as {
      entries: unknown[];
      nextCursor: string | null;
    };
    expect(page.entries).toHaveLength(30);
    expect(page.nextCursor).not.toBeNull();
  });

  it('rejects a malformed cursor or kind before touching the table', async () => {
    for (const q of ['cursor=abc', 'cursor=1;drop', 'kind=admin']) {
      const res = await call(entriesRoute, 'GET', `/api/rmhmusic/history/entries?${q}`);
      expect(res.status, q).toBe(400);
    }
    expect(m.entry.findMany).not.toHaveBeenCalled();
  });

  it('shows a song’s attempts, the lower scores included, oldest first, only the caller’s', async () => {
    const res = await call(songProgressRoute, 'GET', '/api/rmhmusic/history/songs/ode-to-joy', undefined, {
      songId: 'ode-to-joy',
    });
    const body = (await res.json()) as { attempts: { id: string; score: number; mode: string }[] };
    expect(body.attempts.map((a) => [a.id, a.score, a.mode])).toEqual([
      ['1', 40, 'wait'],
      ['3', 70, 'play'],
    ]);
  });

  it('filters a song’s attempts by mode', async () => {
    const res = await call(songProgressRoute, 'GET', '/api/rmhmusic/history/songs/ode-to-joy?mode=play', undefined, {
      songId: 'ode-to-joy',
    });
    const body = (await res.json()) as { attempts: { id: string }[] };
    expect(body.attempts.map((a) => a.id)).toEqual(['3']);
  });

  it('says 400 for a song that is not in the songbook', async () => {
    const res = await call(songProgressRoute, 'GET', '/api/rmhmusic/history/songs/nope', undefined, { songId: 'nope' });
    expect(res.status).toBe(400);
  });

  it('answers another member’s view of the same song with only that member’s rows', async () => {
    signIn('u2');
    const res = await call(songProgressRoute, 'GET', '/api/rmhmusic/history/songs/ode-to-joy', undefined, {
      songId: 'ode-to-joy',
    });
    const body = (await res.json()) as { attempts: { score: number }[] };
    expect(body.attempts.map((a) => a.score)).toEqual([99]);
  });
});

describe('DELETE clears only the caller’s entries', () => {
  it('leaves the other member’s rows, the bests and the lesson progress alone', async () => {
    m.seed('u1');
    m.seed('u1', { kind: 'lesson', refId: 'staff-1', mode: null });
    m.seed('u2');
    const res = await call(summaryRoute, 'DELETE', '/api/rmhmusic/history');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: 2 });
    expect(m.table.map((r) => r.userId)).toEqual(['u2']);
    expect(m.entry.deleteMany.mock.calls[0]?.[0]).toEqual({ where: { userId: 'u1' } });
    expect(m.bestDelete).not.toHaveBeenCalled();
    expect(m.progressDelete).not.toHaveBeenCalled();
  });
});

describe('the summary endpoint', () => {
  it('refuses a time zone that is not an IANA name', async () => {
    const res = await call(summaryRoute, 'GET', '/api/rmhmusic/history?tz=Not/AZone');
    expect(res.status).toBe(400);
    expect(m.queryRaw).not.toHaveBeenCalled();
  });

  it('refuses a week outside the selector’s range', async () => {
    const res = await call(summaryRoute, 'GET', '/api/rmhmusic/history?week=8');
    expect(res.status).toBe(400);
  });

  it('aggregates in one statement, with the zone and the member as bound values', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-23T15:00:00Z'), toFake: ['Date'] });
    try {
      m.seed('u1');
      m.queryRaw.mockResolvedValue([
        { date: '2026-11-23', count: 3, ms: 600_000 },
        { date: '2026-11-22', count: 1, ms: 0 },
      ]);
      const res = await call(summaryRoute, 'GET', '/api/rmhmusic/history?tz=America/New_York&firstDay=1');
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        today: string;
        dailyGoal: number;
        thisWeekMinutes: number;
        goalDays: { met: number; elapsed: number };
        totalEntries: number;
        week: { days: { date: string; minutes: number; count: number }[] };
      };
      expect(body.today).toBe('2026-11-23');
      expect(body.dailyGoal).toBe(2);
      expect(body.thisWeekMinutes).toBe(10);
      expect(body.goalDays).toEqual({ met: 1, elapsed: 1 });
      expect(body.totalEntries).toBe(1);
      expect(body.week.days).toHaveLength(7);
      expect(m.queryRaw).toHaveBeenCalledTimes(1);
      const [strings, ...values] = m.queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
      expect(values).toContain('America/New_York');
      expect(values).toContain('u1');
      expect(strings.join('')).not.toContain('America');
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes its SQL with the real table and column names of the schema', () => {
    const schema = readFileSync(join(__dirname, '..', '..', '..', 'prisma', 'schema', 'rmhmusic.prisma'), 'utf8');
    const model = /model MusicPracticeEntry \{([\s\S]*?)\n\}/.exec(schema)?.[1] ?? '';
    const table = /@@map\("([^"]+)"\)/.exec(model)?.[1];
    const columns = [...model.matchAll(/^\s{2}(\w+)\s+\S+/gm)].map((x) => x[1]);
    const server = readFileSync(join(__dirname, '..', 'history.server.ts'), 'utf8');
    const sql = /\$queryRaw<[\s\S]*?>`([\s\S]*?)`/.exec(server)?.[1] ?? '';
    expect(table).toBe('music_practice_entry');
    expect(sql).toContain(`FROM ${table}`);
    const used = [...sql.matchAll(/"(\w+)"/g)].map((x) => x[1]);
    expect(used.length).toBeGreaterThan(0);
    for (const c of used) expect(columns, `column ${c}`).toContain(c);
  });
});

describe('signed out', () => {
  it('every history endpoint answers 401', async () => {
    m.session.mockResolvedValue(null);
    const calls = [
      call(summaryRoute, 'GET', '/api/rmhmusic/history'),
      call(summaryRoute, 'DELETE', '/api/rmhmusic/history'),
      call(entriesRoute, 'GET', '/api/rmhmusic/history/entries'),
      call(songProgressRoute, 'GET', '/api/rmhmusic/history/songs/ode-to-joy', undefined, {
        songId: 'ode-to-joy',
      }),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(401);
    expect(m.entry.deleteMany).not.toHaveBeenCalled();
  });
});
