/**
 * s12-14 admin deletions, through the real endpoint wrapper with Prisma and the erasure stood in for by fakes: admins
 * only; the overdue rule; a retry on an account that is not overdue is refused and writes nothing; a retry is audited
 * inside the claim's transaction; no response carries an e-mail address or an error message.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OVERDUE_AFTER_MS, isOverdue } from '@/lib/admin/deletions';

type Row = Record<string, unknown>;
const NOW = new Date('2026-12-05T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const h = vi.hoisted(() => ({
  session: null as { user: { id: string; isAdmin: boolean } } | null,
  users: [] as Row[],
  holds: [] as Row[],
  attempts: [] as Row[],
  audits: [] as { adminId: string; action: string; opts: Record<string, unknown>; inTx: boolean }[],
  inTx: false,
  claimed: [] as string[],
  held: false,
  erasure: { ok: true } as { ok: true } | { ok: false; errorName: string },
  ran: [] as string[],
}));

vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/admin-audit.server', () => ({
  recordAdminActionIn: vi.fn(async (_tx: unknown, adminId: string, action: string, opts: Record<string, unknown>) => {
    h.audits.push({ adminId, action, opts, inTx: h.inTx });
  }),
}));

// The claim and the erasure are exercised in lib/account/__tests__/erasure-attempts.test.ts.
vi.mock('@/lib/account/deletion.server', () => ({
  DELETION_GRACE_DAYS: 30,
  ERASURE_CLAIM_WINDOW_MS: 15 * 60 * 1000,
  claimErasure: vi.fn(
    async (
      userId: string,
      trigger: string,
      opts: { inTx?: (tx: unknown) => Promise<void> },
    ): Promise<bigint | null> => {
      if (h.held) return null;
      h.inTx = true;
      try {
        await opts.inTx?.({
          user: {
            findUnique: async (a: { where: { id: string } }) => h.users.find((u) => u.id === a.where.id) ?? null,
          },
        });
      } finally {
        h.inTx = false;
      }
      h.claimed.push(`${userId}:${trigger}`);
      return 7n;
    },
  ),
  runClaimedErasure: vi.fn(async (_id: bigint, userId: string) => {
    h.ran.push(userId);
    return h.erasure;
  }),
}));

function inRange(v: Date, f: { gte?: Date; lt?: Date }): boolean {
  return (!f.gte || v.getTime() >= f.gte.getTime()) && (!f.lt || v.getTime() < f.lt.getTime());
}
vi.mock('@/lib/prisma.server', () => {
  const users = (a: { where: { deletionScheduledAt: { gte?: Date; lt?: Date } } }) =>
    h.users.filter(
      (u) =>
        u.deletionScheduledAt instanceof Date &&
        u.banReason !== 'DELETED_ACCOUNT' &&
        inRange(u.deletionScheduledAt, a.where.deletionScheduledAt),
    );
  return {
    prisma: {
      user: {
        count: vi.fn(async (a: never) => users(a).length),
        findMany: vi.fn(async (a: never) =>
          users(a).map((u) => ({ id: u.id, handle: u.handle, deletionScheduledAt: u.deletionScheduledAt })),
        ),
      },
      deletionHold: { findMany: vi.fn(async () => h.holds) },
      accountErasureAttempt: {
        findMany: vi.fn(async (a: { where: { ok?: boolean; userId?: unknown } }) =>
          a.where.ok === true
            ? h.attempts.filter((r) => r.ok === true)
            : [...h.attempts].sort((x, y) => (y.startedAt as Date).getTime() - (x.startedAt as Date).getTime()),
        ),
      },
    },
  };
});

vi.mock('@/lib/account-lifecycle', () => ({
  DELETED_ACCOUNT_BAN_REASON: 'DELETED_ACCOUNT',
  isDeletedAccount: (u: { banReason?: string | null }) => u.banReason === 'DELETED_ACCOUNT',
}));

type Handler = (a: { request: Request; params: Record<string, string> }) => Promise<Response>;
async function call(method: 'GET' | 'POST', userId?: string) {
  const mod = userId
    ? await import('@/lib/admin/api/admin.deletions.$userId.retry.server')
    : await import('@/lib/admin/api/admin.deletions.server');
  const handlers = mod.route.handlers as Record<string, Handler>;
  const res = await handlers[method]!({
    request: new Request('https://rmhstudios.com/api/admin/deletions', {
      method,
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': `${Math.random()}`,
        cookie: 'better-auth.session_token=abc',
      },
    }),
    params: userId ? { userId } : {},
  });
  const text = await res.text();
  return { status: res.status, text, json: (JSON.parse(text || 'null') ?? null) as Record<string, unknown> | null };
}
const admin = () => {
  h.session = { user: { id: 'admin-1', isAdmin: true } };
};
const user = (id: string, dueMsAgo: number, over: Row = {}): Row => ({
  id,
  handle: `h-${id}`,
  email: `${id}@example.test`,
  banReason: null,
  deletionScheduledAt: new Date(NOW.getTime() - dueMsAgo),
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  h.session = null;
  h.users = [user('wait-1', -5 * DAY), user('over-1', 2 * DAY), user('due-1', 60 * 60 * 1000)];
  h.holds = [
    {
      userId: 'wait-1',
      keyIds: ['k1', 'k2'],
      webhookIds: ['w1'],
      subscriptionIds: ['s1'],
      billingSyncedAt: new Date(NOW.getTime() - 24 * DAY),
      createdAt: new Date(NOW.getTime() - 25 * DAY),
    },
    // Synced with nothing recorded: there was nothing to stop.
    {
      userId: 'over-1',
      keyIds: [],
      webhookIds: [],
      subscriptionIds: [],
      billingSyncedAt: new Date(NOW.getTime() - 3 * DAY),
      createdAt: new Date(NOW.getTime() - 33 * DAY),
    },
  ];
  h.attempts = [
    {
      userId: 'over-1',
      startedAt: new Date(NOW.getTime() - DAY),
      finishedAt: new Date(NOW.getTime() - DAY),
      ok: false,
      errorName: 'P2003',
    },
    {
      userId: 'over-1',
      startedAt: new Date(NOW.getTime() - 2 * DAY),
      finishedAt: new Date(NOW.getTime() - 2 * DAY),
      ok: false,
      errorName: 'P2003',
    },
    {
      userId: 'gone-1',
      startedAt: new Date(NOW.getTime() - 3 * DAY),
      finishedAt: new Date(NOW.getTime() - 3 * DAY),
      ok: true,
      errorName: null,
    },
  ];
  h.audits = [];
  h.claimed = [];
  h.held = false;
  h.erasure = { ok: true };
  h.ran = [];
});

describe('overdue rule', () => {
  it('is due more than 24 hours ago, never for an unscheduled account', () => {
    expect(isOverdue(null, NOW)).toBe(false);
    expect(isOverdue(new Date(NOW.getTime() + DAY), NOW)).toBe(false);
    expect(isOverdue(new Date(NOW.getTime() - OVERDUE_AFTER_MS), NOW)).toBe(false);
    expect(isOverdue(new Date(NOW.getTime() - OVERDUE_AFTER_MS - 1), NOW)).toBe(true);
  });
});

describe('admin only', () => {
  it('refuses a signed-out caller and a member on both endpoints', async () => {
    expect((await call('GET')).status).toBe(401);
    h.session = { user: { id: 'u9', isAdmin: false } };
    expect((await call('GET')).status).toBe(403);
    expect((await call('POST', 'over-1')).status).toBe(403);
    expect(h.claimed).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});

describe('GET /api/admin/deletions', () => {
  it('lists waiting and overdue rows, the hold counts, attempts and the per-day finished count', async () => {
    admin();
    const out = await call('GET');
    expect(out.status).toBe(200);
    const body = out.json as {
      waiting: Row[];
      overdue: Row[];
      waitingTotal: number;
      overdueTotal: number;
      finished: { day: string; count: number }[];
      finishedTotal: number;
    };
    // Due an hour ago is still waiting: overdue is more than 24 hours.
    expect(body.waiting.map((r) => r.userId)).toEqual(expect.arrayContaining(['wait-1', 'due-1']));
    expect(body.waitingTotal).toBe(2);
    const wait = body.waiting.find((r) => r.userId === 'wait-1')!;
    expect(wait).toMatchObject({ handle: 'h-wait-1', held: { keys: 2, webhooks: 1, subscriptions: 1 } });
    expect(body.overdue).toHaveLength(1);
    expect(body.overdue[0]).toMatchObject({ userId: 'over-1', attempts: 2, lastErrorName: 'P2003', running: false });
    expect(body.finished).toHaveLength(30);
    expect(body.finished.at(-1)!.day).toBe('2026-12-05');
    expect(body.finishedTotal).toBe(1);
    expect(body.finished.find((d) => d.day === '2026-12-02')!.count).toBe(1);
  });

  it('says whether the billing of each pending account has stopped, from the hold alone', async () => {
    admin();
    h.holds.push({
      userId: 'due-1',
      keyIds: [],
      webhookIds: [],
      subscriptionIds: ['s9'],
      billingSyncedAt: null,
      createdAt: new Date(NOW.getTime() - 2 * DAY),
    });
    const body = (await call('GET')).json as { waiting: Row[]; overdue: Row[] };
    const billing = (rows: Row[], id: string) => rows.find((r) => r.userId === id)?.billing;
    expect(billing(body.waiting, 'wait-1')).toBe('stopped');
    expect(billing(body.overdue, 'over-1')).toBe('none');
    expect(billing(body.waiting, 'due-1')).toBe('pending');
  });

  it('shows no hold at all as not stopped yet, and exposes no subscription id', async () => {
    admin();
    h.holds = [];
    const out = await call('GET');
    const body = out.json as { waiting: Row[] };
    expect(body.waiting.every((r) => r.billing === 'pending')).toBe(true);
    expect(out.text).not.toMatch(/"s1"|"s9"|subscriptionIds/);
  });

  it('carries no e-mail address', async () => {
    admin();
    const out = await call('GET');
    expect(out.text).not.toMatch(/example\.test|@|email/i);
  });
});

describe('POST /api/admin/deletions/$userId/retry', () => {
  it('erases an overdue account, audited inside the claim transaction', async () => {
    admin();
    const out = await call('POST', 'over-1');
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ erased: true, errorName: null });
    expect(h.claimed).toEqual(['over-1:admin']);
    expect(h.ran).toEqual(['over-1']);
    expect(h.audits).toEqual([
      {
        adminId: 'admin-1',
        action: 'account.erasure.retry',
        opts: { targetType: 'user', targetId: 'over-1' },
        inTx: true,
      },
    ]);
  });

  it('answers a failed erasure with the error name only', async () => {
    admin();
    h.erasure = { ok: false, errorName: 'P2003' };
    const out = await call('POST', 'over-1');
    expect(out.status).toBe(200);
    expect(out.json).toEqual({ erased: false, errorName: 'P2003' });
  });

  it('refuses an account still in its grace period, or only just due: there is no delete now', async () => {
    admin();
    for (const id of ['wait-1', 'due-1']) {
      const out = await call('POST', id);
      expect(out.status).toBe(409);
      expect(out.json).toMatchObject({ code: 'ERASURE_NOT_OVERDUE' });
    }
    expect(h.ran).toEqual([]);
    expect(h.audits).toEqual([]);
    expect(h.claimed).toEqual([]);
  });

  it('refuses an unknown account and a tombstone', async () => {
    admin();
    h.users.push(user('tomb-1', 5 * DAY, { banReason: 'DELETED_ACCOUNT' }));
    expect((await call('POST', 'nobody')).json).toMatchObject({ code: 'ERASURE_NOT_OVERDUE' });
    expect((await call('POST', 'tomb-1')).json).toMatchObject({ code: 'ERASURE_NOT_OVERDUE' });
    expect(h.ran).toEqual([]);
  });

  it('refuses with ERASURE_IN_PROGRESS while the claim is held', async () => {
    admin();
    h.held = true;
    const out = await call('POST', 'over-1');
    expect(out.status).toBe(409);
    expect(out.json).toMatchObject({ code: 'ERASURE_IN_PROGRESS' });
    expect(h.ran).toEqual([]);
    expect(h.audits).toEqual([]);
  });
});
