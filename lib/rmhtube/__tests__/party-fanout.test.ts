import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The `tube-party` fan-out (s13-07): a public party reaches each eligible subscriber once; a private, closed or past
 * one reaches nobody; subscribers blocked either way with the host, banned, pending deletion or already going are
 * skipped; a run resumed after a worker died tells nobody twice. Prisma is a small in-memory fake.
 */

const NOW = new Date('2026-12-01T12:00:00Z');
const START = new Date('2026-12-05T18:00:00Z');

interface Sub {
  subscriberId: string;
  bannedUntil: Date | null;
  deletionScheduledAt: Date | null;
}

const db = vi.hoisted(() => ({
  room: null as null | {
    id: string;
    name: string | null;
    hostId: string;
    isPublic: boolean;
    closedAt: Date | null;
    scheduledFor: Date | null;
    host: Record<string, unknown>;
  },
  subs: [] as {
    subscriberId: string;
    bannedUntil: Date | null;
    deletionScheduledAt: Date | null;
  }[],
  blocks: [] as { blockerId: string; blockedId: string }[],
  going: [] as string[],
  notes: [] as Record<string, unknown>[],
  created: [] as Record<string, unknown>[],
  fanoutRuns: [] as unknown[],
  boss: null as null | { send: ReturnType<typeof vi.fn> },
}));

vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => db.boss }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (input: Record<string, unknown>) => {
    db.created.push(input);
  }),
}));
vi.mock('@/lib/prisma.server', async () => {
  const { createFanoutRunFake } = await import('@/lib/fanout/__tests__/fake-fanout-run');
  const fanout = createFanoutRunFake(db.fanoutRuns as never);
  const ids = (w: unknown): string[] | undefined => (w as { in?: string[] } | undefined)?.in;
  return {
    prisma: {
      fanoutRun: fanout.fanoutRun,
      rmhTubeRoom: { findUnique: async () => db.room },
      rmhTubeSubscription: {
        findMany: async ({
          where,
          take,
        }: {
          where: { channelId: string; subscriberId?: { gt: string } };
          take: number;
        }) =>
          db.subs
            .filter((s) => !where.subscriberId || s.subscriberId > where.subscriberId.gt)
            .sort((a, b) => (a.subscriberId < b.subscriberId ? -1 : 1))
            .slice(0, take)
            .map((s) => ({
              subscriberId: s.subscriberId,
              subscriber: {
                id: s.subscriberId,
                bannedUntil: s.bannedUntil,
                deletionScheduledAt: s.deletionScheduledAt,
              },
            })),
      },
      userBlock: {
        findMany: async ({ where }: { where: { OR: { blockerId: unknown; blockedId: unknown }[] } }) => {
          const wanted = where.OR.flatMap((c) => [ids(c.blockedId), ids(c.blockerId)]).find((x) => x) ?? [];
          return db.blocks.filter((b) => wanted.includes(b.blockerId) || wanted.includes(b.blockedId));
        },
      },
      rmhTubeRoomRsvp: {
        findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
          db.going.filter((u) => where.userId.in.includes(u)).map((userId) => ({ userId })),
      },
      notification: {
        findMany: async ({ where }: { where: { userId: { in: string[] } } }) =>
          db.notes.filter((n) => where.userId.in.includes(n.userId as string)),
      },
    },
  };
});

import { createNotification } from '@/lib/notifications.server';
import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { enqueueTubePartyFanout, runTubePartyFanout } from '@/lib/rmhtube/subscriptions.server';
import { PARTY_FANOUT_QUEUE, partyFanoutJobKey, partyNoticeLink } from '@/lib/rmhtube/subscriptions';

const host = (over: Record<string, unknown> = {}) => ({
  id: 'host',
  name: 'Ada',
  image: null,
  username: null,
  handle: 'ada',
  isVerified: false,
  isAdmin: false,
  isBot: false,
  profile: null,
  inventory: [],
  bannedUntil: null,
  deletionScheduledAt: null,
  ...over,
});
const sub = (id: string, over: Partial<Sub> = {}): Sub => ({
  subscriberId: id,
  bannedUntil: null,
  deletionScheduledAt: null,
  ...over,
});
const told = () => db.created.map((c) => c.userId as string);

beforeEach(() => {
  db.room = {
    id: 'ROOM01',
    name: 'Movie night',
    hostId: 'host',
    isPublic: true,
    closedAt: null,
    scheduledFor: START,
    host: host(),
  };
  db.subs = [];
  db.blocks = [];
  db.going = [];
  db.notes = [];
  db.created = [];
  db.fanoutRuns.length = 0;
  db.boss = { send: vi.fn(async () => 'job') };
  vi.mocked(createNotification).mockClear();
});

