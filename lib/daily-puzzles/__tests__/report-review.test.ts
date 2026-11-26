/**
 * s15-07 an admin's review of a mode-day's puzzle reports: one conditional claim per report, one notice per claimed
 * reporter, a second review changes and sends nothing, a later report on a reviewed day is stored reviewed with the
 * outcome answered at once and no notice, the notice carries no answer, the audit row, and the export. Prisma is an
 * in-memory fake wrapped in `shapeChecked`; the real `PUT /api/daily-puzzles/report` and review modules run on it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { assertJsonSafe } from '@/lib/db/query-shape';
import { NOTICE_TEMPLATES, noticeParamNames } from '@/lib/notifications/notice-keys';

type Row = Record<string, unknown> & { id: string; userId: string; gameMode: string; dateKey: string };
type Key = { userId: string; gameMode: string; dateKey: string };

const NOW = new Date('2026-12-10T15:00:00Z'); // the puzzle day is 2026-12-10 in New York
const SECRET_ANSWER = 'THE-GARDENER-DID-IT';

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  scores: [] as { userId: string; gameMode: string; dateKey: string }[],
  reports: [] as Record<string, unknown>[],
  nextId: 1,
  claims: [] as { where: Record<string, unknown>; count: number }[],
  audits: [] as { adminId: string; action: string; opts: Record<string, string | undefined>; inTx: boolean }[],
  locks: [] as string[],
  notices: [] as Record<string, unknown>[],
  failNoticeFor: null as string | null,
  inTx: 0,
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, string>) => {
    h.audits.push({ adminId, action, opts, inTx: h.inTx > 0 });
  }),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.locks.push(key);
  }),
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    if (input.userId === h.failNoticeFor) throw new Error('push is down');
    h.notices.push(input);
  }),
}));

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const rows = () => h.reports as Row[];
  const sameKey = (r: Row, k: Key) => r.userId === k.userId && r.gameMode === k.gameMode && r.dateKey === k.dateKey;
  const dailyPuzzleScore = {
    findUnique: vi.fn(async (a: { where: { userId_gameMode_dateKey: Key } }) =>
      h.scores.find((s) => sameKey(s as Row, a.where.userId_gameMode_dateKey)) ? { id: 'score-1' } : null,
    ),
  };
  const dailyPuzzleReport = {
    findFirst: vi.fn(
      async (a: {
        where: { gameMode: string; dateKey: string; reviewedAt: { not: null } };
        orderBy: { reviewedAt: 'desc' };
      }) => {
        const hits = rows()
          .filter((r) => r.gameMode === a.where.gameMode && r.dateKey === a.where.dateKey && r.reviewedAt != null)
          .sort((x, y) => (y.reviewedAt as Date).getTime() - (x.reviewedAt as Date).getTime());
        const r = hits[0];
        return r ? { reviewedAt: r.reviewedAt, reviewOutcome: r.reviewOutcome, reviewNote: r.reviewNote } : null;
      },
    ),
    findMany: vi.fn(async (a: { where: Record<string, unknown>; take?: number; select?: Record<string, boolean> }) => {
      const w = a.where as {
        userId?: string;
        gameMode?: string;
        dateKey?: string | { in: string[] };
        reviewedAt?: null;
      };
      const out = rows().filter(
        (r) =>
          (w.userId === undefined || r.userId === w.userId) &&
          (w.gameMode === undefined || r.gameMode === w.gameMode) &&
          (w.dateKey === undefined || typeof w.dateKey !== 'string' || r.dateKey === w.dateKey) &&
          (w.reviewedAt === undefined || r.reviewedAt == null),
      );
      const picked = out.slice(0, a.take ?? out.length);
      if (!a.select) return picked;
      return picked.map((r) => {
        const o: Record<string, unknown> = Object.fromEntries(Object.keys(a.select!).map((k) => [k, r[k]]));
        if (a.select!.user) o.user = { handle: `h-${r.userId}` };
        return o;
      });
    }),
    updateMany: vi.fn(async (a: { where: { id: string; reviewedAt: null }; data: Record<string, unknown> }) => {
      const row = rows().find((r) => r.id === a.where.id && r.reviewedAt == null);
      if (!row) {
        h.claims.push({ where: a.where, count: 0 });
        return { count: 0 };
      }
      Object.assign(row, a.data);
      h.claims.push({ where: a.where, count: 1 });
      return { count: 1 };
    }),
    upsert: vi.fn(
      async (a: {
        where: { userId_gameMode_dateKey: Key };
        create: Record<string, unknown>;
        update: Record<string, unknown>;
      }) => {
        const hit = rows().find((r) => sameKey(r, a.where.userId_gameMode_dateKey));
        if (hit) return Object.assign(hit, a.update, { updatedAt: new Date() });
        const row = { id: `r${h.nextId++}`, ...a.create, createdAt: new Date(), updatedAt: new Date() };
        h.reports.push(row);
        return row;
      },
    ),
  };
  const client = {
    dailyPuzzleScore,
    dailyPuzzleReport,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      h.inTx++;
      try {
        return await fn({ dailyPuzzleReport });
      } finally {
        h.inTx--;
      }
    },
  };
  return { prisma: shapeChecked(client) };
});

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;

async function call(modulePath: string, method: string, url: string, body: unknown) {
  const { route } = (await import(/* @vite-ignore */ modulePath)) as { route: { handlers: Record<string, Handler> } };
  const res = await route.handlers[method]!({
    request: new Request(`https://rmhstudios.com${url}`, {
      method,
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

const putReport = (body: unknown) =>
  call('@/lib/daily-puzzles/api/daily-puzzles.report.server', 'PUT', '/api/daily-puzzles/report', body);
const postReview = (body: unknown) =>
  call('@/lib/admin/api/admin.daily-puzzles.review.server', 'POST', '/api/admin/daily-puzzles/review', body);

const asMember = (id: string) => {
  h.session = { user: { id, isAdmin: false } };
};
const asAdmin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};
const open = (userId: string, over: Record<string, unknown> = {}) => {
  h.reports.push({
    id: `r${h.nextId++}`,
    userId,
    gameMode: 'alibi',
    dateKey: '2026-12-10',
    kind: 'two-answers',
    note: null,
    createdAt: NOW,
    updatedAt: NOW,
    reviewedAt: null,
    reviewOutcome: null,
    reviewNote: null,
    ...over,
  });
};
const review = (over: Record<string, unknown> = {}) => ({
  gameMode: 'alibi',
  dateKey: '2026-12-10',
  outcome: 'stands',
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.session = null;
  h.scores = [];
  h.reports = [];
  h.nextId = 1;
  h.claims = [];
  h.audits = [];
  h.locks = [];
  h.notices = [];
  h.failNoticeFor = null;
  h.inTx = 0;
});

describe('who may review', () => {
  it('refuses a signed-out caller and a member who is not an admin, and writes nothing', async () => {
    open('u1');
    expect((await postReview(review())).status).toBe(401);
    asMember('u2');
    expect((await postReview(review())).status).toBe(403);
    expect(h.claims).toEqual([]);
    expect(h.notices).toEqual([]);
    expect(h.reports[0]!.reviewedAt).toBeNull();
  });

  it('refuses an unknown outcome, an over-long note, a non-AI mode and a malformed day', async () => {
    asAdmin();
    open('u1');
    expect((await postReview(review({ outcome: 'shrug' }))).status).toBe(400);
    expect((await postReview(review({ note: 'x'.repeat(301) }))).status).toBe(400);
    expect((await postReview(review({ gameMode: 'lights-out' }))).status).toBe(400);
    expect((await postReview(review({ dateKey: 'yesterday' }))).status).toBe(400);
    expect(h.notices).toEqual([]);
  });
});

describe('one review', () => {
  it('claims each open report once, tells each reporter once and audits one row inside the transaction', async () => {
    asAdmin();
    open('u1');
    open('u2');
    open('u3', { gameMode: 'spectrum' }); // another mode: untouched
    open('u4', { dateKey: '2026-12-09' }); // another day: untouched
    const res = await postReview(review({ outcome: 'fault', note: '  Both answers fit. Fixed for next time.  ' }));
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, reviewed: 2 });
    assertJsonSafe(res.json);

    const [a, b, c, d] = h.reports;
    expect(a).toMatchObject({ reviewOutcome: 'fault', reviewNote: 'Both answers fit. Fixed for next time.' });
    expect(a!.reviewedAt).toBeInstanceOf(Date);
    expect(b).toMatchObject({ reviewOutcome: 'fault' });
    expect(c!.reviewedAt).toBeNull();
    expect(d!.reviewedAt).toBeNull();

    // Every claim repeats the `reviewedAt: null` condition.
    expect(h.claims).toHaveLength(2);
    for (const claim of h.claims) expect(claim.where).toMatchObject({ reviewedAt: null });

    expect(h.notices.map((n) => n.userId)).toEqual(['u1', 'u2']);
    expect(h.locks).toEqual(['daily-puzzle-report:alibi:2026-12-10']);
    expect(h.audits).toEqual([
      {
        adminId: 'admin-1',
        action: 'daily-puzzle-report-review',
        opts: {
          targetType: 'daily_puzzle',
          targetId: 'alibi:2026-12-10',
          detail: 'alibi 2026-12-10: fault, 2 reports',
        },
        inTx: true,
      },
    ]);
  });

  it('writes the notice as a system key with the mode, day, outcome and note, linking to the puzzle', async () => {
    asAdmin();
    open('u1');
    await postReview(review({ note: 'Checked twice.' }));
    expect(h.notices).toHaveLength(1);
    const n = h.notices[0] as {
      type: string;
      entityType: string;
      entityId: string;
      link: string;
      preview: { key: string; params: Record<string, unknown>; fallback: string };
    };
    expect(n).toMatchObject({ type: 'SYSTEM', entityType: 'puzzle_report', entityId: 'r1', link: '/daily/alibi' });
    expect(n.preview.key).toBe('puzzle-report-reviewed');
    expect(n.preview.params).toEqual({
      mode: 'alibi',
      dateKey: '2026-12-10',
      outcome: 'stands',
      note: 'Checked twice.',
    });
    expect(n.preview.fallback).toBe(
      'Your report on the alibi puzzle for 2026-12-10: We checked the puzzle and its answer stands. Checked twice.',
    );
    // The template names exactly the slots the params fill.
    for (const name of noticeParamNames(NOTICE_TEMPLATES['puzzle-report-reviewed'])) {
      expect(n.preview.params).toHaveProperty(name);
    }
  });

  it('stores a blank note as null and sends an empty note param', async () => {
    asAdmin();
    open('u1');
    await postReview(review({ note: '   ' }));
    expect(h.reports[0]!.reviewNote).toBeNull();
    expect((h.notices[0]!.preview as { params: Record<string, unknown> }).params.note).toBe('');
  });

  it('holds no answer field: the params are mode, dateKey, outcome and note, and the puzzle is never read', async () => {
    asAdmin();
    open('u1', { note: `it is ${SECRET_ANSWER}` });
    await postReview(review({ outcome: 'fault' }));
    const preview = h.notices[0]!.preview as { params: Record<string, unknown>; fallback: string };
    expect(Object.keys(preview.params).sort()).toEqual(['dateKey', 'mode', 'note', 'outcome']);
    expect(JSON.stringify(h.notices)).not.toContain(SECRET_ANSWER);
  });

  it('is a no-op when nothing is open: no claim, no notice, no audit row', async () => {
    asAdmin();
    const res = await postReview(review());
    expect(res.json).toEqual({ ok: true, reviewed: 0 });
    expect(h.claims).toEqual([]);
    expect(h.notices).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('keeps the review when a notice fails, and still tells the others', async () => {
    asAdmin();
    open('u1');
    open('u2');
    h.failNoticeFor = 'u1';
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await postReview(review());
    expect(res.json).toEqual({ ok: true, reviewed: 2 });
    expect(h.notices.map((n) => n.userId)).toEqual(['u2']);
    expect(h.reports.every((r) => r.reviewedAt != null)).toBe(true);
    spy.mockRestore();
  });
});

describe('a second review', () => {
  it('claims nothing, changes nothing and tells nobody', async () => {
    asAdmin();
    open('u1');
    open('u2');
    await postReview(review({ outcome: 'stands', note: 'first' }));
    const stored = structuredClone(h.reports);
    h.notices = [];
    h.audits = [];
    const again = await postReview(review({ outcome: 'fault', note: 'second' }));
    expect(again.json).toEqual({ ok: true, reviewed: 0 });
    expect(h.reports).toEqual(stored);
    expect(h.notices).toEqual([]);
    expect(h.audits).toEqual([]);
  });

  it('loses a race cleanly: a report claimed between the read and the update is not told twice', async () => {
    asAdmin();
    open('u1');
    open('u2');
    // The first claim finds the row already reviewed (another admin got there between the read and the update).
    h.reports[0]!.reviewedAt = new Date('2026-12-10T14:59:00Z');
    h.reports[0]!.reviewOutcome = 'fault';
    // A reader that still sees it open: re-open it for the read only.
    const { prisma } = await import('@/lib/prisma.server');
    const spy = vi.spyOn(prisma.dailyPuzzleReport, 'findMany').mockImplementationOnce((() =>
      Promise.resolve([
        { id: 'r1', userId: 'u1' },
        { id: 'r2', userId: 'u2' },
      ])) as unknown as typeof prisma.dailyPuzzleReport.findMany);
    const res = await postReview(review());
    expect(res.json).toEqual({ ok: true, reviewed: 1 });
    expect(h.notices.map((n) => n.userId)).toEqual(['u2']);
    expect(h.reports[0]).toMatchObject({ reviewOutcome: 'fault' });
    spy.mockRestore();
  });
});

describe('a report on a reviewed day', () => {
  it('answers the outcome at once, stores the row already reviewed and sends no notice', async () => {
    asAdmin();
    open('u1');
    await postReview(review({ outcome: 'fault', note: 'We fixed it.' }));
    h.notices = [];

    asMember('u9');
    h.scores.push({ userId: 'u9', gameMode: 'alibi', dateKey: '2026-12-10' });
    const res = await putReport({ gameMode: 'alibi', dateKey: '2026-12-10', kind: 'unclear' });
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true, review: { outcome: 'fault', note: 'We fixed it.' } });
    assertJsonSafe(res.json);
    const stored = h.reports.find((r) => r.userId === 'u9')!;
    expect(stored).toMatchObject({ reviewOutcome: 'fault', reviewNote: 'We fixed it.', kind: 'unclear' });
    expect(stored.reviewedAt).toBeInstanceOf(Date);
    expect(h.notices).toEqual([]);

    // It never reopens the day: a further review finds nothing open.
    asAdmin();
    expect((await postReview(review())).json).toEqual({ ok: true, reviewed: 0 });
    expect(h.notices).toEqual([]);
  });

  it('keeps the review of a row the member re-sends, and answers with the day’s outcome', async () => {
    asAdmin();
    open('u1');
    await postReview(review({ outcome: 'stands' }));
    asMember('u1');
    h.scores.push({ userId: 'u1', gameMode: 'alibi', dateKey: '2026-12-10' });
    const res = await putReport({ gameMode: 'alibi', dateKey: '2026-12-10', kind: 'other', note: 'more' });
    expect(res.json).toEqual({ ok: true, review: { outcome: 'stands', note: null } });
    expect(h.reports[0]).toMatchObject({ kind: 'other', note: 'more', reviewOutcome: 'stands' });
  });

  it('answers a plain ok, with no review, on a day nobody reviewed', async () => {
    asMember('u1');
    h.scores.push({ userId: 'u1', gameMode: 'alibi', dateKey: '2026-12-10' });
    const res = await putReport({ gameMode: 'alibi', dateKey: '2026-12-10', kind: 'other' });
    expect(res.json).toEqual({ ok: true });
    expect(h.reports[0]!.reviewedAt ?? null).toBeNull();
  });
});

describe('the export', () => {
  it('carries the review fields of a member’s reports', async () => {
    asAdmin();
    open('u1');
    await postReview(review({ outcome: 'fault', note: 'Thanks.' }));
    const { exportPuzzleReports } = await import('@/lib/daily-puzzles/reports.server');
    const out = await exportPuzzleReports('u1');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      gameMode: 'alibi',
      dateKey: '2026-12-10',
      reviewOutcome: 'fault',
      reviewNote: 'Thanks.',
      reviewedAt: NOW.toISOString(),
    });
    assertJsonSafe(out);
  });

  it('exports null review fields for an open report', async () => {
    open('u1');
    const { exportPuzzleReports } = await import('@/lib/daily-puzzles/reports.server');
    const [row] = await exportPuzzleReports('u1');
    expect(row).toMatchObject({ reviewedAt: null, reviewOutcome: null, reviewNote: null });
  });
});
