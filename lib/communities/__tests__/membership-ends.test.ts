/**
 * Membership ends, so everything keyed off it stops: community watches (previews),
 * the ICS feed, the digest, event reminders, and the RSVP endpoints.
 *
 * Prisma is stood in for; the DB-side filtering is asserted by the `where` shape
 * the code sends (and, for the behaviour that is code rather than SQL, by what is
 * or is not written / notified).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  watch: { findMany: vi.fn(), deleteMany: vi.fn() },
  community: { findUnique: vi.fn(), update: vi.fn() },
  member: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), update: vi.fn() },
  event: { findUnique: vi.fn(), findMany: vi.fn() },
  rsvp: { findMany: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn(), groupBy: vi.fn() },
  occRsvp: { findMany: vi.fn() },
  feed: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
  notify: vi.fn(),
  boss: { send: vi.fn(), cancel: vi.fn() },
  transaction: vi.fn(),
}));

const explicit: Record<string, unknown> = {
  watch: h.watch,
  community: h.community,
  communityMember: h.member,
  communityEvent: h.event,
  eventRsvp: h.rsvp,
  eventOccurrenceRsvp: h.occRsvp,
  calendarFeed: h.feed,
  user: h.user,
  $transaction: h.transaction,
};
/** Any model not listed resolves to empty lists, so unrelated reads are inert. */
vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, name: string) =>
        explicit[name] ??
        new Proxy(
          {},
          {
            get: (_m, fn: string) =>
              vi.fn(async () => (/^find(First|Unique)/.test(fn) ? null : [])),
          },
        ),
    },
  ),
}));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/streak.server', () => ({ getStreak: async () => ({ current: 0 }) }));
vi.mock('@/lib/quests/engine.server', () => ({ getActiveQuests: async () => [] }));
vi.mock('@/lib/calendar/recurring-events.server', () => ({
  OccurrenceError: class extends Error {},
  activeSeriesWhere: () => ({}),
  decorateRecurring: async (m: unknown) => m,
  isGoingToOccurrence: vi.fn(),
  notifyRotation: vi.fn(),
  occurrenceAfter: vi.fn(),
  rsvpRecurring: vi.fn(),
  unrsvpRecurring: vi.fn(),
  upcomingOccurrenceEventIds: async () => [],
  seriesFromRow: () => null,
}));
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (_o: unknown, fn: (c: unknown) => unknown) => fn,
}));
vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => ({ options: config }),
}));
vi.mock('@/lib/communities/invites.server', () => ({ acceptInvite: vi.fn() }));
vi.mock('@/lib/communities/join-requests.server', () => ({ markRemoved: vi.fn(() => 'MARK') }));

import { dropCommunityWatch, notifyWatchers } from '@/lib/discovery/watch.server';
import { runEventReminder, unrsvp, listEvents } from '@/lib/events.server';
import { buildFeedForToken } from '@/lib/calendar/feed.server';
import { assembleDigest } from '@/lib/digest/assemble.server';
import { eventCommunityVisibleWhere } from '@/lib/events-visibility';

type Handler = (ctx: Record<string, unknown>) => Promise<Response>;
async function route(mod: string, method: string): Promise<Handler> {
  const m = (await import(/* @vite-ignore */ mod)) as {
    Route: { options: { server: { handlers: Record<string, Handler> } } };
  };
  return m.Route.options.server.handlers[method];
}

