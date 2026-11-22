import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Community post alerts: the enqueue, the fan-out job (who is told, who never is, the claim, the collapse) and the
 * setting. Prisma is a small in-memory fake that evaluates exactly the `where` shapes the module uses, so a changed
 * query shows up here as a changed result.
 */

interface Member {
  communityId: string;
  userId: string;
  postAlerts: string;
  bannedUntil: Date | null;
  joinedAt: number;
}
interface Note {
  id: string;
  userId: string;
  type: string;
  entityType: string;
  entityId: string;
  read: boolean;
  createdAt: Date;
  preview: string;
}

const NOW = new Date('2026-11-25T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);

const db = vi.hoisted(() => ({
  post: null as null | {
    id: string;
    userId: string;
    communityId: string | null;
    deletedAt: Date | null;
  },
  authorBannedUntil: null as Date | null,
  members: [] as Member[],
  blocks: [] as {
    blockerId: string;
    blockedId: string;
  }[],
  mutes: [] as {
    muterId: string;
    mutedId: string;
  }[],
  notes: [] as Note[],
  claims: new Set<string>(),
  memberCount: 10,
  created: [] as Record<string, unknown>[],
  boss: null as null | {
    send: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('@/lib/jobs/boss.server', () => ({
  getBoss: async () => db.boss,
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    db.created.push(input);
  }),
}));
vi.mock('@/lib/prisma.server', () => {
  const inSet = (
    v: unknown,
    w:
      | {
          in?: string[];
          not?: string;
          gt?: string;
        }
      | string
      | undefined,
  ) => {
    if (w === undefined) return true;
    if (typeof w === 'string') return v === w;
    if (w.in && !w.in.includes(v as string)) return false;
    if (w.not !== undefined && v === w.not) return false;
    if (w.gt !== undefined && !((v as string) > w.gt)) return false;
    return true;
  };
  return {
    prisma: {
      rMHark: {
        findFirst: async () => {
          const p = db.post;
          if (!p || p.deletedAt || p.communityId === null) return null;
          return {
            id: p.id,
            userId: p.userId,
            communityId: p.communityId,
            user: {
              id: p.userId,
              name: 'Ada',
              handle: 'ada',
              bannedUntil: db.authorBannedUntil,
              profile: null,
            },
            community: {
              name: 'Quiet Group',
            },
          };
        },
      },
      communityPostAlertRun: {
        createMany: async ({
          data,
        }: {
          data: {
            postId: string;
          }[];
        }) => {
          let count = 0;
          for (const d of data)
            if (!db.claims.has(d.postId)) {
              db.claims.add(d.postId);
              count++;
            }
          return {
            count,
          };
        },
        deleteMany: async ({
          where,
        }: {
          where: {
            postId: string;
          };
        }) => {
          db.claims.delete(where.postId);
          return {
            count: 1,
          };
        },
      },
      communityMember: {
        findMany: async ({ where, take }: { where: Record<string, never>; take: number }) =>
          db.members
            .filter(
              (m) =>
                m.communityId === (where as Record<string, string>).communityId &&
                m.postAlerts === (where as Record<string, string>).postAlerts &&
                inSet(m.userId, where.userId),
            )
            .sort((a, b) => (a.userId < b.userId ? -1 : 1))
            .slice(0, take)
            .map((m) => ({
              userId: m.userId,
              user: {
                bannedUntil: m.bannedUntil,
              },
            })),
        findUnique: async ({
          where,
        }: {
          where: {
            communityId_userId: {
              communityId: string;
              userId: string;
            };
          };
        }) => {
          const k = where.communityId_userId;
          const m = db.members.find((x) => x.communityId === k.communityId && x.userId === k.userId);
          return m
            ? {
                postAlerts: m.postAlerts,
                community: {
                  memberCount: db.memberCount,
                },
              }
            : null;
        },
        updateMany: async ({
          where,
          data,
        }: {
          where: {
            communityId: string;
            userId: string;
          };
          data: {
            postAlerts: string;
          };
        }) => {
          const hit = db.members.filter((m) => m.communityId === where.communityId && m.userId === where.userId);
          for (const m of hit) m.postAlerts = data.postAlerts;
          return {
            count: hit.length,
          };
        },
      },
      userBlock: {
        findMany: async () => db.blocks,
      },
      userMute: {
        findMany: async ({
          where,
        }: {
          where: {
            mutedId: string;
            muterId: {
              in: string[];
            };
          };
        }) => db.mutes.filter((m) => m.mutedId === where.mutedId && where.muterId.in.includes(m.muterId)),
      },
      notification: {
        findMany: async ({
          where,
        }: {
          where: {
            userId: {
              in: string[];
            };
            type: string;
            entityType: string;
            entityId: string;
            read: boolean;
            createdAt: {
              gte: Date;
            };
          };
        }) =>
          db.notes.filter(
            (n) =>
              where.userId.in.includes(n.userId) &&
              n.type === where.type &&
              n.entityType === where.entityType &&
              n.entityId === where.entityId &&
              n.read === where.read &&
              n.createdAt >= where.createdAt.gte,
          ),
        updateMany: async ({
          where,
          data,
        }: {
          where: {
            id: {
              in: string[];
            };
          };
          data: {
            preview: string;
          };
        }) => {
          for (const n of db.notes) if (where.id.in.includes(n.id)) n.preview = data.preview;
          return {
            count: where.id.in.length,
          };
        },
      },
    },
  };
});

import { createNotification } from '@/lib/notifications.server';
import {
  POST_ALERT_QUEUE,
  enqueuePostAlert,
  exportPostAlerts,
  getPostAlerts,
  runPostAlertFanout,
  setPostAlerts,
} from '@/lib/communities/post-alerts.server';

const member = (userId: string, over: Partial<Member> = {}): Member => ({
  communityId: 'c1',
  userId,
  postAlerts: 'all',
  bannedUntil: null,
  joinedAt: 0,
  ...over,
});
const told = () => db.created.map((c) => c.userId);

beforeEach(() => {
  db.post = {
    id: 'p1',
    userId: 'author',
    communityId: 'c1',
    deletedAt: null,
  };
  db.authorBannedUntil = null;
  db.members = [];
  db.blocks = [];
  db.mutes = [];
  db.notes = [];
  db.claims = new Set();
  db.memberCount = 10;
  db.created = [];
  db.boss = {
    send: vi.fn(async () => 'job-id'),
  };
  vi.mocked(createNotification).mockClear();
});

describe('enqueuePostAlert', () => {
  it('sends one job keyed by the post id, so a second enqueue of the same post is one job', async () => {
    await enqueuePostAlert('p1');
    await enqueuePostAlert('p1');
    expect(db.boss!.send).toHaveBeenCalledTimes(2);
    for (const call of db.boss!.send.mock.calls) {
      expect(call[0]).toBe(POST_ALERT_QUEUE);
      expect(call[1]).toEqual({
        postId: 'p1',
      });
      expect(call[2]).toMatchObject({
        singletonKey: 'post:p1',
      });
    }
  });

  it('never throws when the queue is down', async () => {
    db.boss = null;
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(enqueuePostAlert('p1')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe('runPostAlertFanout', () => {
  it('notifies only members with alerts on, as a SYSTEM community_post notification linking to the post', async () => {
    db.members = [
      member('a'),
      member('b', {
        postAlerts: 'off',
      }),
      member('c'),
    ];
    const result = await runPostAlertFanout('p1', NOW);
    expect(told()).toEqual(['a', 'c']);
    expect(result).toEqual({
      notified: 2,
      collapsed: 0,
    });
    expect(db.created[0]).toMatchObject({
      type: 'SYSTEM',
      entityType: 'community_post',
      entityId: 'c1',
      preview: 'Ada posted in Quiet Group',
      link: '/u/ada/post/p1',
    });
  });

  it('never alerts the author of the post', async () => {
    db.members = [member('author'), member('a')];
    await runPostAlertFanout('p1', NOW);
    expect(told()).toEqual(['a']);
  });

  it('skips members blocked by the author, members who blocked the author, members who muted the author and banned members', async () => {
    db.members = [
      member('blocked'),
      member('blocker'),
      member('muter'),
      member('banned'),
      member('past'),
      member('ok'),
    ];
    db.members.find((m) => m.userId === 'banned')!.bannedUntil = new Date(NOW.getTime() + 86_400_000);
    db.members.find((m) => m.userId === 'past')!.bannedUntil = minutesAgo(5);
    db.blocks = [
      {
        blockerId: 'author',
        blockedId: 'blocked',
      },
      {
        blockerId: 'blocker',
        blockedId: 'author',
      },
    ];
    db.mutes = [
      {
        muterId: 'muter',
        mutedId: 'author',
      },
    ];
    await runPostAlertFanout('p1', NOW);
    expect(told().sort()).toEqual(['ok', 'past']);
  });

  it('alerts nobody for a deleted or removed post, or one in no community', async () => {
    db.members = [member('a')];
    db.post!.deletedAt = minutesAgo(1);
    expect(await runPostAlertFanout('p1', NOW)).toEqual({
      notified: 0,
      collapsed: 0,
    });
    db.post!.deletedAt = null;
    db.post!.communityId = null;
    await runPostAlertFanout('p1', NOW);
    db.post = null;
    await runPostAlertFanout('p1', NOW);
    expect(db.created).toEqual([]);
    expect(db.claims.size).toBe(0);
  });

  it('alerts nobody for a post whose author is banned', async () => {
    db.members = [member('a')];
    db.authorBannedUntil = new Date(NOW.getTime() + 1000);
    await runPostAlertFanout('p1', NOW);
    expect(db.created).toEqual([]);
  });

  it('alerts on approval, not on creation: a held post (soft-deleted) alerts nobody until it is released', async () => {
    db.members = [member('a')];
    db.post!.deletedAt = minutesAgo(10); // held
    await runPostAlertFanout('p1', NOW);
    expect(db.created).toEqual([]);
    db.post!.deletedAt = null; // a moderator approved it, which enqueues a new job
    await runPostAlertFanout('p1', NOW);
    expect(told()).toEqual(['a']);
  });

  it('is claimed once: a re-run of the same post alerts nobody', async () => {
    db.members = [member('a'), member('b')];
    await runPostAlertFanout('p1', NOW);
    db.created = [];
    const again = await runPostAlertFanout('p1', NOW);
    expect(again).toEqual({
      notified: 0,
      collapsed: 0,
    });
    expect(db.created).toEqual([]);
  });

  it('gives the claim back when it fails part-way, so the retry can finish', async () => {
    db.members = [member('a'), member('b')];
    vi.mocked(createNotification).mockRejectedValueOnce(new Error('boom'));
    await expect(runPostAlertFanout('p1', NOW)).rejects.toThrow('boom');
    expect(db.claims.has('p1')).toBe(false);
    await runPostAlertFanout('p1', NOW);
    expect(told()).toContain('b');
  });

  it('collapses a burst: a recent unread alert for the community is reworded, not duplicated', async () => {
    db.members = [member('a'), member('b'), member('c'), member('d')];
    const note = (id: string, userId: string, over: Partial<Note> = {}): Note => ({
      id,
      userId,
      type: 'SYSTEM',
      entityType: 'community_post',
      entityId: 'c1',
      read: false,
      createdAt: minutesAgo(10),
      preview: 'Ada posted in Quiet Group',
      ...over,
    });
    db.notes = [
      note('n-a', 'a'), // unread, 10 minutes ago: collapses
      note('n-b', 'b', {
        read: true,
      }), // read: a new alert
      note('n-c', 'c', {
        createdAt: minutesAgo(31),
      }), // too old: a new alert
      note('n-d', 'd', {
        entityId: 'other',
      }), // another community: a new alert
    ];
    const result = await runPostAlertFanout('p1', NOW);
    expect(told()).toEqual(['b', 'c', 'd']);
    expect(result).toEqual({
      notified: 3,
      collapsed: 1,
    });
    expect(db.notes.find((n) => n.id === 'n-a')!.preview).toBe('New posts in Quiet Group');
    expect(db.notes.find((n) => n.id === 'n-b')!.preview).toBe('Ada posted in Quiet Group');
  });

  it('a burst of five posts in ten minutes leaves each member one unread alert', async () => {
    db.members = [member('a')];
    // Each notification the (mocked) createNotification would write lands in the fake table.
    vi.mocked(createNotification).mockImplementation(async (input) => {
      db.created.push(input as unknown as Record<string, unknown>);
      db.notes.push({
        id: `n${db.notes.length}`,
        userId: input.userId,
        type: 'SYSTEM',
        entityType: 'community_post',
        entityId: input.entityId as string,
        read: false,
        createdAt: minutesAgo(10 - db.notes.length * 2),
        preview: input.preview as string,
      });
    });
    for (let i = 1; i <= 5; i++) {
      db.post = {
        id: `p${i}`,
        userId: 'author',
        communityId: 'c1',
        deletedAt: null,
      };
      await runPostAlertFanout(`p${i}`, new Date(NOW.getTime() - (5 - i) * 2 * 60_000));
    }
    expect(db.notes.filter((n) => !n.read)).toHaveLength(1);
    expect(db.notes[0]!.preview).toBe('New posts in Quiet Group');
    vi.mocked(createNotification).mockImplementation(async (input) => {
      db.created.push(input as unknown as Record<string, unknown>);
    });
  });

  it('reads at most 5 000 opted-in members, in batches of 500', async () => {
    db.members = Array.from(
      {
        length: 5200,
      },
      (_, i) => member(`u${String(i).padStart(5, '0')}`),
    );
    const result = await runPostAlertFanout('p1', NOW);
    expect(result.notified).toBe(5000);
  });
});

describe('the setting', () => {
  it('requires membership: a non-member writes nothing and reads nothing', async () => {
    db.members = [
      member('a', {
        postAlerts: 'off',
      }),
    ];
    expect(await setPostAlerts('c1', 'stranger', 'all')).toBeNull();
    expect(await getPostAlerts('c1', 'stranger')).toBeNull();
    expect(db.members.map((m) => m.postAlerts)).toEqual(['off']);
  });

  it('turns alerts on and off for the caller only and says when the community is too large', async () => {
    db.members = [
      member('a', {
        postAlerts: 'off',
      }),
      member('b', {
        postAlerts: 'off',
      }),
    ];
    expect(await setPostAlerts('c1', 'a', 'all')).toEqual({
      level: 'all',
      tooLarge: false,
    });
    expect(db.members.map((m) => m.postAlerts)).toEqual(['all', 'off']);
    db.memberCount = 5001;
    expect(await setPostAlerts('c1', 'a', 'off')).toEqual({
      level: 'off',
      tooLarge: true,
    });
  });

  it('exports the communities a member asked to be alerted for', async () => {
    const { prisma } = await import('@/lib/prisma.server');
    const spy = vi.spyOn(prisma.communityMember, 'findMany').mockResolvedValueOnce([
      {
        communityId: 'c1',
        community: {
          name: 'Quiet Group',
        },
      },
    ] as never);
    expect(await exportPostAlerts('a')).toEqual([
      {
        communityId: 'c1',
        communityName: 'Quiet Group',
        level: 'all',
      },
    ]);
    expect(spy.mock.calls[0]![0]).toMatchObject({
      where: {
        userId: 'a',
        postAlerts: 'all',
      },
    });
    spy.mockRestore();
  });
});
