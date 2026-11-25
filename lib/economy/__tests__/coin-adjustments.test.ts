/**
 * Ledgered admin coin adjustments (s04-06). Runs the REAL ledger (`ledger-core`)
 * against an in-memory Prisma stand-in with real rollback semantics, so the money
 * properties are the ledger's own: one ADMIN row per adjustment, no overdraw,
 * one apply per idempotency key, one reversal per adjustment, and
 * `reconcileUser` balanced throughout.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeLedger, Table, makeTransaction } from './fake-db';

const h = vi.hoisted(() => ({
  tables: {} as Record<string, unknown>,
  client: {} as Record<string, unknown>,
  getSession: vi.fn(),
  notify: vi.fn(async () => {}),
  audit: vi.fn(async () => {}),
}));

// Every query is checked against the schema before the in-memory tables see it.
vi.mock('@/lib/prisma.server', async () => ({
  prisma: (await import('./fake-db')).checkedDb(h.client),
}));
vi.mock('@/lib/db/advisory-lock.server', () => ({ lockKey: vi.fn(async () => {}) }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/admin-audit.server', () => ({ recordAdminActionIn: h.audit }));
vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: (...a: unknown[]) => h.getSession(...a) } },
}));

import { DELETED_USER_ID } from '@/lib/account/deleted-user';
import { reconcileUser, debitCoins } from '@/lib/economy/ledger.server';
import { adjustCoins, listAdjustments, reverseAdjustment } from '@/lib/economy/adjustments.server';
import { route as collection } from '@/lib/admin/api/admin.users.$id.coins.server';
import { route as reverseRoute } from '@/lib/admin/api/admin.users.$id.coins.$adjustmentId.reverse.server';

const users = new Table();
const profiles = new Table({ unique: [['userId']] });
const ledgerRows = new Table({ unique: [['idempotencyKey']] });
const adjustments = new Table({
  unique: [['transactionId']],
  defaults: () => ({ createdAt: new Date(), reversesId: null, reversedById: null, note: null }),
});
const all = [users, profiles, ledgerRows, adjustments];

/** Install the Prisma stand-in once; each test resets the tables. */
const client = h.client as Record<string, unknown>;
client.user = users.api;
// No member here has a play-limits row, so the ledger's spending-budget check finds no budget.
client.userPlayLimits = new Table().api;
client.coinAdjustment = adjustments.api;
client.coinTransaction = {
  ...ledgerRows.api,
  aggregate: async ({ where }: { where: Record<string, unknown> }) => ({
    _sum: {
      amount: ledgerRows.rows
        .filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
        .reduce((n, r) => n + Number(r.amount), 0),
    },
  }),
};
client.userProfile = {
  ...profiles.api,
  upsert: async ({
    where,
    create,
    update,
  }: {
    where: { userId: string };
    create: Record<string, unknown>;
    update: Record<string, unknown>;
  }) => {
    const hit = await profiles.api.findUnique({ where });
    if (hit) {
      if (Object.keys(update).length) await profiles.api.updateMany({ where, data: update });
      return { userId: where.userId };
    }
    profiles.insert(create);
    return { userId: where.userId };
  },
};
client.$transaction = makeTransaction(all, new FakeLedger(), () => client);

const ADMIN = 'admin-1';
const MEMBER = 'member-1';
const key = (n: number) => `key-${String(n).padStart(8, '0')}`;
const balance = () => Number(profiles.rows.find((r) => r.userId === MEMBER)?.coins ?? 0);
const credit = (amount: number, k = key(1), reason: 'goodwill' | 'correction' = 'goodwill') =>
  adjustCoins({ adminId: ADMIN, userId: MEMBER, direction: 'add', amount, reason, key: k });
const debit = (amount: number, k = key(2)) =>
  adjustCoins({ adminId: ADMIN, userId: MEMBER, direction: 'remove', amount, reason: 'exploit_clawback', key: k });

beforeEach(() => {
  all.forEach((t) => t.reset());
  h.notify.mockClear();
  h.audit.mockClear();
  users.insert({ id: ADMIN, name: 'Root', banReason: null });
  users.insert({ id: MEMBER, name: 'Ada', banReason: null });
  profiles.insert({ userId: MEMBER, coins: 10 });
});

