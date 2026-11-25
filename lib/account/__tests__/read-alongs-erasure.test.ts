import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so the read-along tables (which only cascade from the user) are
 * handled explicitly (s11-09): the member's reader rows are erased; a read-along they started passes to the community
 * owner, paused, so the community keeps its schedule; when they owned the community, or it has no owner, it is
 * cancelled and its unposted parts deleted. The export carries the read-alongs they started and their reader rows.
 */

interface Op {
  model: string;
  method: string;
  args: unknown;
}

const prismaMock = vi.hoisted(() => {
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => (args: unknown) => ({
          model: name,
          method,
          args,
        }),
      },
    );
  return new Proxy(
    {
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    } as Record<string, unknown>,
    {
      get: (t, key: string) => (key in t ? t[key] : model(key)),
    },
  );
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: prismaMock,
}));

import { anonymizeAccount } from '@/lib/account/deletion.server';
import { exportReadAlongs, readAlongErasureOps, readAlongHandoverTargets } from '@/lib/communities/read-along.server';

const txOps = () => (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];
const swap = (models: Record<string, unknown>) => {
  Object.assign(prismaMock as Record<string, unknown>, models);
  return () => {
    for (const key of Object.keys(models)) delete (prismaMock as Record<string, unknown>)[key];
  };
};
const op = (model: string, method: string) => (args: unknown) => ({ model, method, args });

beforeEach(() => {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
});

describe('anonymizeAccount (read-alongs)', () => {
  it('erases the member’s reader rows, scoped by userId', async () => {
    await anonymizeAccount('user-1');
    const del = txOps().find((o) => o.model === 'readAlongReader' && o.method === 'deleteMany');
    expect(del).toBeDefined();
    expect(del!.args).toEqual({ where: { userId: 'user-1' } });
  });

  it('de-identifies the read-alongs the member started, and tolerates a pre-step that is not a list', async () => {
    // the recording proxy answers the pre-step reads with plain objects, not rows: nothing is handed over, the rest is cancelled
    await anonymizeAccount('user-1');
    const updates = txOps().filter((o) => o.model === 'readAlong' && o.method === 'updateMany');
    expect(updates.length).toBeGreaterThan(0);
    for (const u of updates) expect(JSON.stringify(u.args)).toContain('"createdById":"user-1"');
  });
});

describe('readAlongHandoverTargets', () => {
  it('reads the communities the member started read-alongs in and their owners', async () => {
    const findMany = vi.fn().mockResolvedValueOnce([{ communityId: 'c1' }, { communityId: 'c2' }]);
    const communities = vi.fn(async (_args: unknown) => [
      { id: 'c1', createdById: 'owner-1' },
      { id: 'c2', createdById: 'user-1' },
    ]);
    const restore = swap({ readAlong: { findMany }, community: { findMany: communities } });
    try {
      expect(await readAlongHandoverTargets('user-1')).toEqual([
        { id: 'c1', createdById: 'owner-1' },
        { id: 'c2', createdById: 'user-1' },
      ]);
      expect(findMany.mock.calls[0]![0]).toMatchObject({ where: { createdById: 'user-1' } });
      expect(communities.mock.calls[0]![0]).toMatchObject({ where: { id: { in: ['c1', 'c2'] } } });
    } finally {
      restore();
    }
  });

  it('is empty for a member who started none, and for a read that is not a list', async () => {
    const restore = swap({ readAlong: { findMany: vi.fn(async () => []) } });
    try {
      expect(await readAlongHandoverTargets('user-9')).toEqual([]);
    } finally {
      restore();
    }
    expect(await readAlongHandoverTargets('user-9')).toEqual([]);
  });
});

