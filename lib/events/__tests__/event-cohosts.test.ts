import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Event co-hosts: the cap is a cap under the lock, a block either way / a ban / a stranger to the community
// cannot be invited, an invited member has no rights, an accepted co-host edits and reads the waitlist but
// cannot cancel or invite, and stepping down removes every right.

interface Cohost {
  eventId: string;
  userId: string;
  status: string;
  invitedAt: Date;
  respondedAt: Date | null;
}

const h = vi.hoisted(() => ({
  event: null as Record<string, unknown> | null,
  cohosts: [] as Array<{ eventId: string; userId: string; status: string; invitedAt: Date; respondedAt: Date | null }>,
  users: new Map<string, { id: string; name: string; handle: string; image: null; bannedUntil: Date | null }>(),
  blocks: [] as Array<{ blockerId: string; blockedId: string }>,
  log: [] as string[],
  locks: new Map<string, Promise<void>>(),
  notify: vi.fn(async (_n: { userId: string; entityType?: string; entityId?: string; preview?: string }) => {}),
  role: vi.fn(async (_c: string, _u: string): Promise<string | null> => 'MEMBER'),
}));

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

vi.mock('@/lib/prisma.server', () => {
  const where = (row: Cohost, w: Record<string, unknown>): boolean => {
    for (const [k, v] of Object.entries(w)) {
      if (k === 'OR') {
        if (!(v as Record<string, unknown>[]).some((alt) => where(row, alt))) return false;
      } else if (v && typeof v === 'object' && 'in' in (v as object)) {
        if (!(v as { in: unknown[] }).in.includes((row as unknown as Record<string, unknown>)[k])) return false;
      } else if ((row as unknown as Record<string, unknown>)[k] !== v) return false;
    }
    return true;
  };
  const withUser = (r: Cohost) => ({
    ...r,
    user: h.users.get(r.userId) ?? { id: r.userId, name: null, handle: null, image: null },
  });
  const eventCohost = {
    async findUnique({ where: w }: { where: { eventId_userId: { eventId: string; userId: string } } }) {
      await tick();
      const k = w.eventId_userId;
      const r = h.cohosts.find((c) => c.eventId === k.eventId && c.userId === k.userId);
      return r ? withUser(r) : null;
    },
    async findMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      return h.cohosts.filter((c) => where(c, w)).map(withUser);
    },
    async count({ where: w }: { where: Record<string, unknown> }) {
      h.log.push('count');
      await tick();
      return h.cohosts.filter((c) => where(c, w)).length;
    },
    async create({ data }: { data: { eventId: string; userId: string; status: string } }) {
      h.log.push('create');
      await tick();
      const row: Cohost = { ...data, invitedAt: new Date(), respondedAt: null };
      h.cohosts.push(row);
      return withUser(row);
    },
    async updateMany({ where: w, data }: { where: Record<string, unknown>; data: Partial<Cohost> }) {
      await tick();
      const hit = h.cohosts.filter((c) => where(c, w));
      for (const r of hit) Object.assign(r, data);
      return { count: hit.length };
    },
    async deleteMany({ where: w }: { where: Record<string, unknown> }) {
      await tick();
      const hit = h.cohosts.filter((c) => where(c, w));
      for (const r of hit) h.cohosts.splice(h.cohosts.indexOf(r), 1);
      return { count: hit.length };
    },
  };
  const event = {
    async findFirst() {
      await tick();
      return h.event ? { ...h.event } : null;
    },
    async findUnique() {
      await tick();
      return h.event ? { ...h.event } : null;
    },
    async update({ data }: { data: Record<string, unknown> }) {
      await tick();
      Object.assign(h.event!, data);
      return { ...h.event };
    },
  };
  const user = {
    async findUnique({ where: w }: { where: { id: string } }) {
      await tick();
      return h.users.get(w.id) ?? null;
    },
  };
  const userBlock = {
    async findFirst({ where: w }: { where: { OR: Array<{ blockerId: string; blockedId: string }> } }) {
      await tick();
      return h.blocks.find((b) => w.OR.some((o) => o.blockerId === b.blockerId && o.blockedId === b.blockedId)) ?? null;
    },
  };
  const rsvp = {
    async groupBy() {
      return [];
    },
    async findMany() {
      return [];
    },
  };
  const db = {
    eventCohost,
    event,
    user,
    userBlock,
    rsvp,
    async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      if (!strings.join('?').includes('pg_advisory_xact_lock')) return 0;
      return 1 + 0 * values.length;
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const held: (() => void)[] = [];
      const tx = {
        eventCohost,
        event,
        user,
        userBlock,
        async $executeRaw(strings: TemplateStringsArray, ...values: unknown[]) {
          if (!strings.join('?').includes('pg_advisory_xact_lock')) return 0;
          const key = String(values[0]);
          h.log.push(`lock:${key}`);
          while (h.locks.has(key)) await h.locks.get(key);
          let release!: () => void;
          h.locks.set(key, new Promise<void>((resolve) => (release = resolve)));
          held.push(() => {
            h.locks.delete(key);
            release();
          });
          return 1;
        },
      };
      try {
        return await fn(tx);
      } finally {
        for (const release of held) release();
      }
    },
  };
  return { prisma: db };
});
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/communities/access.server', () => ({ getRole: h.role, canModerate: vi.fn() }));
vi.mock('@/lib/calendar/recurring-events.server', () => ({
  OccurrenceError: class OccurrenceError extends Error {},
  activeSeriesWhere: {},
  checkRecurrence: vi.fn(),
  decorateRecurring: vi.fn(),
  isGoingToOccurrence: vi.fn(),
  notifyRotation: vi.fn(),
  occurrenceAfter: vi.fn(),
  rsvpRecurring: vi.fn(),
  unrsvpRecurring: vi.fn(),
  upcomingOccurrenceEventIds: vi.fn(),
}));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: { id: string; name?: string }) => ({ id: u.id, name: u.name ?? null, image: null, handle: null }),
}));

