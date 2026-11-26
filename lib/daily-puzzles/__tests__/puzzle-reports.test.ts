/**
 * s14-06 a member's report of a broken daily puzzle, through the real `PUT /api/daily-puzzles/report` over an
 * in-memory database wrapped in `shapeChecked`: only a member who finished the puzzle, only an AI mode, only today
 * and the previous 13 days, one row per member per puzzle (a second send replaces the first), no answer in any
 * response; plus the pure date window, the report kinds and the plain-text rendering the admin page reads.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { AI_PUZZLE_MODES } from '@/lib/daily-puzzles/generate-core';
import {
  REPORTABLE_MODES,
  REPORT_KINDS,
  adminDayKeys,
  describePuzzle,
  isReportableDay,
  replaceTiming,
} from '@/lib/daily-puzzles/reports';

type Row = Record<string, unknown>;

const NOW = new Date('2026-12-10T15:00:00Z'); // 10:00 in New York: the puzzle day is 2026-12-10

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  scores: [] as { userId: string; gameMode: string; dateKey: string }[],
  reports: [] as Row[],
  upserts: [] as unknown[],
  groupBys: [] as unknown[],
  nextId: 1,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  type Key = { userId: string; gameMode: string; dateKey: string };
  const sameKey = (r: Row, k: Key) => r.userId === k.userId && r.gameMode === k.gameMode && r.dateKey === k.dateKey;
  const dailyPuzzleScore = {
    findUnique: vi.fn(async (a: { where: { userId_gameMode_dateKey: Key } }) =>
      h.scores.find((s) => sameKey(s, a.where.userId_gameMode_dateKey)) ? { id: 'score-1' } : null,
    ),
  };
  const dailyPuzzleReport = {
    // s15-07: the day's latest review. Nothing in this file reviews a day, so there is none.
    findFirst: vi.fn(async () => null),
    upsert: vi.fn(async (a: { where: { userId_gameMode_dateKey: Key }; create: Row; update: Row }) => {
      h.upserts.push(a);
      const hit = h.reports.find((r) => sameKey(r, a.where.userId_gameMode_dateKey));
      if (hit) return Object.assign(hit, a.update, { updatedAt: new Date() });
      const row = { id: `r${h.nextId++}`, ...a.create, createdAt: new Date(), updatedAt: new Date() };
      h.reports.push(row);
      return row;
    }),
    groupBy: vi.fn(async (a: { by: string[] }) => {
      h.groupBys.push(a);
      const out = new Map<string, Row>();
      for (const r of h.reports) {
        const key = a.by.map((f) => String(r[f])).join('|');
        const hit = out.get(key);
        if (hit) (hit._count as { _all: number })._all++;
        else out.set(key, { ...Object.fromEntries(a.by.map((f) => [f, r[f]])), _count: { _all: 1 } });
      }
      return [...out.values()];
    }),
    findMany: vi.fn(async () =>
      h.reports.map((r) => ({
        id: r.id,
        dateKey: r.dateKey,
        kind: r.kind,
        note: r.note,
        updatedAt: r.updatedAt,
        user: { handle: 'reporter' },
      })),
    ),
  };
  return { prisma: shapeChecked({ dailyPuzzleScore, dailyPuzzleReport }) };
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function put(body: unknown) {
  const { route } = await import('@/lib/daily-puzzles/api/daily-puzzles.report.server');
  const handlers = route.handlers as Record<string, Handler>;
  const res = await handlers.PUT!({
    request: new Request('https://rmhstudios.com/api/daily-puzzles/report', {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      body: JSON.stringify(body),
    }),
    params: {},
  });
  const text = await res.text();
  return { status: res.status, text, json: (JSON.parse(text || 'null') ?? null) as Record<string, unknown> | null };
}

const member = (id = 'u1') => {
  h.session = { user: { id, isAdmin: false } };
};
const played = (userId = 'u1', gameMode = 'alibi', dateKey = '2026-12-10') =>
  h.scores.push({ userId, gameMode, dateKey });
const report = (over: Record<string, unknown> = {}) => ({
  gameMode: 'alibi',
  dateKey: '2026-12-10',
  kind: 'two-answers',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.session = null;
  h.scores = [];
  h.reports = [];
  h.upserts = [];
  h.groupBys = [];
  h.nextId = 1;
});

describe('who may report', () => {
  it('refuses a signed-out caller', async () => {
    expect((await put(report())).status).toBe(401);
    expect(h.reports).toEqual([]);
  });

  it('refuses a member with no score row for the puzzle, and writes nothing', async () => {
    member();
    played('someone-else');
    const res = await put(report());
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ code: 'PUZZLE_REPORT_NOT_PLAYED' });
    expect(h.reports).toEqual([]);
    expect(h.upserts).toEqual([]);
  });

  it('refuses a score row for another mode or another day', async () => {
    member();
    played('u1', 'spectrum', '2026-12-10');
    played('u1', 'alibi', '2026-12-09');
    expect((await put(report())).status).toBe(403);
    expect(h.reports).toEqual([]);
  });
});

describe('what may be reported', () => {
  it('stores a report from a member who finished today’s puzzle, and echoes nothing but ok', async () => {
    member();
    played();
    const res = await put(report({ note: '  Both the cook and the gardener fit.  ' }));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    assertJsonSafe(res.json);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({
      userId: 'u1',
      gameMode: 'alibi',
      dateKey: '2026-12-10',
      kind: 'two-answers',
      note: 'Both the cook and the gardener fit.',
    });
  });

  it('keeps a missing or blank note as null', async () => {
    member();
    played();
    await put(report());
    expect(h.reports[0]!.note).toBeNull();
    await put(report({ note: '   ' }));
    expect(h.reports[0]!.note).toBeNull();
  });

  it('accepts the previous 13 days and refuses the 14th back and any future day', async () => {
    member();
    played('u1', 'alibi', '2026-11-27'); // 13 days back
    played('u1', 'alibi', '2026-11-26'); // 14 days back
    played('u1', 'alibi', '2026-12-11'); // tomorrow
    expect((await put(report({ dateKey: '2026-11-27' }))).status).toBe(200);
    expect((await put(report({ dateKey: '2026-11-26' }))).status).toBe(400);
    expect((await put(report({ dateKey: '2026-12-11' }))).status).toBe(400);
    expect(h.reports).toHaveLength(1);
  });

  it('refuses a mode no model writes, an unknown kind, a malformed day and an over-long note', async () => {
    member();
    played('u1', 'lights-out');
    played('u1', 'globeset');
    expect((await put(report({ gameMode: 'lights-out' }))).status).toBe(400);
    expect((await put(report({ gameMode: 'globeset' }))).status).toBe(400);
    expect((await put(report({ kind: 'spam' }))).status).toBe(400);
    expect((await put(report({ dateKey: '2026-13-45' }))).status).toBe(400);
    expect((await put(report({ dateKey: 'yesterday' }))).status).toBe(400);
    played();
    expect((await put(report({ note: 'x'.repeat(301) }))).status).toBe(400);
    expect(h.reports).toEqual([]);
  });
});

describe('one report per member per puzzle', () => {
  it('replaces the kind and the note on a second send, in one upsert on the unique key', async () => {
    member();
    played();
    await put(report({ kind: 'two-answers', note: 'first' }));
    const second = await put(report({ kind: 'unclear' }));
    expect(second.status).toBe(200);
    expect(h.reports).toHaveLength(1);
    expect(h.reports[0]).toMatchObject({ kind: 'unclear', note: null });
    expect(h.upserts).toHaveLength(2);
    expect(h.upserts[1]).toMatchObject({
      where: { userId_gameMode_dateKey: { userId: 'u1', gameMode: 'alibi', dateKey: '2026-12-10' } },
      update: { kind: 'unclear', note: null },
    });
  });

  it('keeps separate reports for different members and different puzzles', async () => {
    played('u1');
    played('u2');
    played('u1', 'spectrum');
    member('u1');
    await put(report());
    await put(report({ gameMode: 'spectrum' }));
    member('u2');
    await put(report({ kind: 'other' }));
    expect(h.reports).toHaveLength(3);
  });
});

describe('the report counts the admin page reads', () => {
  it('groups by mode, day and kind', async () => {
    const { reportsFor } = await import('@/lib/daily-puzzles/reports.server');
    h.reports = [
      {
        id: 'a',
        userId: 'u1',
        gameMode: 'alibi',
        dateKey: '2026-12-10',
        kind: 'two-answers',
        note: 'n',
        updatedAt: NOW,
      },
      {
        id: 'b',
        userId: 'u2',
        gameMode: 'alibi',
        dateKey: '2026-12-10',
        kind: 'two-answers',
        note: null,
        updatedAt: NOW,
      },
      { id: 'c', userId: 'u3', gameMode: 'alibi', dateKey: '2026-12-10', kind: 'unclear', note: null, updatedAt: NOW },
    ];
    const out = await reportsFor('alibi', ['2026-12-10']);
    expect(h.groupBys[0]).toMatchObject({ by: ['gameMode', 'dateKey', 'kind'] });
    expect(out.get('2026-12-10')!.counts).toEqual({ 'two-answers': 2, 'wrong-answer': 0, unclear: 1, other: 0 });
    expect(out.get('2026-12-10')!.items).toHaveLength(3);
  });
});

describe('the pure rules', () => {
  it('lists the five model-written modes and the four kinds', () => {
    expect([...REPORTABLE_MODES]).toEqual(AI_PUZZLE_MODES);
    expect([...REPORT_KINDS]).toEqual(['two-answers', 'wrong-answer', 'unclear', 'other']);
  });

  it('windows reports to today and the 13 days before it', () => {
    expect(isReportableDay('2026-12-10', '2026-12-10')).toBe(true);
    expect(isReportableDay('2026-11-27', '2026-12-10')).toBe(true);
    expect(isReportableDay('2026-11-26', '2026-12-10')).toBe(false);
    expect(isReportableDay('2026-12-11', '2026-12-10')).toBe(false);
    expect(isReportableDay('2026-02-30', '2026-12-10')).toBe(false);
  });

  it('lists the next two days, today and the last seven, newest first', () => {
    const keys = adminDayKeys('2026-12-10');
    expect(keys).toHaveLength(10);
    expect(keys[0]).toBe('2026-12-12');
    expect(keys[2]).toBe('2026-12-10');
    expect(keys[9]).toBe('2026-12-03');
  });

  it('allows a replacement for tomorrow and the day after, with a 10 minute margin before the day starts', () => {
    const now = NOW.getTime();
    expect(replaceTiming('2026-12-11', now)).toBe('ok');
    expect(replaceTiming('2026-12-12', now)).toBe('ok');
    expect(replaceTiming('2026-12-13', now)).toBe('outside-window');
    expect(replaceTiming('2026-12-10', now)).toBe('started');
    expect(replaceTiming('2026-12-01', now)).toBe('started');
    // Tomorrow starts at 05:00 UTC in December (New York is UTC-5).
    expect(replaceTiming('2026-12-11', Date.parse('2026-12-11T04:49:00Z'))).toBe('ok');
    expect(replaceTiming('2026-12-11', Date.parse('2026-12-11T04:50:00Z'))).toBe('started');
    expect(replaceTiming('2026-12-11', Date.parse('2026-12-11T04:59:00Z'))).toBe('started');
    expect(replaceTiming('2026-12-11', Date.parse('2026-12-11T05:00:00Z'))).toBe('started');
  });

  it('renders each mode’s puzzle and answer as plain text, even from an odd row', () => {
    const alibi = describePuzzle('alibi', {
      scenario: 'The vase broke.',
      suspects: [{ name: 'Cook', alibi: 'Was baking' }],
      _solution: { guiltyName: 'Cook', contradiction: { explanation: 'The oven was off.' } },
    });
    expect(alibi.puzzle).toContain('The vase broke.');
    expect(alibi.puzzle).toContain('Cook: Was baking');
    expect(alibi.answer).toContain('Guilty: Cook');
    expect(alibi.answer).toContain('The oven was off.');

    const spectrum = describePuzzle('spectrum', {
      label: 'Heights',
      items: [{ name: 'Tree' }, { name: 'Cat' }],
      _solution: [
        { name: 'Tree', trueRank: 2, displayValue: '20 m' },
        { name: 'Cat', trueRank: 1, displayValue: '0.3 m' },
      ],
      _funFact: 'Trees grow.',
    });
    expect(spectrum.puzzle).toBe('Heights\nTree\nCat');
    expect(spectrum.answer.split('\n').slice(0, 2)).toEqual(['1. Cat (0.3 m)', '2. Tree (20 m)']);

    expect(
      describePuzzle('outcast', {
        rounds: [
          { roundNumber: 1, items: [{ name: 'A' }], _solution: { outcastName: 'A', trait: 't', redHerring: 'r' } },
        ],
      }).answer,
    ).toContain('A (t; red herring: r)');
    expect(
      describePuzzle('chainlink', {
        startWord: 'cat',
        endWord: 'dog',
        parLinks: 3,
        _exampleChain: ['cat', 'dog'],
        _connectionExplanations: ['pets'],
      }).answer,
    ).toContain('cat > dog');
    expect(
      describePuzzle('impostor', {
        topic: 'Space',
        statements: [{ text: 'S1' }],
        _solution: [{ text: 'S1', isFake: true, explanation: 'no' }],
      }).answer,
    ).toBe('Fake: S1 (no)');
    expect(describePuzzle('spectrum', null)).toEqual({ puzzle: '', answer: '' });
  });
});
