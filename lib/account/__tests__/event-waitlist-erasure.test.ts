import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WHOLE_EVENT } from '@/lib/calendar/event-model';
import { createFakeDb, type FakeEvent, type FakeRsvp } from '@/lib/events/__tests__/fake-waitlist-db';

/**
 * Account deletion anonymises the user row in place, so an RSVP's `onDelete: Cascade` never fires: a deleted
 * member would keep a seat on a capped event forever. `anonymizeAccount` releases their seats and waitlist
 * places on events that have not started (promoting the waitlist as a guest leaving would), then deletes the
 * rest of their RSVP rows.
 */

const h = vi.hoisted(() => ({
  fake: null as ReturnType<typeof import('@/lib/events/__tests__/fake-waitlist-db').createFakeDb> | null,
  notify: vi.fn(async (_n: { userId: string; entityType?: string; entityId?: string }) => {}),
}));

vi.mock('@/lib/prisma.server', () => {
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (args: unknown) => ({ model: name, method, args }) });
  const db = () => h.fake!.db as unknown as Record<string, unknown> & {
    $transaction: (fn: unknown) => Promise<unknown>;
  };
  return {
    prisma: new Proxy({} as Record<string, unknown>, {
      get: (_t, key: string) => {
        if (key === 'rsvp' || key === 'event') return db()[key];
        // The batched erasure transaction is a list of operations; the seat release uses the callback form.
        if (key === '$transaction') return (arg: unknown) => (Array.isArray(arg) ? arg : db().$transaction(arg));
        return model(key);
      },
    }),
  };
});
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

import { anonymizeAccount } from '@/lib/account/deletion.server';

const FUTURE = new Date(Date.now() + 7 * 86_400_000);
const PAST = new Date(Date.now() - 3_600_000);
const at = (n: number) => new Date(10_000 + n);

const ev = (over: Partial<FakeEvent> & { id: string }): FakeEvent => ({
  hostId: 'host',
  title: `Event ${over.id}`,
  startsAt: FUTURE,
  capacity: 1,
  canceledAt: null,
  recurrence: null,
  ...over,
});

function setup(events: FakeEvent[], rsvps: Partial<FakeRsvp>[]) {
  h.fake = createFakeDb({ events, rsvps });
  return h.fake;
}

beforeEach(() => h.notify.mockClear());

describe('anonymizeAccount (event seats)', () => {
  it('frees the leaver’s seat and promotes the first waitlisted member, who is notified once', async () => {
    const f = setup(
      [ev({ id: 'e1' })],
      [
        { eventId: 'e1', userId: 'leaver' },
        { eventId: 'e1', userId: 'second', status: 'waitlist', waitlistedAt: at(2) },
        { eventId: 'e1', userId: 'first', status: 'waitlist', waitlistedAt: at(1) },
      ],
    );
    await anonymizeAccount('leaver');
    const byUser = Object.fromEntries(f.rows.map((r) => [r.userId, r.status]));
    expect(byUser).toEqual({ first: 'going', second: 'waitlist' });
    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify.mock.calls[0]![0]).toMatchObject({ userId: 'first', entityType: 'event_waitlist', entityId: 'e1' });
    // Running the sweep again changes nothing and notifies nobody.
    await anonymizeAccount('leaver');
    expect(h.notify).toHaveBeenCalledTimes(1);
  });

  it('takes the leaver off a waitlist without promoting anyone, and deletes every other RSVP row', async () => {
    const f = setup(
      [ev({ id: 'e1' }), ev({ id: 'e2', startsAt: PAST }), ev({ id: 'e3', recurrence: 'weekly' })],
      [
        { eventId: 'e1', userId: 'host2' },
        { eventId: 'e1', userId: 'leaver', status: 'waitlist', waitlistedAt: at(1) },
        { eventId: 'e2', userId: 'leaver' },
        { eventId: 'e3', userId: 'leaver' },
        { eventId: 'e3', userId: 'leaver', occurrenceAt: new Date(5_000_000) },
        { eventId: 'e1', userId: 'leaver', status: 'maybe', occurrenceAt: new Date(7_000_000) },
        { eventId: 'e3', userId: 'other' },
      ],
    );
    await anonymizeAccount('leaver');
    expect(f.rows.map((r) => `${r.eventId}:${r.userId}`).sort()).toEqual(['e1:host2', 'e3:other']);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('promotes nobody on an event that has started, but still removes the seat', async () => {
    const f = setup(
      [ev({ id: 'e2', startsAt: PAST })],
      [
        { eventId: 'e2', userId: 'leaver' },
        { eventId: 'e2', userId: 'w', status: 'waitlist', waitlistedAt: at(1) },
      ],
    );
    await anonymizeAccount('leaver');
    expect(f.rows.map((r) => [r.userId, r.status])).toEqual([['w', 'waitlist']]);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('only touches whole-event rows when releasing seats', async () => {
    const f = setup(
      [ev({ id: 'e1', capacity: 2 })],
      [
        { eventId: 'e1', userId: 'leaver' },
        { eventId: 'e1', userId: 'w', status: 'waitlist', waitlistedAt: at(1) },
      ],
    );
    await anonymizeAccount('leaver');
    expect(f.rows.every((r) => r.occurrenceAt.getTime() === WHOLE_EVENT.getTime())).toBe(true);
    expect(f.rows.find((r) => r.userId === 'w')!.status).toBe('going');
  });
});
