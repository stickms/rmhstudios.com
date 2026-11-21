import { beforeEach, describe, expect, it, vi } from 'vitest';

// Event updates: who may post, the rolling limit under the lock, the delete window, cancelled events, who the
// fan-out tells (going, maybe, waitlist; never no, the author or a blocked pair) and that the job claims once.

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const state = {
    event: {
      id: 'ev1',
      hostId: 'host',
      communityId: null,
      visibility: 'PUBLIC',
      pollId: null,
      title: 'Game night',
      startsAt: new Date('2026-12-01T18:00:00Z'),
      endsAt: null,
      recurrence: null,
      recurUntil: null,
      recurTz: null,
      canceledAt: null as Date | null,
    } as Row,
    updates: [] as Row[],
    rsvps: [] as Row[],
    blocks: [] as Row[],
    banned: new Set<string>(),
    managers: new Set<string>(['host']),
    order: [] as string[],
    notified: [] as { userId: string; preview: string; entityType: string }[],
    sent: [] as { name: string; data: unknown; opts: unknown }[],
    seq: 0,
  };
  return state;
});

const prismaMock = vi.hoisted(() => {
  const p = {
    event: { findUnique: vi.fn(async () => h.event) },
    eventUpdate: {
      findMany: vi.fn(async (args: { where: Row }) => {
        const w = args.where as { createdAt?: { gt: Date }; deletedAt?: null; eventId: string };
        return h.updates
          .filter((u) => (w.createdAt ? (u.createdAt as Date) > w.createdAt.gt : true))
          .filter((u) => (w.deletedAt === null ? u.deletedAt == null : true))
          .sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime());
      }),
      findFirst: vi.fn(async (args: { where: Row }) => {
        const w = args.where as { id: string; deletedAt: null };
        return h.updates.find((u) => u.id === w.id && u.deletedAt == null) ?? null;
      }),
      findUnique: vi.fn(async (args: { where: { id: string } }) => h.updates.find((u) => u.id === args.where.id) ?? null),
      create: vi.fn(async (args: { data: Row }) => {
        h.order.push('create');
        const row = { id: `u${++h.seq}`, createdAt: new Date(), notifiedAt: null, deletedAt: null, ...args.data };
        h.updates.push(row);
        return row;
      }),
      updateMany: vi.fn(async (args: { where: Row; data: Row }) => {
        const w = args.where as { id: string; notifiedAt?: null; deletedAt?: null };
        let count = 0;
        for (const u of h.updates) {
          if (u.id !== w.id) continue;
          if ('notifiedAt' in w && u.notifiedAt != null) continue;
          if ('deletedAt' in w && u.deletedAt != null) continue;
          Object.assign(u, args.data);
          count++;
        }
        return { count };
      }),
    },
    rsvp: {
      findMany: vi.fn(async (args: { where: Row }) => {
        const w = args.where as { status?: { in: string[] }; OR?: { occurrenceAt: Date }[] };
        return h.rsvps.filter((r) => {
          if (w.status) return w.status.in.includes(r.status as string);
          if (w.OR) return w.OR.some((o) => o.occurrenceAt.getTime() === (r.occurrenceAt as Date).getTime());
          return true;
        });
      }),
    },
    userBlock: {
      findMany: vi.fn(async () => h.blocks),
    },
    user: {
      findMany: vi.fn(async (args?: { where?: { id?: { in: string[] }; bannedUntil?: unknown } }) =>
        args?.where?.bannedUntil ? (args.where.id?.in ?? []).filter((id) => h.banned.has(id)).map((id) => ({ id })) : [],
      ),
    },
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(p)),
  };
  return p;
});

vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));
vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    h.order.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/events/cohosts.server', () => ({
  canManageEvent: vi.fn(async (_e: unknown, id: string) => (h.managers.has(id) ? 'host' : null)),
}));
vi.mock('@/lib/events.server', () => ({ canViewEvent: vi.fn(async () => true) }));
vi.mock('@/lib/events/occurrences.server', () => ({ overridesFor: vi.fn(async () => []) }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (a: { userId: string; preview: string; entityType: string }) => {
    h.notified.push({ userId: a.userId, preview: a.preview, entityType: a.entityType });
  }),
}));
vi.mock('@/lib/jobs/boss.server', () => ({
  getBoss: vi.fn(async () => ({
    send: async (name: string, data: unknown, opts: unknown) => {
      h.sent.push({ name, data, opts });
    },
  })),
}));

import {
  UpdateError,
  deleteUpdate,
  listUpdates,
  postUpdate,
  recipientCount,
  runEventUpdateFanout,
} from '@/lib/events/updates.server';
import { WHOLE_EVENT } from '@/lib/calendar/event-model';

