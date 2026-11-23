import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => {
  type Row = {
    id: string;
    userId: string;
    status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'REVOKED';
    note: string;
    adminNote: string;
    createdAt: Date;
    decidedAt: Date | null;
    decidedBy: string | null;
    revokedAt: Date | null;
    revokedBy: string | null;
    revokeNote: string;
  };
  const rows: Row[] = [];
  let seq = 0;
  const clock = { t: Date.parse('2026-11-23T12:00:00Z') };
  const matches = (r: Row, w: Record<string, unknown>) =>
    (w.id === undefined || r.id === w.id) &&
    (w.userId === undefined || r.userId === w.userId) &&
    (w.status === undefined ||
      (typeof w.status === 'string' ? r.status === w.status : r.status !== (w.status as { not: string }).not));
  const medQaLimitRequest = {
    create: vi.fn(async (a: { data: { userId: string; note?: string } }) => {
      // The partial unique index: one PENDING per member.
      if (rows.some((r) => r.userId === a.data.userId && r.status === 'PENDING')) {
        throw Object.assign(new Error('unique'), { code: 'P2002' });
      }
      const row: Row = {
        id: `r${++seq}`,
        userId: a.data.userId,
        status: 'PENDING',
        note: a.data.note ?? '',
        adminNote: '',
        createdAt: new Date(clock.t + seq),
        decidedAt: null,
        decidedBy: null,
        revokedAt: null,
        revokedBy: null,
        revokeNote: '',
      };
      rows.push(row);
      return row;
    }),
    findFirst: vi.fn(async (a: { where: Record<string, unknown> }) => {
      const hit = rows.filter((r) => matches(r, a.where)).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
      return hit[0] ?? null;
    }),
    findUnique: vi.fn(async (a: { where: { id: string } }) => rows.find((r) => r.id === a.where.id) ?? null),
    findMany: vi.fn(async (a: { where: Record<string, unknown> }) =>
      rows.filter((r) => matches(r, a.where)).map((r) => ({ ...r, user: { id: r.userId, handle: 'h', name: 'n' } })),
    ),
    updateMany: vi.fn(async (a: { where: Record<string, unknown>; data: Partial<Row> }) => {
      const hit = rows.filter((r) => matches(r, a.where));
      for (const r of hit) Object.assign(r, a.data);
      return { count: hit.length };
    }),
  };
  return { rows, clock, prisma: { medQaLimitRequest }, getUserTier: vi.fn(async (): Promise<string> => 'free'), audit: vi.fn(async () => undefined), notify: vi.fn(async (..._a: unknown[]) => undefined) };
});
vi.mock('@/lib/prisma.server', () => ({ prisma: m.prisma }));
vi.mock('@/lib/entitlements', () => ({ getUserTier: m.getUserTier }));
vi.mock('@/lib/ai/budget.server', () => ({ assertAiBudget: vi.fn() }));
vi.mock('@/lib/admin-audit.server', () => ({ logAdminAction: m.audit }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: m.notify }));

import { AppError } from '@/lib/errors/codes';
import { resolveQaTier } from './qa/budget.server';
import { decideLimitRequest, getLimitRequestState, limitState, listLimitRequests, submitLimitRequest } from './qa-limit.server';