beforeEach(() => {
  for (const g of Object.values(h)) {
    if (typeof g === 'function') (g as ReturnType<typeof vi.fn>).mockReset();
    else for (const fn of Object.values(g)) (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  h.transaction.mockResolvedValue([]);
  h.notify.mockResolvedValue(undefined);
  h.community.update.mockReturnValue('UPDATE');
});

/** `canViewCommunityEvents`' lookup: a private community the viewer is / is not in. */
const privateCommunity = (isMember: boolean) =>
  h.community.findUnique.mockImplementation(async (args: { select: { members?: unknown } }) => ({
    isPrivate: true,
    members: args.select.members ? (isMember ? [{ id: 'm' }] : []) : false,
  }));

describe('community watches', () => {
  it('dropCommunityWatch deletes only that user community watch', () => {
    dropCommunityWatch('c1', 'u1');
    expect(h.watch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', kind: 'community', targetId: 'c1' },
    });
  });

  it('notifyWatchers on a PRIVATE community only reaches current members (stale watch rows are skipped)', async () => {
    h.watch.findMany.mockResolvedValue([
      { userId: 'member', level: 'all' },
      { userId: 'exmember', level: 'all' },
    ]);
    h.community.findUnique.mockResolvedValue({ isPrivate: true });
    h.member.findMany.mockResolvedValue([{ userId: 'member' }]);
    const n = await notifyWatchers({
      kind: 'community',
      targetId: 'c1',
      actorId: null,
      important: () => true,
      preview: 'secret post',
      link: '/x',
    });
    expect(n).toBe(1);
    expect(h.member.findMany.mock.calls[0][0].where).toMatchObject({
      communityId: 'c1',
      userId: { in: ['member', 'exmember'] },
    });
    expect(h.notify.mock.calls.map((c) => c[0].userId)).toEqual(['member']);
  });

  it('notifyWatchers on a PUBLIC community does not require membership', async () => {
    h.watch.findMany.mockResolvedValue([{ userId: 'anyone', level: 'all' }]);
    h.community.findUnique.mockResolvedValue({ isPrivate: false });
    const n = await notifyWatchers({
      kind: 'community',
      targetId: 'c2',
      actorId: null,
      important: () => true,
      preview: 'p',
      link: '/x',
    });
    expect(n).toBe(1);
    expect(h.member.findMany).not.toHaveBeenCalled();
  });
});

describe('leaving / removal ends the watch', () => {
  beforeEach(() => {
    h.community.findUnique.mockResolvedValue({ id: 'c1', createdById: 'owner', isPrivate: true });
    h.member.delete.mockReturnValue('DELETE_MEMBER');
  });

  it('POST /join (leave) puts the watch deletion in the same transaction', async () => {
    h.member.findUnique.mockResolvedValue({ id: 'mem1' });
    const POST = await route('@/app/routes/api/communities/$slug/join', 'POST');
    await POST({ params: { slug: 's' }, session: { user: { id: 'u1' } }, body: {} });
    expect(h.watch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', kind: 'community', targetId: 'c1' },
    });
    expect(h.transaction).toHaveBeenCalledTimes(1);
    expect(h.transaction.mock.calls[0][0]).toHaveLength(3);
  });
});

describe('DELETE /members/:userId and PATCH role', () => {
  const ctx = (extra: Record<string, unknown> = {}) => ({
    params: { slug: 's', userId: 'target' },
    session: { user: { id: 'mod1' } },
    ...extra,
  });
  beforeEach(() => {
    h.community.findUnique.mockResolvedValue({ id: 'c1', createdById: 'owner', isPrivate: true });
    h.member.delete.mockReturnValue('DELETE_MEMBER');
  });
  /** getRole -> actor, then the target lookup. */
  const roles = (actor: string | null, target: { id: string; role: string } | null) =>
    h.member.findUnique
      .mockReset()
      .mockResolvedValueOnce(actor ? { role: actor } : null)
      .mockResolvedValueOnce(target);

  it('removes the member, records the removal (markRemoved) and drops their watch in one transaction', async () => {
    roles('MOD', { id: 'mem9', role: 'MEMBER' });
    const { markRemoved } = await import('@/lib/communities/join-requests.server');
    const DELETE = await route('@/app/routes/api/communities/$slug/members/$userId', 'DELETE');
    const res = await DELETE(ctx());
    expect(res.status).toBe(200);
    expect(markRemoved).toHaveBeenCalledWith(expect.anything(), 'c1', 'target', 'mod1');
    expect(h.watch.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target', kind: 'community', targetId: 'c1' },
    });
    expect(h.transaction.mock.calls[0][0]).toHaveLength(4);
    expect(h.transaction.mock.calls[0][0]).toContain('MARK');
  });

  it('refuses a non-moderator, the owner, an unknown member, and a mod removing a mod', async () => {
    const DELETE = await route('@/app/routes/api/communities/$slug/members/$userId', 'DELETE');
    roles('MEMBER', null);
    expect((await DELETE(ctx())).status).toBe(403);
    roles('ADMIN', null);
    expect((await DELETE(ctx({ params: { slug: 's', userId: 'owner' } }))).status).toBe(400);
    roles('MOD', null);
    expect((await DELETE(ctx())).status).toBe(404);
    roles('MOD', { id: 'mem9', role: 'MOD' });
    expect((await DELETE(ctx())).status).toBe(403);
    expect(h.transaction).not.toHaveBeenCalled();
    expect(h.watch.deleteMany).not.toHaveBeenCalled();
  });

  it('PATCH toggles MEMBER <-> MOD, never the owner or an admin, and validates the role', async () => {
    const PATCH = await route('@/app/routes/api/communities/$slug/members/$userId', 'PATCH');
    const req = (role: unknown) =>
      new Request('http://x', { method: 'PATCH', body: JSON.stringify({ role }) });
    roles('MOD', { id: 'mem9', role: 'MEMBER' });
    const ok = await PATCH(ctx({ request: req('MOD') }));
    expect(ok.status).toBe(200);
    expect(h.member.update).toHaveBeenCalledWith({ where: { id: 'mem9' }, data: { role: 'MOD' } });
    roles('MEMBER', null);
    expect((await PATCH(ctx({ request: req('MOD') }))).status).toBe(403);
    roles('ADMIN', null);
    expect(
      (await PATCH(ctx({ params: { slug: 's', userId: 'owner' }, request: req('MEMBER') }))).status,
    ).toBe(400);
    roles('ADMIN', null);
    expect((await PATCH(ctx({ request: req('ADMIN') }))).status).toBe(400);
    roles('ADMIN', { id: 'mem9', role: 'ADMIN' });
    expect((await PATCH(ctx({ request: req('MEMBER') }))).status).toBe(400);
    roles('MOD', null);
    expect((await PATCH(ctx({ request: req('MEMBER') }))).status).toBe(404);
  });
});

