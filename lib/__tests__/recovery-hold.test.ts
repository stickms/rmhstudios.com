import { beforeEach, describe, expect, it, vi } from 'vitest';

// The 72-hour economy hold after a password reset by email (lib/recovery/hold.server.ts). A reset is how an account is
// recovered, so a takeover through someone's inbox must not be able to tip, gift or redeem coins straight away.

const auditRows = vi.hoisted(() => ({ rows: [] as { action: string; targetId: string; createdAt: Date }[] }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    adminAuditLog: {
      findFirst: vi.fn(
        async ({ where }: { where: { action: string; targetId: string; createdAt: { gte: Date } } }) =>
          auditRows.rows
            .filter(
              (r) => r.action === where.action && r.targetId === where.targetId && r.createdAt >= where.createdAt.gte,
            )
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      ),
    },
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({
  logAdminAction: vi.fn(async (_adminId: string, action: string, opts: { targetId?: string }) => {
    auditRows.rows.push({ action, targetId: opts.targetId ?? '', createdAt: new Date() });
  }),
}));

const { assertNoRecoveryHold, getRecoveryHold, startRecoveryHold, RECOVERY_HOLD_MS } =
  await import('@/lib/recovery/hold.server');

beforeEach(() => {
  auditRows.rows = [];
});

describe('post-reset economy hold', () => {
  it('lasts 72 hours', () => {
    expect(RECOVERY_HOLD_MS).toBe(72 * 60 * 60 * 1000);
  });

  it('is off for an account that was never reset', async () => {
    expect((await getRecoveryHold('u1')).active).toBe(false);
    expect(await assertNoRecoveryHold('u1')).toBeNull();
  });

  it('starts when a reset is recorded and refuses coin moves with a 403', async () => {
    await startRecoveryHold('u1', 'password reset by email');
    const hold = await getRecoveryHold('u1');
    expect(hold.active).toBe(true);
    const res = await assertNoRecoveryHold('u1');
    expect(res?.status).toBe(403);
    expect(await res?.json()).toMatchObject({ reason: 'recovery-hold' });
  });

  it('applies only to the account that was reset', async () => {
    await startRecoveryHold('u1', 'password reset by email');
    expect((await getRecoveryHold('u2')).active).toBe(false);
  });

  it('lifts after 72 hours', async () => {
    await startRecoveryHold('u1', 'password reset by email');
    const later = new Date(Date.now() + RECOVERY_HOLD_MS + 60_000);
    expect((await getRecoveryHold('u1', later)).active).toBe(false);
  });
});
