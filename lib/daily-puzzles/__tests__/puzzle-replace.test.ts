/**
 * s14-06 the admin's check of coming puzzles, through the real endpoints over an in-memory database wrapped in
 * `shapeChecked`: a future day is replaced in place and audited inside the transaction; today, a past day, a day three
 * days out, a day starting within 10 minutes, a day with a score row and a row that changed since the page read it are
 * refused with nothing written; the model runs before the transaction opens and the day's lock is taken before any
 * check; "Generate now" only fills a missing day; admins only; the answer appears nowhere but the admin read.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';

const NOW = new Date('2026-12-10T15:00:00Z'); // 10:00 in New York; tomorrow starts 2026-12-11T05:00Z
const OLD_CREATED = new Date('2026-12-10T04:45:00Z');
const OLD_TEXT = 'OLD-SECRET-GUILTY-NAME';
const NEW_TEXT = 'NEW-SECRET-GUILTY-NAME';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  puzzles: [] as Record<string, unknown>[],
  scores: [] as { gameMode: string; dateKey: string }[],
  audits: [] as { adminId: string; action: string; opts: Record<string, string | undefined>; inTx: boolean }[],
  order: [] as string[],
  inTx: 0,
  updates: [] as unknown[],
  creates: [] as unknown[],
  generated: [] as { mode: string; dateKey: string }[],
  onGenerate: null as null | (() => void),
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(
    async (_tx: unknown, adminId: string, action: string, opts: Record<string, string | undefined>) => {
      h.order.push('audit');
      h.audits.push({ adminId, action, opts, inTx: h.inTx > 0 });
    },
  ),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.order.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/daily-puzzles/generate.server', () => ({
  generateForMode: vi.fn(async (mode: string, dateKey: string) => {
    h.order.push('generate');
    h.generated.push({ mode, dateKey });
    h.onGenerate?.();
    return { data: { scenario: 'New one', suspects: [], _solution: { guiltyName: NEW_TEXT } }, source: 'deepseek' };
  }),
  getOrCreateDailyPuzzle: vi.fn(async (mode: string, dateKey: string) => {
    h.order.push('getOrCreate');
    h.puzzles.push({
      id: `made-${dateKey}`,
      gameMode: mode,
      dateKey,
      source: 'fallback',
      data: {},
      createdAt: new Date(),
    });
    return { data: {}, source: 'fallback' };
  }),
  isAIPuzzleMode: (m: string) => ['alibi', 'spectrum', 'outcast', 'chainlink', 'impostor'].includes(m),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const find = (w: { gameMode_dateKey: { gameMode: string; dateKey: string } }) =>
    h.puzzles.find((p) => p.gameMode === w.gameMode_dateKey.gameMode && p.dateKey === w.gameMode_dateKey.dateKey) ??
    null;
  const dailyPuzzle = {
    findUnique: vi.fn(async (a: { where: { gameMode_dateKey: { gameMode: string; dateKey: string } } }) => {
      h.order.push('read-row');
      const row = find(a.where);
      return row ? { ...row } : null;
    }),
    findMany: vi.fn(async (a: { where: { gameMode: string; dateKey: { in: string[] } } }) =>
      h.puzzles
        .filter((p) => p.gameMode === a.where.gameMode && a.where.dateKey.in.includes(p.dateKey as string))
        .map((p) => ({ ...p })),
    ),
    update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
      h.order.push('update');
      h.updates.push(a);
      const row = h.puzzles.find((p) => p.id === a.where.id)!;
      Object.assign(row, a.data);
      return { ...row };
    }),
    create: vi.fn(async (a: unknown) => {
      h.creates.push(a);
      return {};
    }),
  };
  const dailyPuzzleScore = {
    findFirst: vi.fn(async (a: { where: { gameMode: string; dateKey: string } }) => {
      h.order.push('score-check');
      return h.scores.find((s) => s.gameMode === a.where.gameMode && s.dateKey === a.where.dateKey)
        ? { id: 's1' }
        : null;
    }),
    groupBy: vi.fn(async (a: { where: { gameMode: string; dateKey: { in: string[] } } }) => {
      const counts = new Map<string, number>();
      for (const s of h.scores)
        if (s.gameMode === a.where.gameMode && a.where.dateKey.in.includes(s.dateKey))
          counts.set(s.dateKey, (counts.get(s.dateKey) ?? 0) + 1);
      return [...counts].map(([dateKey, n]) => ({ dateKey, _count: { _all: n } }));
    }),
  };
  const dailyPuzzleReport = {
    groupBy: vi.fn(async () => [
      { gameMode: 'alibi', dateKey: '2026-12-10', kind: 'two-answers', _count: { _all: 2 } },
    ]),
    findMany: vi.fn(async () => [
      {
        id: 'r1',
        dateKey: '2026-12-10',
        kind: 'two-answers',
        note: 'two fit',
        updatedAt: NOW,
        user: { handle: 'ann' },
      },
    ]),
  };
  const client = {
    dailyPuzzle,
    dailyPuzzleScore,
    dailyPuzzleReport,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.order.push('tx-open');
      const tx = { dailyPuzzle, dailyPuzzleScore, $executeRaw: vi.fn() };
      h.inTx++;
      try {
        return await fn(tx);
      } finally {
        h.inTx--;
      }
    },
  };
  return { prisma: shapeChecked(client) };
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(modulePath: string, method: 'GET' | 'POST', url: string, body?: unknown) {
  const { route } = (await import(/* @vite-ignore */ modulePath)) as { route: { handlers: Record<string, Handler> } };
  const res = await route.handlers[method]!({
    request: new Request(`https://rmhstudios.com${url}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    params: {},
  });
  const text = await res.text();
  return { status: res.status, text, json: (JSON.parse(text || 'null') ?? null) as Record<string, unknown> | null };
}

const replace = (body: unknown) =>
  call('@/lib/admin/api/admin.daily-puzzles.replace.server', 'POST', '/api/admin/daily-puzzles/replace', body);
const generate = (body: unknown) =>
  call('@/lib/admin/api/admin.daily-puzzles.generate.server', 'POST', '/api/admin/daily-puzzles/generate', body);
const list = (mode: string) =>
  call('@/lib/admin/api/admin.daily-puzzles.server', 'GET', `/api/admin/daily-puzzles?mode=${mode}`);

const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};
const puzzle = (dateKey: string, over: Record<string, unknown> = {}) => ({
  id: `p-${dateKey}`,
  gameMode: 'alibi',
  dateKey,
  source: 'deepseek',
  data: { scenario: 'Old one', suspects: [], _solution: { guiltyName: OLD_TEXT } },
  createdAt: OLD_CREATED,
  ...over,
});
const saw = (dateKey: string) => ({
  gameMode: 'alibi',
  dateKey,
  seenId: `p-${dateKey}`,
  seenCreatedAt: OLD_CREATED.toISOString(),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.session = null;
  h.puzzles = [
    puzzle('2026-12-12'),
    puzzle('2026-12-11'),
    puzzle('2026-12-10'),
    puzzle('2026-12-09'),
    puzzle('2026-12-13'),
  ];
  h.scores = [];
  h.audits = [];
  h.order = [];
  h.inTx = 0;
  h.updates = [];
  h.creates = [];
  h.generated = [];
  h.onGenerate = null;
});

const stored = (dateKey: string) => h.puzzles.find((p) => p.dateKey === dateKey)!;
const untouched = () => {
  expect(h.updates).toEqual([]);
  expect(h.creates).toEqual([]);
  expect(h.audits).toEqual([]);
  expect(JSON.stringify(h.puzzles)).not.toContain(NEW_TEXT);
};

describe('admins only', () => {
  it('refuses a signed-out caller and a member on all three endpoints, and calls no model', async () => {
    for (const run of [
      () => replace(saw('2026-12-11')),
      () => generate({ gameMode: 'alibi', dateKey: '2026-12-11' }),
      () => list('alibi'),
    ]) {
      expect((await run()).status).toBe(401);
    }
    h.session = { user: { id: 'u9', isAdmin: false } };
    for (const run of [
      () => replace(saw('2026-12-11')),
      () => generate({ gameMode: 'alibi', dateKey: '2026-12-11' }),
      () => list('alibi'),
    ]) {
      expect((await run()).status).toBe(403);
    }
    expect(h.generated).toEqual([]);
    untouched();
  });
});

describe('Replace a future day', () => {
  it('updates the row in place, audits it inside the transaction and returns no puzzle text', async () => {
    admin();
    const res = await replace(saw('2026-12-11'));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, source: 'deepseek' });
    assertJsonSafe(res.json);
    expect(res.text).not.toContain(NEW_TEXT);
    expect(res.text).not.toContain(OLD_TEXT);

    const row = stored('2026-12-11');
    expect(row.id).toBe('p-2026-12-11');
    expect(JSON.stringify(row.data)).toContain(NEW_TEXT);
    expect(row.createdAt).toBe(OLD_CREATED);
    expect(h.updates).toHaveLength(1);
    expect(h.creates).toEqual([]);
    expect(h.puzzles).toHaveLength(5);

    expect(h.audits).toHaveLength(1);
    expect(h.audits[0]).toMatchObject({
      adminId: 'admin-1',
      action: 'daily-puzzle-replace',
      inTx: true,
      opts: { targetType: 'daily_puzzle', targetId: 'p-2026-12-11' },
    });
    expect(h.audits[0]!.opts.detail).toBe('alibi 2026-12-11: deepseek -> deepseek');
    expect(JSON.stringify(h.audits)).not.toContain(NEW_TEXT);
    expect(JSON.stringify(h.audits)).not.toContain(OLD_TEXT);
  });

  it('also replaces the day after tomorrow', async () => {
    admin();
    expect((await replace(saw('2026-12-12'))).status).toBe(200);
    expect(JSON.stringify(stored('2026-12-12').data)).toContain(NEW_TEXT);
  });

  it('runs the model before the transaction opens, and takes the day’s lock before any check', async () => {
    admin();
    await replace(saw('2026-12-11'));
    const at = (s: string) => h.order.indexOf(s);
    expect(at('generate')).toBeGreaterThanOrEqual(0);
    expect(at('generate')).toBeLessThan(at('tx-open'));
    expect(at('tx-open')).toBeLessThan(at('lock:daily-puzzle:alibi:2026-12-11'));
    expect(at('lock:daily-puzzle:alibi:2026-12-11')).toBeLessThan(at('score-check'));
    expect(at('lock:daily-puzzle:alibi:2026-12-11')).toBeLessThan(at('read-row'));
    expect(at('update')).toBeLessThan(at('audit'));
  });
});

describe('what is never replaced', () => {
  it('refuses today and a past day before calling the model', async () => {
    admin();
    for (const dateKey of ['2026-12-10', '2026-12-09']) {
      const res = await replace(saw(dateKey));
      expect(res.status).toBe(409);
      expect(res.json).toMatchObject({ code: 'PUZZLE_ALREADY_STARTED' });
    }
    expect(h.generated).toEqual([]);
    untouched();
  });

  it('refuses a day three days out', async () => {
    admin();
    const res = await replace(saw('2026-12-13'));
    expect(res.status).toBe(400);
    expect(h.generated).toEqual([]);
    untouched();
  });

  it('refuses a day that starts within 10 minutes', async () => {
    admin();
    vi.setSystemTime(new Date('2026-12-11T04:55:00Z'));
    const res = await replace(saw('2026-12-11'));
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'PUZZLE_ALREADY_STARTED' });
    untouched();
  });

  it('refuses a day whose margin begins while the model is still writing (the time is read inside the lock)', async () => {
    admin();
    h.onGenerate = () => vi.setSystemTime(new Date('2026-12-11T04:56:00Z'));
    const res = await replace(saw('2026-12-11'));
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'PUZZLE_ALREADY_STARTED' });
    expect(h.generated).toHaveLength(1);
    untouched();
  });

  it('refuses a future day that already has a score row', async () => {
    admin();
    h.scores.push({ gameMode: 'alibi', dateKey: '2026-12-11' });
    const res = await replace(saw('2026-12-11'));
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ code: 'PUZZLE_ALREADY_STARTED' });
    untouched();
  });

  it('ignores scores for another mode', async () => {
    admin();
    h.scores.push({ gameMode: 'spectrum', dateKey: '2026-12-11' });
    expect((await replace(saw('2026-12-11'))).status).toBe(200);
  });

  it('refuses a row that is not the one the page showed (another id or another creation time)', async () => {
    admin();
    const otherId = await replace({ ...saw('2026-12-11'), seenId: 'p-other' });
    expect(otherId.status).toBe(409);
    expect(otherId.json).toMatchObject({ code: 'PUZZLE_CHANGED' });
    const otherTime = await replace({ ...saw('2026-12-11'), seenCreatedAt: '2026-12-10T05:00:00.000Z' });
    expect(otherTime.status).toBe(409);
    expect(otherTime.json).toMatchObject({ code: 'PUZZLE_CHANGED' });
    untouched();
  });

  it('refuses a day with no row to replace, and a created-at that is not a time', async () => {
    admin();
    h.puzzles = [];
    expect((await replace(saw('2026-12-11'))).json).toMatchObject({ code: 'PUZZLE_CHANGED' });
    expect((await replace({ ...saw('2026-12-11'), seenCreatedAt: 'whenever' })).status).toBe(400);
    untouched();
  });

  it('refuses a mode no model writes', async () => {
    admin();
    expect((await replace({ ...saw('2026-12-11'), gameMode: 'lights-out' })).status).toBe(400);
    untouched();
  });
});

describe('Generate now', () => {
  it('fills a missing day among the next two and never replaces an existing row', async () => {
    admin();
    h.puzzles = h.puzzles.filter((p) => p.dateKey !== '2026-12-12');
    const made = await generate({ gameMode: 'alibi', dateKey: '2026-12-12' });
    expect(made.status).toBe(200);
    expect(made.json).toEqual({ created: true, source: 'fallback' });
    expect(h.order).toContain('getOrCreate');

    h.order = [];
    const again = await generate({ gameMode: 'alibi', dateKey: '2026-12-11' });
    expect(again.json).toEqual({ created: false, source: 'deepseek' });
    expect(h.order).not.toContain('getOrCreate');
    expect(JSON.stringify(stored('2026-12-11').data)).toContain(OLD_TEXT);
  });

  it('refuses today, a past day and a day three days out', async () => {
    admin();
    for (const dateKey of ['2026-12-10', '2026-12-09', '2026-12-13']) {
      expect((await generate({ gameMode: 'alibi', dateKey })).status).toBe(400);
    }
    expect(h.order).not.toContain('getOrCreate');
  });
});

describe('the admin read', () => {
  it('lists today, the next two days and the last seven with answers, reports and what may be replaced', async () => {
    admin();
    h.scores.push({ gameMode: 'alibi', dateKey: '2026-12-10' }, { gameMode: 'alibi', dateKey: '2026-12-10' });
    const res = await list('alibi');
    expect(res.status).toBe(200);
    assertJsonSafe(res.json);
    const body = res.json as {
      today: string;
      days: {
        dateKey: string;
        relation: string;
        scoreCount: number;
        replaceable: boolean;
        generatable: boolean;
        puzzle: { answerText: string } | null;
        reportCounts: Record<string, number>;
        reports: { handle: string | null; note: string | null }[];
      }[];
    };
    expect(body.today).toBe('2026-12-10');
    expect(body.days.map((d) => d.dateKey)).toEqual([
      '2026-12-12',
      '2026-12-11',
      '2026-12-10',
      '2026-12-09',
      '2026-12-08',
      '2026-12-07',
      '2026-12-06',
      '2026-12-05',
      '2026-12-04',
      '2026-12-03',
    ]);
    const by = Object.fromEntries(body.days.map((d) => [d.dateKey, d]));
    expect(by['2026-12-11']).toMatchObject({ relation: 'future', replaceable: true, generatable: false });
    expect(by['2026-12-11']!.puzzle!.answerText).toContain(OLD_TEXT);
    expect(by['2026-12-10']).toMatchObject({ relation: 'today', replaceable: false, scoreCount: 2 });
    expect(by['2026-12-10']!.reportCounts).toMatchObject({ 'two-answers': 2 });
    expect(by['2026-12-10']!.reports[0]).toMatchObject({ handle: 'ann', note: 'two fit' });
    expect(by['2026-12-08']).toMatchObject({ puzzle: null, generatable: false });
  });

  it('offers Generate now for a missing day inside the window and no Replace once it is scored', async () => {
    admin();
    h.puzzles = h.puzzles.filter((p) => p.dateKey !== '2026-12-12');
    h.scores.push({ gameMode: 'alibi', dateKey: '2026-12-11' });
    const body = (await list('alibi')).json as {
      days: { dateKey: string; replaceable: boolean; generatable: boolean }[];
    };
    const by = Object.fromEntries(body.days.map((d) => [d.dateKey, d]));
    expect(by['2026-12-12']).toMatchObject({ generatable: true, replaceable: false });
    expect(by['2026-12-11']).toMatchObject({ replaceable: false });
  });

  it('refuses a mode that is not model-written', async () => {
    admin();
    expect((await list('lights-out')).status).toBe(400);
  });
});
