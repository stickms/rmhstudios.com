import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WHOLE_EVENT } from '@/lib/calendar/event-model';
import { createFakeDb, type FakeEvent, type FakeRsvp } from './fake-waitlist-db';

// Seat accounting on a one-off event: the last seat is taken once, a waitlist is FIFO, a freed or added
// seat promotes (and notifies) exactly once, nothing is promoted after the start, and only the host reads
// or edits the waitlist.

const h = vi.hoisted(() => ({
  fake: null as ReturnType<typeof import('./fake-waitlist-db').createFakeDb> | null,
  notify: vi.fn(async (_n: { userId: string; entityType?: string; entityId?: string; preview?: string }) => {}),
}));

vi.mock('@/lib/prisma.server', () => ({
  prisma: new Proxy({}, { get: (_t, key: string) => (h.fake!.db as unknown as Record<string, unknown>)[key] }),
}));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: h.notify }));
vi.mock('@/lib/communities/access.server', () => ({ getRole: vi.fn(), canModerate: vi.fn() }));
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

import { EventError, rsvp, unrsvp, updateEvent } from '@/lib/events.server';
import { listWaitlist, removeFromWaitlist } from '@/lib/events/waitlist.server';

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const PAST = new Date(Date.now() - 3_600_000);

function event(over: Partial<FakeEvent> = {}): FakeEvent {
  return { id: 'e1', hostId: 'host', title: 'Game night', startsAt: FUTURE, capacity: 2, canceledAt: null, recurrence: null, ...over };
}

function setup(events: FakeEvent[], rsvps: Partial<FakeRsvp>[] = []) {
  h.fake = createFakeDb({ events, rsvps });
  const [first] = events;
  // The pre-transaction reads in events.server go through findUnique / findFirst on the event model.
  const row = {
    ...first,
    kind: 'event',
    communityId: null,
    visibility: 'PUBLIC',
    pollId: null,
    endsAt: null,
    recurUntil: null,
    recurTz: null,
    rotatingHostIds: [],
    venueKind: 'URL',
    venueRef: 'https://example.com',
    href: null,
    description: '',
    createdAt: new Date(0),
    host: { id: first!.hostId, name: 'Host' },
    community: null,
    owner: 'USER',
  };
  const ev = h.fake.db.event as unknown as Record<string, unknown>;
  const dbFind = ev.findUnique as (a: { where: { id: string } }) => Promise<unknown>;
  ev.findUnique = async (a: { where: { id: string } }) => {
    const live = await dbFind(a);
    return live ? { ...row, ...(live as object) } : null;
  };
  ev.findFirst = async () => ({ ...row, ...h.fake!.events.get(first!.id)! });
  return h.fake;
}

const guestsOf = (f: NonNullable<typeof h.fake>) =>
  f.rows.filter((r) => r.status === 'going').map((r) => r.userId).sort();
const queueOf = (f: NonNullable<typeof h.fake>) =>
  f.rows.filter((r) => r.status === 'waitlist').sort((a, b) => a.waitlistedAt!.getTime() - b.waitlistedAt!.getTime()).map((r) => r.userId);

const at = (n: number) => new Date(10_000 + n);

beforeEach(() => {
  h.notify.mockClear();
});

describe('joining a full event', () => {
  it('answers CAPACITY_FULL to a plain going, and puts a waitlist request on the waitlist with its place', async () => {
    const f = setup([event()], [{ userId: 'a' }, { userId: 'b' }]);
    await expect(rsvp('e1', 'c', 'going')).rejects.toMatchObject({ code: 'CAPACITY_FULL' });
    const result = await rsvp('e1', 'c', 'waitlist');
    expect(result).toMatchObject({ viewerRsvp: 'waitlist', viewerWaitlistPosition: 1, waitlistCount: 1, goingCount: 2 });
    expect(queueOf(f)).toEqual(['c']);
  });

  it('takes a free seat when a waitlist request arrives on an event that is not full', async () => {
    const f = setup([event()], [{ userId: 'a' }]);
    expect(await rsvp('e1', 'c', 'waitlist')).toMatchObject({ viewerRsvp: 'going', waitlistCount: 0 });
    expect(guestsOf(f)).toEqual(['a', 'c']);
  });

  it('keeps the first place when a waitlisted member asks again', async () => {
    const f = setup(
      [event()],
      [{ userId: 'a' }, { userId: 'b' }, { userId: 'c', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'd', status: 'waitlist', waitlistedAt: at(2) }],
    );
    await rsvp('e1', 'c', 'waitlist');
    expect(queueOf(f)).toEqual(['c', 'd']);
    expect(f.rows.find((r) => r.userId === 'c')!.waitlistedAt).toEqual(at(1));
  });

  it('closes the waitlist once the event has started, and caps it at 200', async () => {
    setup([event({ startsAt: PAST })], [{ userId: 'a' }, { userId: 'b' }]);
    await expect(rsvp('e1', 'c', 'waitlist')).rejects.toMatchObject({ code: 'WAITLIST_CLOSED' });

    const queue = Array.from({ length: 200 }, (_, i) => ({ userId: `w${i}`, status: 'waitlist', waitlistedAt: at(i) }));
    setup([event()], [{ userId: 'a' }, { userId: 'b' }, ...queue]);
    await expect(rsvp('e1', 'late', 'waitlist')).rejects.toMatchObject({ code: 'WAITLIST_FULL' });
  });
});