describe('readAlongErasureOps', () => {
  it('hands each community’s read-alongs to its owner, paused, then cancels what is left and deletes its unposted parts', () => {
    const updateMany = vi.fn(op('readAlong', 'updateMany'));
    const restore = swap({
      readAlong: { updateMany },
      readAlongReader: { deleteMany: vi.fn(op('readAlongReader', 'deleteMany')) },
      readAlongPart: { deleteMany: vi.fn(op('readAlongPart', 'deleteMany')) },
    });
    try {
      const ops = readAlongErasureOps('user-1', [
        { id: 'c1', createdById: 'owner-1' },
        { id: 'c2', createdById: 'user-1' },
      ]) as unknown as Op[];
      expect(ops.map((o) => `${o.model}.${o.method}`)).toEqual([
        'readAlongReader.deleteMany',
        // c1: running ones handed over paused, finished ones re-pointed
        'readAlong.updateMany',
        'readAlong.updateMany',
        // then what is left (c2, the member's own community)
        'readAlongPart.deleteMany',
        'readAlong.updateMany',
      ]);
      expect(updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1', communityId: 'c1', status: { in: ['active', 'paused'] } },
        data: { createdById: 'owner-1', status: 'paused', pausedReason: 'author_not_moderator' },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1', communityId: 'c1' },
        data: { createdById: 'owner-1' },
      });
      expect(updateMany).toHaveBeenCalledWith({
        where: { createdById: 'user-1', status: { in: ['active', 'paused'] } },
        data: { status: 'cancelled', pausedReason: null },
      });
      // only parts nobody has seen yet go, and only of the read-alongs that are cancelled here
      expect(ops[3]!.args).toEqual({
        where: { postedAt: null, readAlong: { createdById: 'user-1', status: { in: ['active', 'paused'] } } },
      });
      // the community the member owned is never handed to the member
      expect(JSON.stringify(ops)).not.toContain('"communityId":"c2"');
    } finally {
      restore();
    }
  });

  it('the community owner takes over nothing for a member who owns every community: only the cancel path', () => {
    const ops = readAlongErasureOps('user-1', [{ id: 'c1', createdById: 'user-1' }]) as unknown as Op[];
    expect(ops.map((o) => `${o.model}.${o.method}`)).toEqual([
      'readAlongReader.deleteMany',
      'readAlongPart.deleteMany',
      'readAlong.updateMany',
    ]);
  });

  it('a member with no read-alongs still erases their reader rows and cancels nothing that exists', () => {
    const ops = readAlongErasureOps('user-9', []) as unknown as Op[];
    expect(ops.map((o) => o.method)).toEqual(['deleteMany', 'deleteMany', 'updateMany']);
  });
});

describe('exportReadAlongs', () => {
  it('exports the read-alongs the member started, with their parts, and their own reader rows', async () => {
    const started = vi.fn(async (_args: unknown) => [
      {
        id: 'ra1',
        communityId: 'c1',
        docSlug: 'moby',
        bookTitle: 'Moby Dick',
        weekday: 1,
        minuteOfDay: 540,
        timeZone: 'Europe/London',
        status: 'active',
        createdAt: new Date('2026-11-30T00:00:00Z'),
        parts: [
          {
            position: 1,
            label: 'Part 1',
            startPage: 1,
            endPage: 50,
            opensAt: new Date('2026-12-07T09:00:00Z'),
            postedAt: null,
          },
        ],
      },
    ]);
    const readers = vi.fn(async (_args: unknown) => [
      { readAlongId: 'ra2', notify: false, lastPartDone: 3, joinedAt: new Date('2026-12-01T00:00:00Z') },
    ]);
    const restore = swap({ readAlong: { findMany: started }, readAlongReader: { findMany: readers } });
    try {
      const out = await exportReadAlongs('user-1');
      expect(started.mock.calls[0]![0]).toMatchObject({ where: { createdById: 'user-1' } });
      expect(readers.mock.calls[0]![0]).toMatchObject({ where: { userId: 'user-1' } });
      expect(out).toEqual({
        started: [
          {
            id: 'ra1',
            communityId: 'c1',
            docSlug: 'moby',
            bookTitle: 'Moby Dick',
            weekday: 1,
            time: '09:00',
            timeZone: 'Europe/London',
            status: 'active',
            createdAt: '2026-11-30T00:00:00.000Z',
            parts: [
              {
                position: 1,
                label: 'Part 1',
                startPage: 1,
                endPage: 50,
                opensAt: '2026-12-07T09:00:00.000Z',
                postedAt: null,
              },
            ],
          },
        ],
        readers: [{ readAlongId: 'ra2', notify: false, lastPartDone: 3, joinedAt: '2026-12-01T00:00:00.000Z' }],
      });
    } finally {
      restore();
    }
  });
});
