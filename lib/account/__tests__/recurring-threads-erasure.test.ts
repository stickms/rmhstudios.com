import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Account deletion anonymises the user row in place, so `CommunityRecurringThread` (which only cascades from the
 * user) is handled explicitly: a member's templates go to the community owner, paused, so nothing posts under the
 * owner's name until a moderator saves one; a community the member owned loses them.
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
import { exportRecurringThreads, recurringThreadErasureOps } from '@/lib/communities/recurring.server';

const txOps = () => (prismaMock.$transaction as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Op[];

beforeEach(() => {
  (prismaMock.$transaction as ReturnType<typeof vi.fn>).mockClear();
});

describe('anonymizeAccount (recurring threads)', () => {
  it('pauses, then deletes what is left of the member’s templates, scoped by createdById', async () => {
    await anonymizeAccount('user-1');
    const del = txOps().find((o) => o.model === 'communityRecurringThread' && o.method === 'deleteMany');
    expect(del).toBeDefined();
    expect(del!.args).toEqual({
      where: {
        createdById: 'user-1',
      },
    });
  });
});

describe('recurringThreadErasureOps', () => {
  it('hands each community’s templates to its owner, paused, then deletes the rest', async () => {
    const live = {
      communityRecurringThread: {
        findMany: vi.fn().mockResolvedValueOnce([
          {
            communityId: 'c1',
          },
          {
            communityId: 'c2',
          },
        ]),
        updateMany: vi.fn((args: unknown) => ({
          model: 'communityRecurringThread',
          method: 'updateMany',
          args,
        })),
        deleteMany: vi.fn((args: unknown) => ({
          model: 'communityRecurringThread',
          method: 'deleteMany',
          args,
        })),
      },
      community: {
        findMany: vi.fn(async () => [
          {
            id: 'c1',
            createdById: 'owner-1',
          },
          {
            id: 'c2',
            createdById: 'user-1',
          },
        ]),
      },
    };
    // Swap the stubbed models for this call only.
    (prismaMock as Record<string, unknown>).communityRecurringThread = live.communityRecurringThread;
    (prismaMock as Record<string, unknown>).community = live.community;
    try {
      const ops = (await recurringThreadErasureOps('user-1')) as unknown as Op[];
      expect(ops).toHaveLength(3);
      expect(live.communityRecurringThread.updateMany).toHaveBeenCalledTimes(2);
      expect(live.communityRecurringThread.updateMany).toHaveBeenCalledWith({
        where: {
          createdById: 'user-1',
        },
        data: {
          active: false,
          pausedReason: 'author_not_moderator',
        },
      });
      expect(live.communityRecurringThread.updateMany).toHaveBeenCalledWith({
        where: {
          createdById: 'user-1',
          communityId: 'c1',
        },
        data: {
          createdById: 'owner-1',
          active: false,
          pausedReason: 'author_not_moderator',
        },
      });
      expect(live.communityRecurringThread.deleteMany).toHaveBeenCalledWith({
        where: {
          createdById: 'user-1',
        },
      });
      // The community the member owned is never reassigned to the member: its templates fall to the deleteMany.
      expect(JSON.stringify(ops)).not.toContain('"communityId":"c2"');
    } finally {
      delete (prismaMock as Record<string, unknown>).communityRecurringThread;
      delete (prismaMock as Record<string, unknown>).community;
    }
  });

  it('a member with no templates only pauses and deletes nothing', async () => {
    const ops = (await recurringThreadErasureOps('user-9')) as unknown as Op[];
    expect(ops.map((o) => o.method)).toEqual(['updateMany', 'deleteMany']);
  });
});

describe('exportRecurringThreads', () => {
  it('reads only the templates the member authored and exports them as plain data', async () => {
    const findMany = vi.fn(async (_args: unknown) => [
      {
        id: 't1',
        communityId: 'c1',
        title: 'Weekly showcase',
        body: 'Share what you made',
        cadence: 'weekly',
        weekday: 1,
        dayOfMonth: null,
        minuteOfDay: 540,
        timeZone: 'Europe/London',
        nextAt: new Date('2026-11-30T09:00:00Z'),
        active: true,
        lastPostedAt: null,
        createdAt: new Date('2026-11-01T00:00:00Z'),
      },
    ]);
    (prismaMock as Record<string, unknown>).communityRecurringThread = {
      findMany,
    };
    try {
      const rows = await exportRecurringThreads('user-1');
      expect(findMany.mock.calls[0]![0]).toMatchObject({
        where: {
          createdById: 'user-1',
        },
      });
      expect(rows).toEqual([
        {
          id: 't1',
          communityId: 'c1',
          title: 'Weekly showcase',
          body: 'Share what you made',
          cadence: 'weekly',
          weekday: 1,
          dayOfMonth: null,
          time: '09:00',
          timeZone: 'Europe/London',
          nextAt: '2026-11-30T09:00:00.000Z',
          active: true,
          lastPostedAt: null,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ]);
    } finally {
      delete (prismaMock as Record<string, unknown>).communityRecurringThread;
    }
  });
});
