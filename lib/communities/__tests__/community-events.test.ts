/**
 * A community's events on its own page (s10-07): visibility of the upcoming and past lists, the endpoint that serves
 * them, hosting as a non-moderator, and the mod-log rows a community event's creation and cancellation write.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';

const h = vi.hoisted(() => {
  const modLog = { create: vi.fn() };
  const event = { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
  const tx = { event, communityModAction: modLog };
  return {
    event,
    modLog,
    tx,
    community: { findUnique: vi.fn() },
    rsvp: { groupBy: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
    role: { value: null as string | null },
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    community: h.community,
    event: h.event,
    rsvp: h.rsvp,
    eventCohost: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(h.tx),
  },
}));
vi.mock('@/lib/communities/access.server', () => ({
  getRole: async () => h.role.value,
  canModerate: (r: string | null) => r === 'ADMIN' || r === 'MOD',
}));
vi.mock('@/lib/communities/guard.server', () => ({
  communityWithRole: async (slug: string) =>
    slug === 'known' || slug === 'secret' ? { id: slug === 'secret' ? 'c-secret' : 'c1', slug } : null,
}));
vi.mock('@/lib/events/waitlist.server', () => ({
  announcePromotions: vi.fn(),
  lockEventRsvps: vi.fn(),
  promoteFromWaitlist: vi.fn(),
  readSeatState: vi.fn(),
  readWaitlist: async () => [],
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn(async () => undefined) }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/calendar/recurring-events.server', () => ({
  OccurrenceError: class extends Error {},
  activeSeriesWhere: () => ({ recurrence: { not: null } }),
  checkRecurrence: vi.fn(),
  decorateRecurring: async (m: unknown) => m,
  isGoingToOccurrence: vi.fn(),
  notifyRotation: vi.fn(),
  occurrenceAfter: vi.fn(),
  rsvpRecurring: vi.fn(),
  unrsvpRecurring: vi.fn(),
  upcomingOccurrenceEventIds: async () => [],
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@/lib/events/reminders.server', () => ({
  EVENT_REMINDER_QUEUE: 'q',
  cancelEventReminders: vi.fn(),
  scheduleEventReminders: vi.fn(),
}));

import { createEvent, cancelEvent, listCommunityPastEvents, listEvents, EventError } from '@/lib/events.server';

const ROW = {
  id: 'e1',
  owner: 'COMMUNITY',
  kind: 'event',
  visibility: 'PUBLIC',
  pollId: null,
  href: null,
  hostId: 'host',
  communityId: 'c1',
  title: 'Game night',
  description: 'd',
  startsAt: new Date(Date.now() + 3600_000),
  endsAt: null,
  venueKind: 'IRL',
  venueRef: 'Somewhere',
  capacity: null,
  canceledAt: null,
  createdAt: new Date(),
  recurrence: null,
  host: { id: 'host', name: 'H', handle: 'h', image: null },
  community: { id: 'c1', slug: 'known', name: 'N', icon: null, color: null, isPrivate: false },
  canceled: null,
};
const PAST_ROW = {
  ...ROW,
  id: 'e0',
  startsAt: new Date(Date.now() - 86_400_000 * 3),
  endsAt: new Date(Date.now() - 86_400_000 * 3 + 3600_000),
};

const publicCommunity = () => h.community.findUnique.mockResolvedValue({ id: 'c1', isPrivate: false, members: false });
const privateCommunity = (isMember: boolean) =>
  h.community.findUnique.mockResolvedValue({ id: 'c-secret', isPrivate: true, members: isMember ? [{ id: 'm' }] : [] });

beforeEach(() => {
  for (const fn of [
    ...Object.values(h.event),
    ...Object.values(h.community),
    ...Object.values(h.rsvp),
    h.modLog.create,
  ]) {
    (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.role.value = null;
  h.rsvp.groupBy.mockResolvedValue([]);
  h.rsvp.findMany.mockResolvedValue([]);
  h.rsvp.deleteMany.mockResolvedValue({ count: 0 });
  h.modLog.create.mockResolvedValue({ id: 1n });
});

describe("a private community's events are for members", () => {
  it('the upcoming and past lists are empty for signed out and for a non-member, with no event query', async () => {
    privateCommunity(false);
    for (const viewer of [null, 'stranger']) {
      expect(await listEvents({ scope: 'community', communityId: 'c-secret', userId: viewer })).toEqual([]);
      expect(await listCommunityPastEvents('c-secret', viewer)).toEqual([]);
    }
    expect(h.event.findMany).not.toHaveBeenCalled();
  });

  it('a member reads both lists', async () => {
    privateCommunity(true);
    h.event.findMany.mockResolvedValue([ROW]);
    expect(await listEvents({ scope: 'community', communityId: 'c-secret', userId: 'me' })).toHaveLength(1);
    expect(await listCommunityPastEvents('c-secret', 'me')).toHaveLength(1);
  });
});

describe('a public community lists upcoming, then past', () => {
  it('upcoming is soonest first and past is newest first, both public, never a draft or canceled', async () => {
    publicCommunity();
    h.event.findMany.mockResolvedValueOnce([ROW]).mockResolvedValueOnce([PAST_ROW]);
    const upcoming = await listEvents({ scope: 'community', communityId: 'c1', userId: null });
    const past = await listCommunityPastEvents('c1', null);
    expect(upcoming.map((e) => e.id)).toEqual(['e1']);
    expect(past.map((e) => e.id)).toEqual(['e0']);

    const [up, pa] = h.event.findMany.mock.calls.map(
      (c) => c[0] as { where: Record<string, unknown>; orderBy: unknown; take: number },
    );
    expect(up!.orderBy).toEqual({ startsAt: 'asc' });
    expect(pa!.orderBy).toEqual({ startsAt: 'desc' });
    expect(pa!.take).toBe(20);
    for (const q of [up!, pa!]) {
      expect(q.where.visibility).toBe('PUBLIC');
      expect(q.where.communityId).toBe('c1');
      expect(q.where.canceledAt).toBeNull();
    }
    // The past list only reaches events that have ended.
    expect(JSON.stringify(pa!.where)).toContain('"endsAt":{"lt"');
  });

  it('caps the past list at 50 whatever the caller asks', async () => {
    publicCommunity();
    h.event.findMany.mockResolvedValue([]);
    await listCommunityPastEvents('c1', null, 5000);
    expect((h.event.findMany.mock.calls[0]![0] as { take: number }).take).toBe(50);
  });
});

describe('GET /api/communities/$slug/events', () => {
  type Handler = (ctx: Record<string, unknown>) => Promise<Response | { events: unknown[] }>;
  const get = async (slug: string, when: 'upcoming' | 'past', userId: string | null) => {
    const mod = await import('@/lib/communities/api/communities.$slug.events.server');
    const GET = handlersOfModule<Handler>(mod).GET!;
    const res = await GET({ params: { slug }, userId, query: { when } });
    return res instanceof Response ? await res.json() : res;
  };

  it('answers an unknown slug and a private community the viewer is not in with the same empty list', async () => {
    privateCommunity(false);
    const unknown = await get('nope', 'upcoming', 'stranger');
    const hidden = await get('secret', 'upcoming', 'stranger');
    const hiddenPast = await get('secret', 'past', null);
    expect(unknown).toEqual({ events: [] });
    expect(hidden).toEqual(unknown);
    expect(hiddenPast).toEqual(unknown);
    expect(h.event.findMany).not.toHaveBeenCalled();
  });

  it('serves the upcoming list or the past list of a public community', async () => {
    publicCommunity();
    h.event.findMany.mockResolvedValueOnce([ROW]);
    expect(((await get('known', 'upcoming', null)) as { events: { id: string }[] }).events.map((e) => e.id)).toEqual([
      'e1',
    ]);
    h.event.findMany.mockResolvedValueOnce([PAST_ROW]);
    expect(((await get('known', 'past', null)) as { events: { id: string }[] }).events.map((e) => e.id)).toEqual([
      'e0',
    ]);
  });
});

describe('hosting and cancelling a community event', () => {
  const input = {
    hostId: 'host',
    communityId: 'c1',
    title: 'Game night',
    startsAt: new Date(Date.now() + 3600_000),
    venueKind: 'IRL' as const,
  };

  it('stays FORBIDDEN for a member who is not a moderator, and writes nothing', async () => {
    h.community.findUnique.mockResolvedValue({ id: 'c1' });
    h.role.value = 'MEMBER';
    await expect(createEvent(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.event.create).not.toHaveBeenCalled();
    expect(h.modLog.create).not.toHaveBeenCalled();
    h.role.value = null;
    await expect(createEvent(input)).rejects.toBeInstanceOf(EventError);
  });

  it('writes an event_hosted mod-log row for a moderator, in the same transaction', async () => {
    h.community.findUnique.mockResolvedValue({ id: 'c1' });
    h.role.value = 'MOD';
    h.event.create.mockResolvedValue({ id: 'e1' });
    h.event.findFirst.mockResolvedValue(ROW);
    await createEvent(input);
    expect(h.event.create).toHaveBeenCalledTimes(1);
    expect(h.modLog.create).toHaveBeenCalledTimes(1);
    const data = (h.modLog.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({
      communityId: 'c1',
      actorId: 'host',
      action: 'event_hosted',
      targetType: 'event',
      targetId: 'e1',
    });
  });

  it('writes no mod-log row for a profile event', async () => {
    h.event.create.mockResolvedValue({ id: 'e2' });
    h.event.findFirst.mockResolvedValue({ ...ROW, id: 'e2', communityId: null, owner: 'USER', community: null });
    await createEvent({ ...input, communityId: null });
    expect(h.modLog.create).not.toHaveBeenCalled();
  });

  it('writes an event_cancelled row when the host cancels a community event, once', async () => {
    h.event.findFirst
      .mockResolvedValueOnce({ id: 'e1', hostId: 'host', canceledAt: null, title: 'Game night', communityId: 'c1' })
      .mockResolvedValue({ ...ROW, canceledAt: new Date() });
    h.event.update.mockResolvedValue({});
    await cancelEvent('e1', 'host');
    expect(h.modLog.create).toHaveBeenCalledTimes(1);
    expect((h.modLog.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data).toMatchObject({
      communityId: 'c1',
      actorId: 'host',
      action: 'event_cancelled',
      targetType: 'event',
      targetId: 'e1',
    });

    h.modLog.create.mockClear();
    h.event.findFirst.mockResolvedValueOnce({
      id: 'e1',
      hostId: 'host',
      canceledAt: new Date(),
      title: 'Game night',
      communityId: 'c1',
    });
    await cancelEvent('e1', 'host');
    expect(h.modLog.create).not.toHaveBeenCalled();
  });

  it("keeps cancelling the host's own: another moderator is FORBIDDEN and nothing is logged", async () => {
    h.event.findFirst.mockResolvedValueOnce({
      id: 'e1',
      hostId: 'host',
      canceledAt: null,
      title: 'Game night',
      communityId: 'c1',
    });
    await expect(cancelEvent('e1', 'other-mod')).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(h.modLog.create).not.toHaveBeenCalled();
  });
});