const NOW = new Date('2026-11-30T12:00:00Z');
const rsvp = (userId: string, status: string, occurrenceAt: Date = WHOLE_EVENT, everyTime = false): Row => ({
  userId,
  status,
  occurrenceAt,
  everyTime,
});
const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return e instanceof UpdateError ? e : (e as Error);
  }
};

beforeEach(() => {
  h.updates.length = 0;
  h.rsvps.length = 0;
  h.blocks.length = 0;
  h.banned.clear();
  h.order.length = 0;
  h.notified.length = 0;
  h.sent.length = 0;
  h.managers = new Set(['host']);
  h.event.canceledAt = null;
  h.event.recurrence = null;
  h.seq = 0;
  vi.clearAllMocks();
});

describe('who may post', () => {
  it('lets the host, a co-host and an admin post; refuses everyone else', async () => {
    h.managers.add('cohost');
    expect((await postUpdate('ev1', 'host', false, { body: 'a' }, NOW)).body).toBe('a');
    expect((await postUpdate('ev1', 'cohost', false, { body: 'b' }, NOW)).body).toBe('b');
    expect((await postUpdate('ev1', 'admin', true, { body: 'c' }, NOW)).body).toBe('c');
    const refused = await code(postUpdate('ev1', 'stranger', false, { body: 'd' }, NOW));
    expect(refused).toMatchObject({ code: 'FORBIDDEN' });
    expect(h.updates).toHaveLength(3);
  });

  it('queues the fan-out once per update, keyed by the update', async () => {
    const u = await postUpdate('ev1', 'host', false, { body: 'x' }, NOW);
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0]).toMatchObject({ name: 'events.update-fanout', data: { updateId: u.id } });
    expect(h.sent[0]!.opts).toMatchObject({ singletonKey: `event-update:${u.id}` });
  });
});

describe('the limit', () => {
  it('refuses the fourth update in 24 hours, under the lock, and says when the next is possible', async () => {
    for (const mins of [30, 20, 10]) {
      h.updates.push({
        id: `old${mins}`,
        eventId: 'ev1',
        createdAt: new Date(NOW.getTime() - mins * 3_600_000 * 0.5),
        deletedAt: null,
        body: 'x',
      });
    }
    const refused = (await code(postUpdate('ev1', 'host', false, { body: 'four' }, NOW))) as UpdateError;
    expect(refused.code).toBe('RATE_LIMITED');
    // The oldest of the three (15 hours ago) falls out of the window 9 hours from now.
    expect(refused.nextAt!.getTime()).toBe(NOW.getTime() - 15 * 3_600_000 + 24 * 3_600_000);
    expect(h.order[0]).toBe('lock:event-update:ev1');
    expect(h.order).not.toContain('create');
  });

  it('counts a deleted update, so deleting and reposting is not a way round it', async () => {
    for (let i = 0; i < 3; i++)
      h.updates.push({ id: `d${i}`, eventId: 'ev1', createdAt: new Date(NOW.getTime() - 3_600_000), deletedAt: new Date(), body: 'x' });
    expect(await code(postUpdate('ev1', 'host', false, { body: 'again' }, NOW))).toMatchObject({ code: 'RATE_LIMITED' });
  });

  it('allows a post once the oldest has left the window', async () => {
    for (const hrs of [25, 2, 1])
      h.updates.push({ id: `o${hrs}`, eventId: 'ev1', createdAt: new Date(NOW.getTime() - hrs * 3_600_000), deletedAt: null, body: 'x' });
    expect((await postUpdate('ev1', 'host', false, { body: 'ok' }, NOW)).body).toBe('ok');
  });

  it('refuses a cancelled event', async () => {
    h.event.canceledAt = new Date();
    expect(await code(postUpdate('ev1', 'host', false, { body: 'x' }, NOW))).toMatchObject({ code: 'CANCELED' });
    expect(h.sent).toHaveLength(0);
  });
});