import { EventError, cancelEvent, updateEvent } from '@/lib/events.server';
import { listWaitlist } from '@/lib/events/waitlist.server';
import {
  canManageEvent,
  inviteCohost,
  listCohosts,
  removeCohost,
  respondToCohostInvite,
} from '@/lib/events/cohosts.server';
import { MAX_COHOSTS } from '@/lib/events/cohosts';

const FUTURE = new Date(Date.now() + 7 * 86_400_000);

function setupEvent(over: Record<string, unknown> = {}) {
  h.event = {
    id: 'e1',
    kind: 'event',
    owner: 'USER',
    visibility: 'PUBLIC',
    pollId: null,
    hostId: 'host',
    communityId: null,
    title: 'Game night',
    description: '',
    startsAt: FUTURE,
    endsAt: null,
    recurrence: null,
    recurUntil: null,
    recurTz: null,
    rotatingHostIds: [],
    venueKind: 'URL',
    venueRef: 'https://example.com',
    href: null,
    capacity: null,
    canceledAt: null,
    createdAt: new Date(0),
    host: { id: 'host', name: 'Host' },
    community: null,
    ...over,
  };
}

const user = (id: string, over: Partial<{ bannedUntil: Date | null }> = {}) =>
  h.users.set(id, { id, name: id, handle: id, image: null, bannedUntil: null, ...over });

const addRow = (userId: string, status: 'invited' | 'accepted') =>
  h.cohosts.push({ eventId: 'e1', userId, status, invitedAt: new Date(), respondedAt: null });

const statusOf = (userId: string) => h.cohosts.find((c) => c.userId === userId)?.status;

beforeEach(() => {
  h.cohosts.length = 0;
  h.users.clear();
  h.blocks.length = 0;
  h.log.length = 0;
  h.locks.clear();
  h.notify.mockClear();
  h.role.mockReset();
  h.role.mockResolvedValue('MEMBER');
  setupEvent();
  for (const id of ['host', 'a', 'b', 'c', 'd', 'e', 'f', 'stranger']) user(id);
});

