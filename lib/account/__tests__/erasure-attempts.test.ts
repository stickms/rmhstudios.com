/**
 * s12-14: every erasure attempt is recorded (start row, then ok or the error's NAME), one erasure runs at a time per
 * account through the claim, a failing erasure leaves the account scheduled, and attempt rows are deleted after 90 days.
 * Prisma is a small in-memory fake; the rest of `anonymizeAccount`'s models answer through a recording Proxy.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Attempt = {
  id: bigint;
  userId: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  errorName: string | null;
};

const h = vi.hoisted(() => ({
  attempts: [] as Record<string, unknown>[],
  nextId: 1n,
  due: [] as { id: string }[],
  failBatch: null as Error | null,
  locks: [] as unknown[],
  deletes: [] as Record<string, unknown>[],
  userWrites: 0,
}));

class SqlFailure extends Error {
  code = 'P2003';
  constructor() {
    super('Foreign key failed on a@example.test');
    this.name = 'PrismaClientKnownRequestError';
  }
}
class Boom extends Error {
  constructor() {
    super('contains a@example.test and a stack');
    this.name = 'BoomError';
  }
}

vi.mock('@/lib/prisma.server', () => {
  const fallback = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  const attempt = {
    findFirst: vi.fn(async (a: { where: { userId: string; finishedAt: null; startedAt: { gt: Date } } }) => {
      const hit = (h.attempts as unknown as Attempt[]).find(
        (r) =>
          r.userId === a.where.userId &&
          r.finishedAt === null &&
          r.startedAt.getTime() > a.where.startedAt.gt.getTime(),
      );
      return hit ? { id: hit.id } : null;
    }),
    create: vi.fn(async (a: { data: { userId: string; trigger: string; startedAt?: Date } }) => {
      const row = {
        id: h.nextId++,
        userId: a.data.userId,
        trigger: a.data.trigger,
        startedAt: a.data.startedAt ?? new Date(),
        finishedAt: null,
        ok: null,
        errorName: null,
      };
      h.attempts.push(row);
      return { id: row.id };
    }),
    update: vi.fn(async (a: { where: { id: bigint }; data: Record<string, unknown> }) => {
      const row = h.attempts.find((r) => r.id === a.where.id)!;
      Object.assign(row, a.data);
      return row;
    }),
    deleteMany: vi.fn(async (a: Record<string, unknown>) => {
      h.deletes.push(a);
      return { count: 0 };
    }),
  };
  // A transaction-scoped advisory lock, faked: a second holder of a key waits until the first transaction ends.
  const held = new Map<unknown, Promise<void>>();
  const txFor = (release: (() => void)[]) => {
    const mine = new Set<unknown>();
    return {
      accountErasureAttempt: attempt,
      $executeRaw: vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
        h.locks.push(values[0]);
        if (mine.has(values[0])) return 1; // re-entrant within one transaction, as in Postgres
        mine.add(values[0]);
        while (held.has(values[0])) await held.get(values[0]);
        let done!: () => void;
        held.set(
          values[0],
          new Promise<void>((r) => {
            done = r;
          }),
        );
        release.push(() => {
          held.delete(values[0]);
          done();
        });
        return 1;
      }),
    };
  };
  const tx = txFor([]);
  const base: Record<string, unknown> = {
    accountErasureAttempt: attempt,
    user: new Proxy(
      {
        findMany: vi.fn(async () => h.due),
        updateMany: vi.fn(async () => {
          h.userWrites += 1;
          return { count: 1 };
        }),
      } as Record<string, unknown>,
      // The erasure's own user writes (anonymise, clear the schedule) are ops inside its batch, which this file fails or lets pass.
      { get: (t, m: string) => (m in t ? t[m] : (args: unknown) => ({ model: 'user', method: m, args })) },
    ),
    $executeRaw: tx.$executeRaw,
    $transaction: vi.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        const release: (() => void)[] = [];
        try {
          return await (arg as (t: typeof tx) => Promise<unknown>)(txFor(release));
        } finally {
          release.forEach((r) => r());
        }
      }
      if (h.failBatch) throw h.failBatch;
      return arg;
    }),
  };
  const prisma = new Proxy(base, { get: (t, key: string) => (key in t ? t[key] : fallback(key)) });
  return { prisma };
});

import {
  ERASURE_ATTEMPT_RETENTION_MS,
  ERASURE_CLAIM_WINDOW_MS,
  claimErasure,
  finalizeDueDeletions,
} from '@/lib/account/deletion.server';
import { erasureErrorName } from '@/lib/admin/deletions';

const NOW = new Date('2026-12-05T12:00:00Z');
const rows = () => h.attempts as unknown as Attempt[];

beforeEach(() => {
  h.attempts = [];
  h.nextId = 1n;
  h.due = [];
  h.failBatch = null;
  h.locks = [];
  h.deletes = [];
  h.userWrites = 0;
});

describe('finalizeDueDeletions attempts', () => {
  it('records ok: true for an erasure that finishes', async () => {
    h.due = [{ id: 'user-1' }];
    const out = await finalizeDueDeletions({ now: NOW });
    expect(out).toMatchObject({ due: 1, finalized: 1, skipped: 0 });
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toMatchObject({ userId: 'user-1', trigger: 'schedule', ok: true, errorName: null });
    expect(rows()[0]!.finishedAt).toBeInstanceOf(Date);
  });

  it('records ok: false with the error name only, and leaves the account scheduled', async () => {
    h.due = [{ id: 'user-1' }, { id: 'user-2' }];
    h.failBatch = new Boom();
    const out = await finalizeDueDeletions({ now: NOW });
    // Both accounts were tried: one bad row does not abort the sweep.
    expect(out).toMatchObject({ due: 2, finalized: 0 });
    expect(rows().map((r) => [r.userId, r.ok, r.errorName])).toEqual([
      ['user-1', false, 'BoomError'],
      ['user-2', false, 'BoomError'],
    ]);
    // No message, stack or e-mail address reaches the stored row.
    expect(JSON.stringify(rows(), (_k, v) => (typeof v === 'bigint' ? String(v) : v))).not.toMatch(
      /example\.test|stack/,
    );
    // `deletionScheduledAt` is cleared inside anonymizeAccount's batch, which threw: nothing else cleared it.
    expect(h.userWrites).toBe(0);
  });

  it('records a Prisma error by its code', async () => {
    h.due = [{ id: 'user-1' }];
    h.failBatch = new SqlFailure();
    await finalizeDueDeletions({ now: NOW });
    expect(rows()[0]).toMatchObject({ ok: false, errorName: 'P2003' });
  });

  it('skips an account whose erasure another run already holds', async () => {
    h.due = [{ id: 'user-1' }];
    h.attempts.push({
      id: 99n,
      userId: 'user-1',
      trigger: 'admin',
      startedAt: new Date(NOW.getTime() - 60_000),
      finishedAt: null,
      ok: null,
      errorName: null,
    });
    const out = await finalizeDueDeletions({ now: NOW });
    expect(out).toMatchObject({ due: 1, finalized: 0, skipped: 1 });
    expect(rows()).toHaveLength(1);
  });

  it('deletes attempt rows older than 90 days', async () => {
    await finalizeDueDeletions({ now: NOW });
    expect(h.deletes).toHaveLength(1);
    const cutoff = (h.deletes[0] as { where: { startedAt: { lt: Date } } }).where.startedAt.lt;
    expect(cutoff.getTime()).toBe(NOW.getTime() - ERASURE_ATTEMPT_RETENTION_MS);
    expect(ERASURE_ATTEMPT_RETENTION_MS).toBe(90 * 24 * 60 * 60 * 1000);
  });
});

describe('claimErasure', () => {
  it('stops a concurrent run, under the account’s advisory lock', async () => {
    const first = await claimErasure('user-1', 'schedule', { now: NOW });
    const second = await claimErasure('user-1', 'admin', { now: NOW });
    expect(first).toBe(1n);
    expect(second).toBeNull();
    expect(rows()).toHaveLength(1);
    expect(h.locks).toEqual(['erasure:user-1', 'erasure:user-1']);
  });

  it('lets exactly one of several interleaved claims through (sweep, sweep and admin retry)', async () => {
    const got = await Promise.all([
      claimErasure('user-1', 'schedule', { now: NOW }),
      claimErasure('user-1', 'schedule', { now: NOW }),
      claimErasure('user-1', 'admin', { now: NOW }),
    ]);
    expect(got.filter((g) => g !== null)).toHaveLength(1);
    expect(rows()).toHaveLength(1);
  });

  it('does not block another account', async () => {
    await claimErasure('user-1', 'schedule', { now: NOW });
    expect(await claimErasure('user-2', 'schedule', { now: NOW })).toBe(2n);
  });

  it('is free again once the attempt finished, or after the claim window', async () => {
    const id = (await claimErasure('user-1', 'schedule', { now: NOW }))!;
    rows().find((r) => r.id === id)!.finishedAt = NOW;
    expect(await claimErasure('user-1', 'admin', { now: NOW })).not.toBeNull();

    const later = new Date(NOW.getTime() + ERASURE_CLAIM_WINDOW_MS + 1000);
    // The second attempt never finished (a crash): it stops blocking after 15 minutes.
    expect(await claimErasure('user-1', 'admin', { now: later })).not.toBeNull();
  });

  it('writes nothing when the in-transaction hook refuses', async () => {
    await expect(
      claimErasure('user-1', 'admin', {
        now: NOW,
        inTx: async () => {
          throw new Error('refused');
        },
      }),
    ).rejects.toThrow('refused');
    expect(rows()).toHaveLength(0);
  });
});

describe('erasureErrorName', () => {
  it('is a Prisma code or a class name, never a message', () => {
    expect(erasureErrorName(new SqlFailure())).toBe('P2003');
    expect(erasureErrorName(new Boom())).toBe('BoomError');
    expect(erasureErrorName('plain string with a@example.test')).toBe('Error');
    expect(erasureErrorName(Object.assign(new Error('x'), { name: 'Bad Name!' }))).toBe('BadName');
    expect(erasureErrorName(Object.assign(new Error('x'), { name: 'N'.repeat(300) }))).toHaveLength(120);
  });
});