const NOW = new Date('2026-11-23T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const code = async (p: Promise<unknown>) => ((await p.catch((e: unknown) => e)) as AppError).code;

beforeEach(() => {
  m.rows.length = 0;
  m.getUserTier.mockReset().mockResolvedValue('free');
  m.audit.mockClear();
  m.notify.mockReset().mockResolvedValue(undefined);
});

describe('submitting a limit request', () => {
  it('files one pending request with the trimmed, clipped note', async () => {
    const res = await submitLimitRequest('u1', false, `  ${'x'.repeat(600)}  `, NOW);
    expect(res.state).toBe('pending');
    expect(m.rows).toHaveLength(1);
    expect(m.rows[0]!.note).toHaveLength(500);
    expect((await submitLimitRequest('u2', false, undefined, NOW)).state).toBe('pending');
    expect(m.rows[1]!.note).toBe('');
  });
  it('allows only one pending request per member, also when two arrive together', async () => {
    expect(await code(Promise.all([submitLimitRequest('u1', false, 'a', NOW), submitLimitRequest('u1', false, 'b', NOW)]))).toBe(
      'MEDSCHOOLS_QA_LIMIT_PENDING',
    );
    expect(m.rows).toHaveLength(1);
    expect(await code(submitLimitRequest('u1', false, 'again', NOW))).toBe('MEDSCHOOLS_QA_LIMIT_PENDING');
  });
  it('refuses an admin, a paying member and a member who is already approved', async () => {
    expect(await code(submitLimitRequest('a1', true, undefined, NOW))).toBe('MEDSCHOOLS_QA_LIMIT_NOT_NEEDED');
    m.getUserTier.mockResolvedValue('pro');
    expect(await code(submitLimitRequest('u1', false, undefined, NOW))).toBe('MEDSCHOOLS_QA_LIMIT_NOT_NEEDED');
    m.getUserTier.mockResolvedValue('free');
    await submitLimitRequest('u2', false, undefined, NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'approve' }, NOW);
    expect(await code(submitLimitRequest('u2', false, undefined, NOW))).toBe('MEDSCHOOLS_QA_LIMIT_NOT_NEEDED');
    expect(m.rows).toHaveLength(1);
  });
});

describe('the decline wait', () => {
  it('blocks a new request for 30 days after a decline, then allows it', async () => {
    await submitLimitRequest('u1', false, 'please', NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'decline', adminNote: 'not yet' }, NOW);
    const s = await getLimitRequestState('u1', false, days(10));
    expect(s).toMatchObject({ state: 'declined', adminNote: 'not yet', reapplyOn: days(30).toISOString() });
    expect(await code(submitLimitRequest('u1', false, 'again', days(29)))).toBe('MEDSCHOOLS_QA_LIMIT_WAIT');
    expect((await getLimitRequestState('u1', false, days(30))).state).toBe('none');
    expect((await submitLimitRequest('u1', false, 'again', days(30))).state).toBe('pending');
    expect(m.rows).toHaveLength(2);
  });
  it('starts the same wait after a revoke', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'approve' }, NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'revoke' }, days(5));
    expect(await code(submitLimitRequest('u1', false, undefined, days(6)))).toBe('MEDSCHOOLS_QA_LIMIT_WAIT');
    expect((await getLimitRequestState('u1', false, days(35))).state).toBe('none');
  });
});