describe('inviting', () => {
  it('the host invites a member, who is notified once; repeating it changes nothing', async () => {
    const first = await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' });
    expect(first.ok && first.value.status).toBe('invited');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({ userId: 'a', entityType: 'event_cohost', entityId: 'e1' });
    expect(noticeFallbackText(h.notify.mock.calls[0]![0].preview as never)).toContain(
      'invited you to co-host Game night',
    );

    const again = await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' });
    expect(again.ok).toBe(true);
    expect(h.cohosts).toHaveLength(1);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('takes the event-cohost lock before it counts', async () => {
    await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' });
    expect(h.log.indexOf('lock:event-cohost:e1')).toBeGreaterThanOrEqual(0);
    expect(h.log.indexOf('lock:event-cohost:e1')).toBeLessThan(h.log.indexOf('count'));
  });

  it('refuses a sixth, counting invited and accepted alike', async () => {
    for (const id of ['a', 'b', 'c']) addRow(id, 'accepted');
    for (const id of ['d', 'e']) addRow(id, 'invited');
    expect(MAX_COHOSTS).toBe(5);
    const sixth = await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'f' });
    expect(sixth).toEqual({ ok: false, code: 'full' });
    expect(h.cohosts).toHaveLength(5);
  });

  it('two racing invitations cannot both take the last place', async () => {
    for (const id of ['a', 'b', 'c', 'd']) addRow(id, 'accepted');
    const results = await Promise.all([
      inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'e' }),
      inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'f' }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok && r.code === 'full')).toHaveLength(1);
    expect(h.cohosts).toHaveLength(5);
  });

  it('refuses a block in either direction', async () => {
    h.blocks.push({ blockerId: 'host', blockedId: 'a' }, { blockerId: 'b', blockedId: 'host' });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' })).toEqual({ ok: false, code: 'blocked' });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).toEqual({ ok: false, code: 'blocked' });
    expect(h.cohosts).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses a banned member, but not one whose ban has lapsed', async () => {
    user('a', { bannedUntil: new Date(Date.now() + 86_400_000) });
    user('b', { bannedUntil: new Date(Date.now() - 86_400_000) });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' })).toEqual({ ok: false, code: 'banned' });
    expect((await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).ok).toBe(true);
  });

  it('refuses a non-member of the community on a community event', async () => {
    setupEvent({ owner: 'COMMUNITY', communityId: 'c1' });
    h.role.mockImplementation(async (_c, u) => (u === 'a' ? null : 'MEMBER'));
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'a' })).toEqual({
      ok: false,
      code: 'not-member',
    });
    expect((await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).ok).toBe(true);
  });

  it('refuses the host themself, a canceled event, an unknown member and a non-host', async () => {
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'host' })).toEqual({ ok: false, code: 'self' });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'nobody' })).toEqual({
      ok: false,
      code: 'user-not-found',
    });
    addRow('a', 'accepted');
    expect(await inviteCohost({ eventId: 'e1', actorId: 'a', userId: 'b' })).toEqual({ ok: false, code: 'not-host' });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'stranger', userId: 'b' })).toEqual({
      ok: false,
      code: 'not-found',
    });
    setupEvent({ canceledAt: new Date() });
    expect(await inviteCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).toEqual({
      ok: false,
      code: 'canceled',
    });
  });
});

describe('answering an invitation', () => {
  it('accepting makes them a co-host and tells the host once', async () => {
    addRow('a', 'invited');
    expect(await respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: true })).toEqual({
      ok: true,
      value: { accept: true },
    });
    expect(statusOf('a')).toBe('accepted');
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({ userId: 'host', entityType: 'event_cohost' });

    await respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: true });
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('two accepts at once notify once', async () => {
    addRow('a', 'invited');
    await Promise.all([
      respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: true }),
      respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: true }),
    ]);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('declining deletes the invitation and tells nobody', async () => {
    addRow('a', 'invited');
    expect((await respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: false })).ok).toBe(true);
    expect(h.cohosts).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('an accept re-checks the block and the ban, and the invitation stays pending', async () => {
    addRow('a', 'invited');
    addRow('b', 'invited');
    h.blocks.push({ blockerId: 'a', blockedId: 'host' });
    user('b', { bannedUntil: new Date(Date.now() + 86_400_000) });
    expect(await respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: true })).toEqual({
      ok: false,
      code: 'blocked',
    });
    expect(await respondToCohostInvite({ eventId: 'e1', userId: 'b', accept: true })).toEqual({
      ok: false,
      code: 'banned',
    });
    expect(statusOf('a')).toBe('invited');
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('there is nothing to answer without an invitation, and a co-host cannot decline', async () => {
    expect(await respondToCohostInvite({ eventId: 'e1', userId: 'stranger', accept: true })).toEqual({
      ok: false,
      code: 'no-invite',
    });
    addRow('a', 'accepted');
    expect(await respondToCohostInvite({ eventId: 'e1', userId: 'a', accept: false })).toEqual({
      ok: false,
      code: 'already-accepted',
    });
    expect(statusOf('a')).toBe('accepted');
  });
});

