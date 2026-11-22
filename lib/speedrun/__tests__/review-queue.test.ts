/**
 * The speedrun review queue (sprint 10, feature 16): a verdict is a compare-and-set on `pending`, audited in the same
 * transaction, and told to the runner once; a reopen is a compare-and-set from the status the admin saw; the drain pass
 * notifies on a change of status only; the admin API refuses a non-admin.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const entry = {
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  };
  const tx = { speedrunEntry: entry, adminAuditLog: { create: vi.fn(async () => ({})) } };
  return {
    entry,
    tx,
    user: { findMany: vi.fn(async () => []) },
    replay: { findMany: vi.fn(async () => []) },
    notify: vi.fn(async () => {}),
    audit: vi.fn(async () => {}),
    verify: vi.fn(),
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    speedrunEntry: h.entry,
    user: h.user,
    gameReplay: h.replay,
    $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx),
  },
}));
vi.mock('@/lib/admin-audit.server', () => ({ recordAdminActionIn: h.audit }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/catalog', () => ({ games: [{ id: 'lights-out', title: 'Lights Out' }] }));
vi.mock('@/lib/game/leaderboard-privacy.server', () => ({ leaderboardHiddenUserIds: async () => new Set() }));
vi.mock('./../verifier', async (orig) => {
  const real = await orig<typeof import('../verifier')>();
  return { ...real, verifySpeedrun: h.verify };
});

const { reviewEntry, reopenEntry, reverifyPending, getBoard, getRunsForUser } =
  await import('@/lib/speedrun/speedrun.server');

const winnerRow = {
  id: 'e1',
  categoryId: 'c1',
  replayId: 'r1',
  timeMs: 1000,
  score: null,
  status: 'verified',
  rejectReason: null,
  verifiedAt: new Date(),
  createdAt: new Date(),
  userId: 'runner',
  category: { version: '1', game: 'lights-out' },
  user: { id: 'runner', handle: 'rr', name: 'Runner', image: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  h.entry.findUnique.mockResolvedValue(winnerRow);
});

describe('reviewEntry', () => {
  it('applies only while the run is pending (compare-and-set), recording who decided', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 1 });
    const result = await reviewEntry({ entryId: 'e1', status: 'verified', reason: 'Looks clean', adminId: 'a1' });
    expect(result.ok).toBe(true);
    const arg = h.entry.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ id: 'e1', status: 'pending' });
    expect(arg.data).toMatchObject({ status: 'verified', reviewedById: 'a1', rejectReason: 'Looks clean' });
    expect(arg.data.reviewedAt).toBeInstanceOf(Date);
  });

  it('writes the audit row inside the same transaction', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 1 });
    await reviewEntry({ entryId: 'e1', status: 'rejected', reason: 'Spliced', adminId: 'a1' });
    expect(h.audit).toHaveBeenCalledTimes(1);
    const [tx, adminId, action, opts] = h.audit.mock.calls[0] as unknown as [
      unknown,
      string,
      string,
      Record<string, string>,
    ];
    expect(tx).toBe(h.tx);
    expect(adminId).toBe('a1');
    expect(action).toBe('speedrun.reject');
    expect(opts).toMatchObject({ targetType: 'speedrun_entry', targetId: 'e1' });
    expect(opts.detail).toContain('Spliced');
  });

  it('tells the runner once, with the key for the verdict and the reason', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 1 });
    h.entry.findUnique.mockResolvedValue({ ...winnerRow, status: 'rejected' });
    await reviewEntry({ entryId: 'e1', status: 'rejected', reason: 'Spliced', adminId: 'a1' });
    expect(h.notify).toHaveBeenCalledTimes(1);
    const call = h.notify.mock.calls[0] as unknown as [{ userId: string; preview: { key: string; params: unknown } }];
    expect(call[0].userId).toBe('runner');
    expect(call[0].preview.key).toBe('speedrun-run-rejected');
    expect(call[0].preview.params).toEqual({ game: 'Lights Out', reason: 'Spliced' });
  });

  it('does nothing on a run already decided, and reports who decided', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 0 });
    h.entry.findUnique.mockResolvedValue({ status: 'verified', reviewedById: 'a2' });
    h.user.findMany.mockResolvedValue([{ id: 'a2', name: 'Admin Two', image: null, handle: null }] as never);
    const result = await reviewEntry({ entryId: 'e1', status: 'rejected', reason: 'No', adminId: 'a1' });
    expect(result).toMatchObject({ ok: false, code: 'ALREADY_DECIDED', status: 'verified' });
    expect(h.audit).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('an unknown run is not found', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 0 });
    h.entry.findUnique.mockResolvedValue(null);
    await expect(reviewEntry({ entryId: 'nope', status: 'verified', adminId: 'a1' })).rejects.toMatchObject({
      code: 'ENTRY_NOT_FOUND',
    });
  });
});

describe('reopenEntry', () => {
  it('is a compare-and-set from the status the admin saw, back to pending, audited', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 1 });
    const result = await reopenEntry({ entryId: 'e1', from: 'verified', reason: 'Cheating found', adminId: 'a1' });
    expect(result).toEqual({ ok: true });
    const arg = h.entry.updateMany.mock.calls[0]?.[0];
    expect(arg.where).toEqual({ id: 'e1', status: 'verified' });
    expect(arg.data).toMatchObject({ status: 'pending', reviewedById: null, reviewedAt: null, verifiedAt: null });
    expect(h.audit).toHaveBeenCalledWith(h.tx, 'a1', 'speedrun.reopen', expect.objectContaining({ targetId: 'e1' }));
    // The runner hears only of the next verdict.
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses when the status changed since the admin looked', async () => {
    h.entry.updateMany.mockResolvedValue({ count: 0 });
    h.entry.findUnique.mockResolvedValue({ status: 'pending' });
    const result = await reopenEntry({ entryId: 'e1', from: 'rejected', reason: 'x', adminId: 'a1' });
    expect(result).toEqual({ ok: false, code: 'STATUS_CHANGED', status: 'pending' });
    expect(h.audit).not.toHaveBeenCalled();
  });
});

describe('reverifyPending notifications', () => {
  const pending = (id: string) => ({
    id,
    userId: `u-${id}`,
    createdAt: new Date('2026-11-01T00:00:00Z'),
    timeMs: 1,
    score: null,
    replayId: `r-${id}`,
    category: { game: 'lights-out', metric: 'time' },
  });

  it('notifies a run whose status changed, and not one that stays pending or lost the race', async () => {
    h.entry.findMany.mockResolvedValue([pending('a'), pending('b'), pending('c')]);
    h.replay.findMany.mockResolvedValue(
      ['a', 'b', 'c'].map((id) => ({ id: `r-${id}`, version: '1', data: {}, score: null, durationMs: 1 })) as never,
    );
    h.verify
      .mockReturnValueOnce({ status: 'verified' })
      .mockReturnValueOnce({ status: 'pending' })
      .mockReturnValueOnce({ status: 'rejected', reason: 'SCORE_MISMATCH' });
    // `a` wins its compare-and-set; `c` was decided by an admin meanwhile.
    h.entry.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });

    const result = await reverifyPending(50);
    expect(result).toMatchObject({ checked: 3, verified: 1, rejected: 0, stillPending: 1 });
    expect(h.notify).toHaveBeenCalledTimes(1);
    const call = h.notify.mock.calls[0] as unknown as [{ userId: string; preview: { key: string } }];
    expect(call[0].userId).toBe('u-a');
    expect(call[0].preview.key).toBe('speedrun-run-verified');
  });
});

describe('the admin API', () => {
  it('is admin-only on both methods', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('lib/speedrun/api/speedrun.queue.server.ts', 'utf8');
    expect(src.match(/auth: 'admin'/g)).toHaveLength(2);
    expect(src).toContain('status: 409');
  });
});

describe("the reason of a verdict is the runner's own", () => {
  const rejected = { ...winnerRow, status: 'rejected', rejectReason: 'Suspected tool-assisted input.' };

  it('the public board carries no rejectReason for anyone', async () => {
    const category = {
      id: 'c1',
      game: 'lights-out',
      slug: 'any',
      name: 'Any%',
      version: '1',
      metric: 'time',
      active: true,
    };
    (h.entry as unknown as { findMany: ReturnType<typeof vi.fn> }).findMany.mockResolvedValueOnce([rejected]);
    const prismaCategory = (await import('@/lib/prisma.server')).prisma as unknown as Record<string, unknown>;
    prismaCategory.speedrunCategory = { findMany: vi.fn(async () => [category]) };
    const board = await getBoard({ game: 'lights-out', slug: 'any' });
    expect(board.entries).toHaveLength(1);
    expect(board.entries.every((e) => e.rejectReason === null)).toBe(true);
    expect(JSON.stringify(board)).not.toContain('tool-assisted');
  });

  it("the runner's own runs keep the reason", async () => {
    h.entry.findMany.mockResolvedValueOnce([rejected]);
    const runs = await getRunsForUser('runner');
    expect(runs[0]?.rejectReason).toBe('Suspected tool-assisted input.');
  });
});