describe('delete', () => {
  it('lets the author delete within 10 minutes and refuses after', async () => {
    h.updates.push({ id: 'fresh', eventId: 'ev1', authorId: 'host', createdAt: new Date(NOW.getTime() - 9 * 60_000), deletedAt: null, body: 'x' });
    h.updates.push({ id: 'stale', eventId: 'ev1', authorId: 'host', createdAt: new Date(NOW.getTime() - 11 * 60_000), deletedAt: null, body: 'x' });
    await deleteUpdate('ev1', 'fresh', 'host', false, NOW);
    expect(h.updates.find((u) => u.id === 'fresh')!.deletedAt).toEqual(NOW);
    expect(await code(deleteUpdate('ev1', 'stale', 'host', false, NOW))).toMatchObject({ code: 'TOO_LATE' });
  });

  it('refuses someone who is not the author unless they are an admin', async () => {
    h.updates.push({ id: 'u', eventId: 'ev1', authorId: 'host', createdAt: new Date(NOW.getTime() - 60_000), deletedAt: null, body: 'x' });
    expect(await code(deleteUpdate('ev1', 'u', 'other', false, NOW))).toMatchObject({ code: 'FORBIDDEN' });
    await deleteUpdate('ev1', 'u', 'admin', true, NOW);
    expect(h.updates[0]!.deletedAt).toEqual(NOW);
  });

  it('shows the delete control only to the author or an admin, inside the window', async () => {
    h.updates.push({ id: 'u', eventId: 'ev1', authorId: 'host', body: 'x', occurrenceAt: null, createdAt: new Date(NOW.getTime() - 60_000), deletedAt: null });
    expect((await listUpdates('ev1', 'host', false, NOW))![0]!.canDelete).toBe(true);
    expect((await listUpdates('ev1', 'guest', false, NOW))![0]!.canDelete).toBe(false);
    expect((await listUpdates('ev1', 'admin', true, NOW))![0]!.canDelete).toBe(true);
    expect((await listUpdates('ev1', 'host', false, new Date(NOW.getTime() + 11 * 60_000)))![0]!.canDelete).toBe(false);
  });
});

describe('recipients and the fan-out', () => {
  const post = () => {
    h.updates.push({
      id: 'up1',
      eventId: 'ev1',
      occurrenceAt: null,
      authorId: 'host',
      body: 'We moved to room 4',
      createdAt: NOW,
      notifiedAt: null,
      deletedAt: null,
    });
  };

  it('tells going, maybe and waitlist; never no, the author or a blocked pair', async () => {
    h.rsvps.push(
      rsvp('a', 'going'),
      rsvp('b', 'maybe'),
      rsvp('c', 'waitlist'),
      rsvp('d', 'no'),
      rsvp('host', 'going'),
      rsvp('blocked', 'going'),
      rsvp('blocker', 'going'),
    );
    h.blocks.push({ blockerId: 'host', blockedId: 'blocked' }, { blockerId: 'blocker', blockedId: 'host' });
    post();
    expect(await runEventUpdateFanout('up1')).toBe(3);
    expect(h.notified.map((n) => n.userId).sort()).toEqual(['a', 'b', 'c']);
    expect(h.notified.every((n) => n.entityType === 'event_update' && n.preview === 'We moved to room 4')).toBe(true);
    expect(await recipientCount('ev1', 'host', false, undefined, NOW)).toBe(3);
  });

  it('does not tell site-banned accounts, in the job or the preview count', async () => {
    h.rsvps.push(rsvp('a', 'going'), rsvp('banned', 'going'));
    h.banned.add('banned');
    post();
    expect(await recipientCount('ev1', 'host', false, undefined, NOW)).toBe(1);
    expect(await runEventUpdateFanout('up1')).toBe(1);
    expect(h.notified.map((n) => n.userId)).toEqual(['a']);
  });

  it('claims the update once: a second run tells nobody', async () => {
    h.rsvps.push(rsvp('a', 'going'));
    post();
    expect(await runEventUpdateFanout('up1')).toBe(1);
    expect(await runEventUpdateFanout('up1')).toBe(0);
    expect(h.notified).toHaveLength(1);
    expect(h.updates[0]!.notifiedAt).toBeInstanceOf(Date);
  });

  it('tells nobody for a deleted update', async () => {
    h.rsvps.push(rsvp('a', 'going'));
    post();
    h.updates[0]!.deletedAt = new Date();
    expect(await runEventUpdateFanout('up1')).toBe(0);
  });

  it('for one date of a repeating event, uses that date’s attendance: a standing yes, minus a per-date no, plus the waitlist', async () => {
    h.event.recurrence = 'W';
    h.event.recurTz = 'UTC';
    const date = new Date('2026-12-08T18:00:00Z');
    h.rsvps.push(
      rsvp('every', 'going', WHOLE_EVENT, true),
      rsvp('sitting-out', 'going', WHOLE_EVENT, true),
      rsvp('sitting-out', 'no', date),
      rsvp('once', 'maybe', date),
      rsvp('other-date', 'going', new Date('2026-12-15T18:00:00Z')),
      rsvp('waiting', 'waitlist', WHOLE_EVENT),
    );
    h.updates.push({ id: 'up1', eventId: 'ev1', occurrenceAt: date, authorId: 'host', body: 'x', createdAt: NOW, notifiedAt: null, deletedAt: null });
    await runEventUpdateFanout('up1');
    expect(h.notified.map((n) => n.userId).sort()).toEqual(['every', 'once', 'waiting']);
  });
});