describe('what a role may do', () => {
  const edit = { id: 'e1', title: 'Renamed' };

  it('an invited (unaccepted) co-host cannot edit and cannot read the waitlist', async () => {
    addRow('a', 'invited');
    expect(await canManageEvent({ id: 'e1', hostId: 'host' }, 'a')).toBeNull();
    await expect(updateEvent({ ...edit, hostId: 'a' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listWaitlist('e1', 'a', false)).rejects.toBeInstanceOf(EventError);
    expect(h.event!.title).toBe('Game night');
  });

  it('an accepted co-host edits the event and reads the waitlist', async () => {
    addRow('a', 'accepted');
    expect(await canManageEvent({ id: 'e1', hostId: 'host' }, 'a')).toBe('cohost');
    const saved = await updateEvent({ ...edit, hostId: 'a' });
    expect(saved.title).toBe('Renamed');
    expect((await listWaitlist('e1', 'a', false)).waitlist).toEqual([]);
  });

  it('the host still manages, and a stranger does not', async () => {
    expect(await canManageEvent({ id: 'e1', hostId: 'host' }, 'host')).toBe('host');
    expect(await canManageEvent({ id: 'e1', hostId: 'host' }, 'stranger')).toBeNull();
    await expect(updateEvent({ ...edit, hostId: 'stranger' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('a co-host cannot cancel the event, invite or remove another co-host, or change the repeat rule', async () => {
    addRow('a', 'accepted');
    addRow('b', 'accepted');
    await expect(cancelEvent('e1', 'a')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.event!.canceledAt).toBeNull();
    expect(await inviteCohost({ eventId: 'e1', actorId: 'a', userId: 'c' })).toEqual({ ok: false, code: 'not-host' });
    expect(await removeCohost({ eventId: 'e1', actorId: 'a', userId: 'b' })).toEqual({ ok: false, code: 'not-host' });
    expect(statusOf('b')).toBe('accepted');
    await expect(updateEvent({ ...edit, hostId: 'a', recurrence: null })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('stepping down removes every right', async () => {
    addRow('a', 'accepted');
    expect(await removeCohost({ eventId: 'e1', actorId: 'a', userId: 'a' })).toEqual({ ok: true, value: true });
    expect(await canManageEvent({ id: 'e1', hostId: 'host' }, 'a')).toBeNull();
    await expect(updateEvent({ ...edit, hostId: 'a' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(listWaitlist('e1', 'a', false)).rejects.toBeInstanceOf(EventError);
    expect(h.notify).not.toHaveBeenCalled();
  });
});

describe('removing and listing', () => {
  it('the host removes a co-host or an invitation, and nobody is told; a stranger is told nothing exists', async () => {
    addRow('a', 'accepted');
    addRow('b', 'invited');
    expect(await removeCohost({ eventId: 'e1', actorId: 'stranger', userId: 'a' })).toEqual({
      ok: false,
      code: 'not-found',
    });
    expect((await removeCohost({ eventId: 'e1', actorId: 'host', userId: 'a' })).ok).toBe(true);
    expect((await removeCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).ok).toBe(true);
    expect((await removeCohost({ eventId: 'e1', actorId: 'host', userId: 'b' })).ok).toBe(true);
    expect(h.cohosts).toHaveLength(0);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('the host lists everyone; an accepted co-host only the accepted; an invited member nothing', async () => {
    addRow('a', 'accepted');
    addRow('b', 'invited');
    const hostView = await listCohosts('e1', 'host');
    expect(hostView.ok && hostView.value.map((c) => `${c.id}:${c.status}`).sort()).toEqual(['a:accepted', 'b:invited']);
    const cohostView = await listCohosts('e1', 'a');
    expect(cohostView.ok && cohostView.value.map((c) => c.id)).toEqual(['a']);
    expect(await listCohosts('e1', 'b')).toEqual({ ok: false, code: 'not-found' });
    expect(await listCohosts('e1', 'stranger')).toEqual({ ok: false, code: 'not-found' });
  });
});