describe('events: an RSVP outlives membership', () => {
  const EVENT = {
    id: 'e1',
    communityId: 'c1',
    title: 'Secret meetup',
    canceledAt: null,
    recurrence: null,
  };

  it('runEventReminder: nothing is sent to an ex-member of a private community', async () => {
    h.event.findUnique.mockResolvedValue(EVENT);
    h.rsvp.findUnique.mockResolvedValue({ status: 'going' });
    privateCommunity(false);
    await runEventReminder({ eventId: 'e1', userId: 'ex', offset: '15m' } as never);
    expect(h.notify).not.toHaveBeenCalled();
    privateCommunity(true);
    await runEventReminder({ eventId: 'e1', userId: 'me', offset: '15m' } as never);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('unrsvp: unknown event -> NOT_FOUND (no counts oracle)', async () => {
    h.event.findUnique.mockResolvedValue(null);
    await expect(unrsvp('nope', 'u1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(h.rsvp.groupBy).not.toHaveBeenCalled();
  });

  it('unrsvp: a non-member gets NOT_FOUND and no counts (leftover RSVP is still retracted)', async () => {
    h.event.findUnique.mockResolvedValue(EVENT);
    privateCommunity(false);
    await expect(unrsvp('e1', 'stranger')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(h.rsvp.groupBy).not.toHaveBeenCalled();
    expect(h.rsvp.deleteMany).toHaveBeenCalledWith({
      where: { eventId: 'e1', userId: 'stranger' },
    });
  });

  it('unrsvp: a member still works', async () => {
    h.event.findUnique.mockResolvedValue(EVENT);
    h.rsvp.groupBy.mockResolvedValue([]);
    h.rsvp.findUnique.mockResolvedValue(null);
    privateCommunity(true);
    await expect(unrsvp('e1', 'me')).resolves.toMatchObject({ goingCount: 0, viewerRsvp: null });
  });

  it('ICS feed: RSVP and occurrence-RSVP reads are scoped to communities the user is still in', async () => {
    h.feed.findUnique.mockResolvedValue({ userId: 'u1', enabled: true });
    h.rsvp.findMany.mockResolvedValue([]);
    h.occRsvp.findMany.mockResolvedValue([]);
    expect(await buildFeedForToken('t'.repeat(32))).toContain('BEGIN:VCALENDAR');
    const visible = eventCommunityVisibleWhere('u1');
    expect(h.rsvp.findMany.mock.calls[0][0].where.event.AND).toContainEqual(visible);
    expect(h.occRsvp.findMany.mock.calls[0][0].where.event).toEqual(visible);
  });

  it('digest: upcoming-event RSVPs are scoped to communities the recipient is still in', async () => {
    h.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'A',
      handle: 'a',
      lastSeenAt: null,
      createdAt: new Date(),
    });
    h.rsvp.findMany.mockResolvedValue([]);
    await assembleDigest('u1');
    const where = h.rsvp.findMany.mock.calls[0][0].where;
    expect(where.event.OR).toEqual(eventCommunityVisibleWhere('u1').OR);
  });

  it('visible-where: members clause only for a signed-in viewer', () => {
    expect(eventCommunityVisibleWhere(null).OR).toHaveLength(2);
    expect(eventCommunityVisibleWhere('u').OR).toHaveLength(3);
  });

  it("scope=mine drops RSVP'd events of a private community the viewer has left", async () => {
    const full = (id: string, communityId: string | null) => ({
      id,
      communityId,
      hostId: 'h',
      title: id,
      description: null,
      startsAt: new Date(Date.now() + 1e6),
      endsAt: null,
      venueKind: 'URL',
      venueRef: null,
      capacity: null,
      canceledAt: null,
      createdAt: new Date(),
      recurrence: null,
      host: { id: 'h', name: 'H', handle: 'h', image: null },
      community: null,
    });
    h.rsvp.findMany.mockImplementation(async (args: { select?: { event?: unknown } }) =>
      args.select?.event ? [{ event: full('kept', null) }, { event: full('left', 'c1') }] : [],
    );
    h.rsvp.groupBy.mockResolvedValue([]);
    h.event.findMany.mockResolvedValue([]);
    privateCommunity(false);
    expect((await listEvents({ scope: 'mine', userId: 'u1' })).map((e) => e.id)).toEqual(['kept']);
    privateCommunity(true);
    expect((await listEvents({ scope: 'mine', userId: 'u1' })).map((e) => e.id)).toEqual([
      'kept',
      'left',
    ]);
  });
});