describe('adjustCoins', () => {
  it('a credit writes one ADMIN ledger row and keeps the ledger balanced', async () => {
    const out = await credit(500);
    expect(out).toMatchObject({ status: 'ok', replayed: false, balance: 510 });
    expect(ledgerRows.rows).toHaveLength(1);
    expect(ledgerRows.rows[0]).toMatchObject({
      type: 'ADMIN',
      senderId: null,
      recipientId: MEMBER,
      amount: 500,
      entityType: 'coin_adjustment',
      note: 'Adjustment · goodwill',
      idempotencyKey: `coin-adjustment:${key(1)}`,
    });
    expect(adjustments.rows).toHaveLength(1);
    expect(adjustments.rows[0]).toMatchObject({
      userId: MEMBER,
      adminId: ADMIN,
      delta: 500,
      reason: 'goodwill',
      transactionId: ledgerRows.rows[0]!.id,
    });
    expect(ledgerRows.rows[0]!.entityId).toBe(adjustments.rows[0]!.id);
    expect(await reconcileUser(MEMBER)).toMatchObject({ ok: true, drift: 0, balance: 510 });
  });

  it('a debit writes one ADMIN sink row and keeps the ledger balanced', async () => {
    await credit(500);
    const out = await debit(200);
    expect(out).toMatchObject({ status: 'ok', balance: 310 });
    expect(ledgerRows.rows).toHaveLength(2);
    expect(ledgerRows.rows[1]).toMatchObject({ type: 'ADMIN', senderId: MEMBER, recipientId: null, amount: 200 });
    expect(adjustments.rows[1]).toMatchObject({ delta: -200, reason: 'exploit_clawback' });
    expect(await reconcileUser(MEMBER)).toMatchObject({ ok: true, balance: 310 });
  });

  it('audits the change and tells the member without naming the admin or the note', async () => {
    await credit(500);
    expect(h.audit).toHaveBeenCalledWith(
      expect.anything(),
      ADMIN,
      'coins.adjust',
      expect.objectContaining({ targetType: 'user', targetId: MEMBER }),
    );
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: MEMBER,
        link: '/wallet',
        preview: expect.objectContaining({ fallback: 'RMH Studios added 500 coins: goodwill' }),
      }),
    );
  });

  it('refuses a debit below zero and moves nothing', async () => {
    const out = await debit(11);
    expect(out).toEqual({ status: 'insufficient', balance: 10 });
    expect(balance()).toBe(10);
    expect(ledgerRows.rows).toHaveLength(0);
    expect(adjustments.rows).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('applies the same idempotency key once', async () => {
    const first = await credit(500, key(7));
    const second = await credit(500, key(7));
    expect(second).toMatchObject({ status: 'ok', replayed: true, balance: 510 });
    expect(second.status === 'ok' && first.status === 'ok' && second.adjustment.id).toBe(
      first.status === 'ok' && first.adjustment.id,
    );
    expect(balance()).toBe(510);
    expect(ledgerRows.rows).toHaveLength(1);
    expect(adjustments.rows).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledTimes(1);
  });

  it('refuses a key that already applied to a different member', async () => {
    users.insert({ id: 'member-2', name: 'Bo', banReason: null });
    await credit(5, key(8));
    const out = await adjustCoins({
      adminId: ADMIN,
      userId: 'member-2',
      direction: 'add',
      amount: 5,
      reason: 'goodwill',
      key: key(8),
    });
    expect(out).toEqual({ status: 'key_conflict' });
    expect(profiles.rows.find((r) => r.userId === 'member-2')).toBeUndefined();
  });

  it('refuses a key reused for a different amount and moves nothing', async () => {
    await credit(5, key(10));
    const before = balance();
    const out = await adjustCoins({
      adminId: ADMIN,
      userId: MEMBER,
      direction: 'add',
      amount: 9,
      reason: 'goodwill',
      key: key(10),
    });
    expect(out).toEqual({ status: 'key_conflict' });
    expect(balance()).toBe(before);
    expect(adjustments.rows).toHaveLength(1);
  });

  it('rolls the adjustment back when the audit write fails', async () => {
    h.audit.mockRejectedValueOnce(new Error('audit down'));
    const before = balance();
    await expect(credit(500, key(11))).rejects.toThrow('audit down');
    expect(balance()).toBe(before);
    expect(ledgerRows.rows).toHaveLength(0);
    expect(adjustments.rows).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses the tombstone, a deleted account and a missing member', async () => {
    users.insert({ id: DELETED_USER_ID, name: 'Deleted', banReason: null });
    const base = { adminId: ADMIN, direction: 'add' as const, amount: 5, reason: 'goodwill' as const, key: key(9) };
    expect(await adjustCoins({ ...base, userId: DELETED_USER_ID })).toEqual({ status: 'deleted_account' });
    expect(await adjustCoins({ ...base, userId: 'nobody' })).toEqual({ status: 'not_found' });
    expect(ledgerRows.rows).toHaveLength(0);
  });
});