describe('deciding', () => {
  it('approves once: the second admin and a re-decide get a conflict, and an approval is the approved tier', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    const id = m.rows[0]!.id;
    expect(await resolveQaTier('u1')).toBe('free');
    await decideLimitRequest('a1', { id, action: 'approve', adminNote: 'ok' }, NOW);
    expect(m.rows[0]).toMatchObject({ status: 'APPROVED', decidedBy: 'a1', adminNote: 'ok', decidedAt: NOW });
    expect(await resolveQaTier('u1')).toBe('approved');
    expect(await code(decideLimitRequest('a2', { id, action: 'decline' }, NOW))).toBe('CONFLICT');
    expect(await code(decideLimitRequest('a2', { id, action: 'approve' }, NOW))).toBe('CONFLICT');
    expect(m.audit).toHaveBeenCalledTimes(1);
    expect(m.audit).toHaveBeenCalledWith('a1', 'medschools.qa-limit.approve', { targetType: 'User', targetId: 'u1' });
  });
  it('revokes an approval and the tier goes back to free; revoking a pending request is a conflict', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    const id = m.rows[0]!.id;
    expect(await code(decideLimitRequest('a1', { id, action: 'revoke' }, NOW))).toBe('CONFLICT');
    await decideLimitRequest('a1', { id, action: 'approve' }, NOW);
    await decideLimitRequest('a1', { id, action: 'revoke', adminNote: 'abuse' }, NOW);
    expect(m.rows[0]!.status).toBe('REVOKED');
    expect(await resolveQaTier('u1')).toBe('free');
  });
  it('keeps the approval record when it is revoked and records the revoke beside it', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    const id = m.rows[0]!.id;
    await decideLimitRequest('a1', { id, action: 'approve', adminNote: 'ok' }, NOW);
    await decideLimitRequest('a2', { id, action: 'revoke', adminNote: 'abuse' }, days(5));
    expect(m.rows[0]).toMatchObject({
      status: 'REVOKED',
      decidedAt: NOW,
      decidedBy: 'a1',
      adminNote: 'ok',
      revokedAt: days(5),
      revokedBy: 'a2',
      revokeNote: 'abuse',
    });
    // The member is shown the revoke, and the wait runs from it.
    expect(await getLimitRequestState('u1', false, days(6))).toMatchObject({
      state: 'declined',
      adminNote: 'abuse',
      decidedAt: days(5).toISOString(),
      reapplyOn: days(35).toISOString(),
    });
  });
  it('notifies the applicant of an approve, a decline and a revoke, with the note when there is one', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    await submitLimitRequest('u2', false, undefined, NOW);
    const [a, b] = [m.rows[0]!.id, m.rows[1]!.id];
    await decideLimitRequest('a1', { id: a, action: 'approve' }, NOW);
    await decideLimitRequest('a1', { id: b, action: 'decline', adminNote: 'not yet' }, NOW);
    await decideLimitRequest('a1', { id: a, action: 'revoke', adminNote: 'abuse' }, days(1));
    await new Promise((r) => setTimeout(r, 0));
    const calls = m.notify.mock.calls.map((c) => c[0] as { userId: string; link: string; type: string; preview: { key: string; params: Record<string, string> } });
    expect(calls.map((c) => [c.userId, c.preview.key, c.preview.params])).toEqual([
      ['u1', 'medschools-qa-limit-approved', {}],
      ['u2', 'medschools-qa-limit-declined-note', { note: 'not yet' }],
      ['u1', 'medschools-qa-limit-revoked-note', { note: 'abuse' }],
    ]);
    expect(calls.every((c) => c.link === '/rmh-medschool/ask' && c.type === 'SYSTEM')).toBe(true);
  });
  it('does not notify on a lost race, and a failing notice never fails the decision', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    const id = m.rows[0]!.id;
    m.notify.mockRejectedValue(new Error('down'));
    await expect(decideLimitRequest('a1', { id, action: 'approve' }, NOW)).resolves.toBeUndefined();
    m.notify.mockClear();
    expect(await code(decideLimitRequest('a2', { id, action: 'approve' }, NOW))).toBe('CONFLICT');
    expect(m.notify).not.toHaveBeenCalled();
  });
  it('is not found for an unknown id', async () => {
    expect(await code(decideLimitRequest('a1', { id: 'nope', action: 'approve' }, NOW))).toBe('NOT_FOUND');
  });
});

describe('limitState and the admin list', () => {
  it('shows admins and paying members no form, whatever their history', () => {
    for (const tier of ['admin', 'member'] as const) {
      expect(limitState(tier, null, NOW).state).toBe('not-needed');
    }
  });
  it('lists pending and decided requests separately', async () => {
    await submitLimitRequest('u1', false, undefined, NOW);
    await submitLimitRequest('u2', false, undefined, NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'decline' }, NOW);
    const l = await listLimitRequests();
    expect(l.pending.map((r) => r.user.id)).toEqual(['u2']);
    expect(l.recent.map((r) => r.status)).toEqual(['DECLINED']);
    expect(l.active).toEqual([]);
    expect(JSON.stringify(l)).not.toMatch(/"userId"/);
  });
  it('always lists every approval in force, however many decisions came after it', async () => {
    await submitLimitRequest('old', false, undefined, NOW);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'approve' }, NOW);
    for (let i = 0; i < 60; i++) {
      await submitLimitRequest(`d${i}`, false, undefined, NOW);
      await decideLimitRequest('a1', { id: m.rows[m.rows.length - 1]!.id, action: 'decline' }, days(1));
    }
    const l = await listLimitRequests();
    expect(l.active.map((r) => r.user.id)).toEqual(['old']);
    expect(l.recent).toHaveLength(50);
    expect(l.recent.every((r) => r.status === 'DECLINED')).toBe(true);
    await decideLimitRequest('a1', { id: m.rows[0]!.id, action: 'revoke' }, days(2));
    const after = await listLimitRequests();
    expect(after.active).toEqual([]);
    expect(after.recent[0]).toMatchObject({ status: 'REVOKED', revokedAt: days(2).toISOString() });
  });
});