describe('the last seat', () => {
  it('is taken once when two members race for it', async () => {
    const f = setup([event({ capacity: 1 })]);
    const results = await Promise.allSettled([rsvp('e1', 'x', 'going'), rsvp('e1', 'y', 'going')]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(EventError);
    expect(rejected.reason.code).toBe('CAPACITY_FULL');
    expect(guestsOf(f)).toHaveLength(1);
  });

  it('is taken once among many racers, and the rest can join the waitlist in arrival order', async () => {
    const f = setup([event({ capacity: 1 })]);
    const users = ['p', 'q', 'r', 's'];
    await Promise.allSettled(users.map((u) => rsvp('e1', u, 'going')));
    expect(guestsOf(f)).toHaveLength(1);
    await Promise.all(users.map((u) => rsvp('e1', u, 'waitlist').catch(() => null)));
    expect(guestsOf(f)).toHaveLength(1);
    expect(queueOf(f)).toHaveLength(3);
  });

  it('takes the event lock before it counts', async () => {
    const f = setup([event({ capacity: 1 })]);
    await rsvp('e1', 'x', 'going');
    const lock = f.log.indexOf('lock:event-rsvp:e1');
    expect(lock).toBeGreaterThanOrEqual(0);
    expect(lock).toBeLessThan(f.log.indexOf('count'));
    expect(lock).toBeLessThan(f.log.indexOf('write'));
  });
});

describe('promotion', () => {
  it('un-RSVP promotes the earliest waitlisted member, once, and notifies them', async () => {
    const f = setup(
      [event()],
      [
        { userId: 'a' },
        { userId: 'b' },
        { userId: 'late', status: 'waitlist', waitlistedAt: at(5) },
        { userId: 'early', status: 'waitlist', waitlistedAt: at(1) },
      ],
    );
    await unrsvp('e1', 'a');
    expect(guestsOf(f)).toEqual(['b', 'early']);
    expect(queueOf(f)).toEqual(['late']);
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({
      userId: 'early',
      type: 'SYSTEM',
      entityType: 'event_waitlist',
      entityId: 'e1',
      preview: 'A place opened up: you are going to Game night',
    });
    // A repeat of the same un-RSVP frees nothing and notifies nobody.
    await unrsvp('e1', 'a');
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('switching from going to maybe frees the seat; leaving the waitlist frees none', async () => {
    const f = setup(
      [event()],
      [{ userId: 'a' }, { userId: 'b' }, { userId: 'w', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'z', status: 'waitlist', waitlistedAt: at(2) }],
    );
    await unrsvp('e1', 'z');
    expect(guestsOf(f)).toEqual(['a', 'b']);
    expect(h.notify).not.toHaveBeenCalled();
    await rsvp('e1', 'a', 'maybe');
    expect(guestsOf(f)).toEqual(['b', 'w']);
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('two guests leaving at once promote two different members, each notified once', async () => {
    const f = setup(
      [event()],
      [{ userId: 'a' }, { userId: 'b' }, { userId: 'w1', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'w2', status: 'waitlist', waitlistedAt: at(2) }, { userId: 'w3', status: 'waitlist', waitlistedAt: at(3) }],
    );
    await Promise.all([unrsvp('e1', 'a'), unrsvp('e1', 'b')]);
    expect(guestsOf(f)).toEqual(['w1', 'w2']);
    expect(queueOf(f)).toEqual(['w3']);
    expect(h.notify.mock.calls.map((c) => c[0].userId).sort()).toEqual(['w1', 'w2']);
  });

  it('raising the capacity by 2 promotes two; lowering it removes nobody', async () => {
    const f = setup(
      [event()],
      [{ userId: 'a' }, { userId: 'b' }, { userId: 'w1', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'w2', status: 'waitlist', waitlistedAt: at(2) }, { userId: 'w3', status: 'waitlist', waitlistedAt: at(3) }],
    );
    await updateEvent({ id: 'e1', hostId: 'host', capacity: 4 });
    expect(guestsOf(f)).toEqual(['a', 'b', 'w1', 'w2']);
    expect(queueOf(f)).toEqual(['w3']);
    expect(h.notify).toHaveBeenCalledTimes(2);
    await updateEvent({ id: 'e1', hostId: 'host', capacity: 1 });
    expect(guestsOf(f)).toEqual(['a', 'b', 'w1', 'w2']);
    expect(h.notify).toHaveBeenCalledTimes(2);
  });

  it('removing the capacity promotes everyone waiting', async () => {
    const f = setup([event()], [{ userId: 'a' }, { userId: 'b' }, { userId: 'w1', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'w2', status: 'waitlist', waitlistedAt: at(2) }]);
    await updateEvent({ id: 'e1', hostId: 'host', capacity: null });
    expect(queueOf(f)).toEqual([]);
    expect(guestsOf(f)).toHaveLength(4);
  });

  it('promotes nobody after the start', async () => {
    const f = setup([event({ startsAt: PAST })], [{ userId: 'a' }, { userId: 'b' }, { userId: 'w', status: 'waitlist', waitlistedAt: at(1) }]);
    await unrsvp('e1', 'a');
    expect(guestsOf(f)).toEqual(['b']);
    expect(queueOf(f)).toEqual(['w']);
    expect(h.notify).not.toHaveBeenCalled();
    await updateEvent({ id: 'e1', hostId: 'host', capacity: 5 });
    expect(queueOf(f)).toEqual(['w']);
  });

  it('promotes nobody into a canceled event', async () => {
    const f = setup([event({ canceledAt: new Date() })], [{ userId: 'a' }, { userId: 'w', status: 'waitlist', waitlistedAt: at(1) }]);
    await unrsvp('e1', 'a');
    expect(queueOf(f)).toEqual(['w']);
  });
});

describe('the host’s waitlist', () => {
  const seed = () =>
    setup([event()], [{ userId: 'a' }, { userId: 'b' }, { userId: 'w1', status: 'waitlist', waitlistedAt: at(1) }, { userId: 'w2', status: 'waitlist', waitlistedAt: at(2) }]);

  it('lists the queue in order for the host and for a site admin', async () => {
    seed();
    const view = await listWaitlist('e1', 'host', false);
    expect(view.waitlist.map((w) => [w.userId, w.position])).toEqual([['w1', 1], ['w2', 2]]);
    expect(view.closed).toBe(false);
    expect((await listWaitlist('e1', 'someone-else', true)).waitlist).toHaveLength(2);
  });

  it('refuses a non-host, for reading and for editing', async () => {
    const f = seed();
    await expect(listWaitlist('e1', 'stranger', false)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(removeFromWaitlist('e1', 'stranger', false, 'w1')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // A guest or a waitlisted member is not the host either.
    await expect(listWaitlist('e1', 'w1', false)).rejects.toBeInstanceOf(EventError);
    expect(queueOf(f)).toEqual(['w1', 'w2']);
  });

  it('lets the host remove someone from the waitlist, but never a guest through it', async () => {
    const f = seed();
    const view = await removeFromWaitlist('e1', 'host', false, 'w1');
    expect(view.waitlist.map((w) => w.userId)).toEqual(['w2']);
    await removeFromWaitlist('e1', 'host', false, 'a');
    expect(guestsOf(f)).toEqual(['a', 'b']);
  });

  it('shows a started event’s waitlist as frozen', async () => {
    setup([event({ startsAt: PAST })], [{ userId: 'w', status: 'waitlist', waitlistedAt: at(1) }]);
    expect((await listWaitlist('e1', 'host', false)).closed).toBe(true);
  });
});

describe('summaries', () => {
  it('reports the waitlist count and the viewer’s place after a change', async () => {
    setup([event()], [{ userId: 'a' }, { userId: 'b' }, { userId: 'w1', status: 'waitlist', waitlistedAt: at(1) }]);
    expect(await rsvp('e1', 'me', 'waitlist')).toMatchObject({ waitlistCount: 2, viewerWaitlistPosition: 2 });
    expect(await rsvp('e1', 'me', 'maybe')).toMatchObject({ waitlistCount: 1, viewerWaitlistPosition: null, viewerRsvp: 'maybe' });
  });
});

describe('WHOLE_EVENT rows only', () => {
  it('ignores answers about a single date of a series', async () => {
    const f = setup([event()], [{ userId: 'a' }, { userId: 'b' }, { userId: 'a', occurrenceAt: new Date(5_000_000), status: 'going' }]);
    expect(f.rows.filter((r) => r.occurrenceAt.getTime() === WHOLE_EVENT.getTime())).toHaveLength(2);
    await expect(rsvp('e1', 'c', 'going')).rejects.toMatchObject({ code: 'CAPACITY_FULL' });
  });
});