describe('who a public party reaches', () => {
  it('tells every eligible subscriber once, with a notice that links to the party page', async () => {
    db.subs = [sub('a'), sub('b'), sub('c')];
    const result = await runTubePartyFanout('ROOM01', NOW);
    expect(result.notified).toBe(3);
    expect(told()).toEqual(['a', 'b', 'c']);
    const first = db.created[0]!;
    expect(first).toMatchObject({
      type: 'SYSTEM',
      entityType: 'rmhtube_party',
      entityId: 'ROOM01',
      link: partyNoticeLink('ROOM01'),
    });
    expect(first.link).toBe('/rmhtube/party/ROOM01');
    expect(noticeFallbackText(first.preview as never)).toBe(
      'Ada scheduled a watch party: Movie night on 5 Dec 2026, 18:00 UTC',
    );
    expect(db.fanoutRuns[0]).toMatchObject({ kind: 'tube-party', subjectId: 'ROOM01', status: 'DONE', sent: 3 });
  });

  it('a second run of the same party tells nobody again', async () => {
    db.subs = [sub('a'), sub('b')];
    await runTubePartyFanout('ROOM01', NOW);
    const again = await runTubePartyFanout('ROOM01', NOW);
    expect(again.notified).toBe(0);
    expect(told()).toEqual(['a', 'b']);
  });

  it('a private party, a closed one, a past one and an unscheduled room tell nobody', async () => {
    db.subs = [sub('a')];
    db.room = { ...db.room!, isPublic: false };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    db.room = { ...db.room!, isPublic: true, closedAt: NOW };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    db.room = { ...db.room!, closedAt: null, scheduledFor: new Date(NOW.getTime() - 1000) };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    db.room = { ...db.room!, scheduledFor: null };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    db.room = null;
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    expect(db.created).toHaveLength(0);
    expect(db.fanoutRuns).toHaveLength(0);
  });

  it('a banned or pending-deletion host tells nobody', async () => {
    db.subs = [sub('a')];
    db.room = { ...db.room!, host: host({ bannedUntil: new Date(NOW.getTime() + 86_400_000) }) };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
    db.room = { ...db.room!, host: host({ deletionScheduledAt: NOW }) };
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
  });

  it('skips subscribers blocked either way, banned, pending deletion, or already going', async () => {
    db.subs = [
      sub('ok'),
      sub('blocked-by-host'),
      sub('blocked-host'),
      sub('banned', { bannedUntil: new Date(NOW.getTime() + 86_400_000) }),
      sub('lapsed-ban', { bannedUntil: new Date(NOW.getTime() - 86_400_000) }),
      sub('leaving', { deletionScheduledAt: NOW }),
      sub('going'),
    ];
    db.blocks = [
      { blockerId: 'host', blockedId: 'blocked-by-host' },
      { blockerId: 'blocked-host', blockedId: 'host' },
    ];
    db.going = ['going'];
    const result = await runTubePartyFanout('ROOM01', NOW);
    expect(told().sort()).toEqual(['lapsed-ban', 'ok']);
    expect(result.notified).toBe(2);
  });

  it('never reaches anyone who does not subscribe to this host', async () => {
    db.subs = [];
    expect((await runTubePartyFanout('ROOM01', NOW)).notified).toBe(0);
  });
});

describe('a worker that dies mid-run', () => {
  it('tells each of 450 subscribers exactly once after the restart', async () => {
    db.subs = Array.from({ length: 450 }, (_, i) => sub(`u${String(i).padStart(4, '0')}`));
    let calls = 0;
    vi.mocked(createNotification).mockImplementation(async (input) => {
      // The worker dies in the middle of the second batch (after 200 + 50).
      if (++calls === 251) throw new Error('killed');
      db.created.push({ ...input });
      db.notes.push({
        userId: input.userId,
        type: 'SYSTEM',
        entityType: 'rmhtube_party',
        link: input.link,
        createdAt: NOW,
      });
    });
    await expect(runTubePartyFanout('ROOM01', NOW)).rejects.toThrow('killed');
    expect(db.fanoutRuns[0]).toMatchObject({ status: 'RUNNING', cursor: 'u0199', sent: 200 });
    const resumed = await runTubePartyFanout('ROOM01', NOW);
    expect(resumed.notified).toBe(450);
    expect(told()).toHaveLength(450);
    expect(new Set(told()).size).toBe(450);
    expect(db.fanoutRuns[0]).toMatchObject({ status: 'DONE', sent: 450 });
  });
});

describe('the queue', () => {
  it('sends one keyed job per party and never throws when the queue is down', async () => {
    await enqueueTubePartyFanout('ROOM01');
    expect(db.boss!.send).toHaveBeenCalledWith(
      PARTY_FANOUT_QUEUE,
      { roomId: 'ROOM01' },
      expect.objectContaining({ singletonKey: partyFanoutJobKey('ROOM01') }),
    );
    db.boss = null;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(enqueueTubePartyFanout('ROOM01')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