describe('reverseAdjustment', () => {
  const adjustmentId = () => String(adjustments.rows[0]!.id);

  it('applies once and refuses a second reversal', async () => {
    await credit(500);
    const first = await reverseAdjustment({ adminId: ADMIN, userId: MEMBER, adjustmentId: adjustmentId() });
    expect(first).toMatchObject({ status: 'ok', balance: 10 });
    expect(adjustments.rows).toHaveLength(2);
    expect(adjustments.rows[1]).toMatchObject({ delta: -500, reason: 'reversal', reversesId: adjustments.rows[0]!.id });
    expect(adjustments.rows[0]!.reversedById).toBe(adjustments.rows[1]!.id);
    expect(ledgerRows.rows[1]).toMatchObject({ type: 'ADMIN', senderId: MEMBER, amount: 500 });

    const second = await reverseAdjustment({ adminId: ADMIN, userId: MEMBER, adjustmentId: adjustmentId() });
    expect(second).toEqual({ status: 'already_reversed' });
    expect(balance()).toBe(10);
    expect(ledgerRows.rows).toHaveLength(2);
    expect(await reconcileUser(MEMBER)).toMatchObject({ ok: true });
  });

  it('reversing a debit credits the coins back', async () => {
    await credit(500);
    await debit(200);
    const out = await reverseAdjustment({
      adminId: ADMIN,
      userId: MEMBER,
      adjustmentId: String(adjustments.rows[1]!.id),
    });
    expect(out).toMatchObject({ status: 'ok', balance: 510 });
    expect(await reconcileUser(MEMBER)).toMatchObject({ ok: true });
  });

  it('refuses to reverse a credit the member has spent, leaves it reversible, and reports the balance', async () => {
    await credit(500);
    await debitCoins(MEMBER, 505, { type: 'PURCHASE', idempotencyKey: 'spend-1' });
    const out = await reverseAdjustment({ adminId: ADMIN, userId: MEMBER, adjustmentId: adjustmentId() });
    expect(out).toEqual({ status: 'insufficient', balance: 5 });
    expect(adjustments.rows).toHaveLength(1);
    expect(adjustments.rows[0]!.reversedById ?? null).toBeNull();
    expect(balance()).toBe(5);
  });

  it('does not reverse a reversal', async () => {
    await credit(500);
    await reverseAdjustment({ adminId: ADMIN, userId: MEMBER, adjustmentId: adjustmentId() });
    const out = await reverseAdjustment({
      adminId: ADMIN,
      userId: MEMBER,
      adjustmentId: String(adjustments.rows[1]!.id),
    });
    expect(out).toEqual({ status: 'is_reversal' });
  });

  it('does not reverse another member’s adjustment', async () => {
    await credit(500);
    users.insert({ id: 'member-2', name: 'Bo', banReason: null });
    const out = await reverseAdjustment({ adminId: ADMIN, userId: 'member-2', adjustmentId: adjustmentId() });
    expect(out).toEqual({ status: 'not_found' });
    expect(balance()).toBe(510);
  });
});

describe('listAdjustments', () => {
  it('reports the balance, a matching reconciliation and the history with reversed flags', async () => {
    await credit(500);
    await reverseAdjustment({ adminId: ADMIN, userId: MEMBER, adjustmentId: String(adjustments.rows[0]!.id) });
    const s = await listAdjustments(MEMBER);
    expect(s.balance).toBe(10);
    expect(s.reconciliation).toMatchObject({ ok: true, drift: 0 });
    expect(s.adjustments).toHaveLength(2);
    const original = s.adjustments.find((a) => a.delta === 500);
    const reversal = s.adjustments.find((a) => a.delta === -500);
    expect(original).toMatchObject({ reversed: true, isReversal: false, admin: { id: ADMIN, name: 'Root' } });
    expect(reversal).toMatchObject({ reversed: false, isReversal: true, reason: 'reversal' });
  });

  it('shows drift when the balance predates the ledger', async () => {
    profiles.rows[0]!.coins = 100;
    const s = await listAdjustments(MEMBER);
    expect(s.reconciliation).toMatchObject({ ok: false, drift: 90 });
  });
});

describe('admin-only', () => {
  const COOKIE = 'better-auth.session_token=abc';
  const req = (method: 'GET' | 'POST', body?: unknown) =>
    new Request('https://rmhstudios.com/api/admin/users/member-1/coins', {
      method,
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `${Math.random()}`, cookie: COOKIE },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const goodBody = { direction: 'add', amount: 5, reason: 'goodwill', key: key(3) };

  it('a non-admin gets 403 on every endpoint and nothing moves', async () => {
    h.getSession.mockResolvedValue({ user: { id: 'u9', name: 'Eve', isAdmin: false } });
    const params = { id: MEMBER, adjustmentId: 'x' };
    expect((await collection.handlers.GET!({ request: req('GET'), params })).status).toBe(403);
    expect((await collection.handlers.POST!({ request: req('POST', goodBody), params })).status).toBe(403);
    expect((await reverseRoute.handlers.POST!({ request: req('POST'), params })).status).toBe(403);
    expect(ledgerRows.rows).toHaveLength(0);
  });

  it('an anonymous caller gets 401', async () => {
    h.getSession.mockResolvedValue(null);
    const res = await collection.handlers.POST!({ request: req('POST', goodBody), params: { id: MEMBER } });
    expect(res.status).toBe(401);
  });

  it('an admin adjusts through the endpoint; an over-threshold amount needs the amount typed again', async () => {
    h.getSession.mockResolvedValue({ user: { id: ADMIN, name: 'Root', isAdmin: true } });
    const ok = await collection.handlers.POST!({ request: req('POST', goodBody), params: { id: MEMBER } });
    expect(ok.status).toBe(200);
    expect(balance()).toBe(15);

    const big = { ...goodBody, amount: 100_001, key: key(4) };
    const unconfirmed = await collection.handlers.POST!({ request: req('POST', big), params: { id: MEMBER } });
    expect(unconfirmed.status).toBe(400);
    const confirmed = await collection.handlers.POST!({
      request: req('POST', { ...big, confirmAmount: 100_001 }),
      params: { id: MEMBER },
    });
    expect(confirmed.status).toBe(200);
  });

  it('rejects a non-integer, an out-of-range amount and a correction without a note', async () => {
    h.getSession.mockResolvedValue({ user: { id: ADMIN, name: 'Root', isAdmin: true } });
    for (const bad of [
      { ...goodBody, amount: 1.5 },
      { ...goodBody, amount: 0 },
      { ...goodBody, amount: 1_000_001 },
      { ...goodBody, reason: 'reversal' },
      { ...goodBody, reason: 'correction' },
      { ...goodBody, key: 'short' },
    ]) {
      const res = await collection.handlers.POST!({ request: req('POST', bad), params: { id: MEMBER } });
      expect(res.status).toBe(400);
    }
    expect(ledgerRows.rows).toHaveLength(0);
  });

  it('answers 409 with the balance when a debit overdraws', async () => {
    h.getSession.mockResolvedValue({ user: { id: ADMIN, name: 'Root', isAdmin: true } });
    const res = await collection.handlers.POST!({
      request: req('POST', { ...goodBody, direction: 'remove', amount: 50 }),
      params: { id: MEMBER },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ balance: 10 });
  });
});
