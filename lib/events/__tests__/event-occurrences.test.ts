import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WHOLE_EVENT } from '@/lib/calendar/event-model';

// Skipping and moving one date of a repeating event: who may, what is refused, that answers stay keyed by
// the original start, who is told (once), and that the reminder queue follows the move.

type Row = Record<string, unknown>;

const h = vi.hoisted(() => {
  const state = {
    events: [] as Row[],
    rsvps: [] as Row[],
    overrides: [] as Row[],
    cohosts: new Set<string>(),
    jobs: [] as {
      id: string;
      key: string;
      state: string;
      data: Record<string, unknown>;
    }[],
    dropped: 0,
  };
  const matches = (row: Row, where: Row): boolean =>
    Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((w) => matches(row, w));
      const v = row[key];
      const t = (x: unknown) => (x instanceof Date ? x.getTime() : x);
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as Record<string, unknown>;
        if ('in' in c) return (c.in as unknown[]).map(t).includes(t(v));
        if ('not' in c) return t(v) !== t(c.not);
        if ('gte' in c && !((t(v) as number) >= (t(c.gte) as number))) return false;
        if ('lte' in c && !((t(v) as number) <= (t(c.lte) as number))) return false;
        return true;
      }
      return t(v) === t(cond);
    });
  let seq = 0;
  const overrideKey = (w: { eventId: string; occurrenceAt: Date }) => w;
  const db = {
    event: {
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => state.events.find((e) => e.id === where.id) ?? null,
    },
    rsvp: {
      findMany: async ({ where }: { where: Row }) => state.rsvps.filter((r) => matches(r, where)),
      findFirst: async ({ where }: { where: Row }) => state.rsvps.find((r) => matches(r, where)) ?? null,
      deleteMany: async ({ where }: { where: Row }) => {
        const before = state.rsvps.length;
        state.rsvps = state.rsvps.filter((r) => !matches(r, where));
        return {
          count: before - state.rsvps.length,
        };
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          eventId_userId_occurrenceAt: Row;
        };
        create: Row;
        update: Row;
      }) => {
        const k = where.eventId_userId_occurrenceAt;
        const hit = state.rsvps.find((r) => matches(r, k));
        if (hit) Object.assign(hit, update);
        else
          state.rsvps.push({
            ...create,
          });
      },
    },
    eventOccurrenceOverride: {
      findMany: async ({ where }: { where: Row }) => state.overrides.filter((r) => matches(r, where)),
      findUnique: async ({
        where,
      }: {
        where: {
          eventId_occurrenceAt: {
            eventId: string;
            occurrenceAt: Date;
          };
        };
      }) => state.overrides.find((r) => matches(r, overrideKey(where.eventId_occurrenceAt))) ?? null,
      count: async ({ where }: { where: Row }) => state.overrides.filter((r) => matches(r, where)).length,
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: {
          eventId_occurrenceAt: {
            eventId: string;
            occurrenceAt: Date;
          };
        };
        create: Row;
        update: Row;
      }) => {
        const hit = state.overrides.find((r) => matches(r, overrideKey(where.eventId_occurrenceAt)));
        if (hit)
          Object.assign(hit, update, {
            updatedAt: new Date(),
          });
        else
          state.overrides.push({
            ...create,
            updatedAt: new Date(),
          });
      },
      deleteMany: async ({ where }: { where: Row }) => {
        state.overrides = state.overrides.filter((r) => !matches(r, where));
        return {
          count: 1,
        };
      },
    },
    $executeRaw: async () => 0,
    $transaction: async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(db) : Promise.all(arg as unknown[]),
  };
  const boss = {
    createQueue: async () => {},
    send: async (
      _q: string,
      data: Record<string, unknown>,
      opts: {
        singletonKey: string;
      },
    ) => {
      // `stately`: one pending job per key; a second send under the same key is silently dropped.
      if (state.jobs.some((j) => j.key === opts.singletonKey && j.state === 'created')) {
        state.dropped++;
        return null;
      }
      const id = `job${++seq}`;
      state.jobs.push({
        id,
        key: opts.singletonKey,
        state: 'created',
        data,
      });
      return id;
    },
    findJobs: async (
      _q: string,
      {
        key,
      }: {
        key: string;
      },
    ) => state.jobs.filter((j) => j.key === key),
    cancel: async (_q: string, ids: string[]) => {
      for (const j of state.jobs) if (ids.includes(j.id)) j.state = 'cancelled';
    },
  };
  return {
    state,
    db,
    boss,
    notify: vi.fn(async (_n: Record<string, unknown>) => {}),
  };
});

vi.mock('@/lib/prisma.server', () => ({
  prisma: h.db,
}));
vi.mock('@/lib/jobs/boss.server', () => ({
  getBoss: async () => h.boss,
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: h.notify,
}));
vi.mock('@/lib/communities/access.server', () => ({
  getRole: vi.fn(),
  canModerate: vi.fn(),
}));
vi.mock('@/lib/events/cohosts.server', () => ({
  canManageEvent: async (
    e: {
      hostId: string | null;
    },
    actor: string,
  ) => (e.hostId === actor || h.state.cohosts.has(actor) ? 'host' : null),
}));
vi.mock('@/lib/calendar/people.server', () => ({
  loadPeople: async () => new Map(),
}));
vi.mock('@/lib/user-display', () => ({
  userDisplaySelect: {},
  resolveUser: (u: unknown) => u,
}));

import { EventError, runEventReminder } from '@/lib/events.server';
import { OccurrenceError, rsvpRecurring, seriesFromRow, type SeriesRow } from '@/lib/calendar/recurring-events.server';
import { OccurrenceChangeError, restoreOccurrence, setOverride } from '@/lib/events/occurrences.server';
import { scheduleEventReminders } from '@/lib/events/reminders.server';

const DAY = 86_400_000;
const NOW = new Date();
const minute = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000);
const T0 = minute(NOW.getTime() + 3 * DAY);
const T1 = new Date(T0.getTime() + 7 * DAY);
const T2 = new Date(T0.getTime() + 14 * DAY);

const eventRow = (over: Row = {}): Row => ({
  id: 'e1',
  hostId: 'host',
  title: 'Game night',
  kind: 'event',
  startsAt: T0,
  endsAt: new Date(T0.getTime() + 2 * 3_600_000),
  recurrence: 'W',
  recurUntil: null,
  recurTz: 'UTC',
  rotatingHostIds: [],
  capacity: null,
  canceledAt: null,
  ...over,
});
const answer = (userId: string, status: string, occurrenceAt: Date, over: Row = {}): Row => ({
  eventId: 'e1',
  userId,
  status,
  occurrenceAt,
  everyTime: false,
  ...over,
});
const skip = (at: Date) => ({
  occurrenceAt: at,
  kind: 'skip' as const,
});

beforeEach(() => {
  h.state.events = [eventRow()];
  h.state.rsvps = [];
  h.state.overrides = [];
  h.state.cohosts = new Set();
  h.state.jobs = [];
  h.state.dropped = 0;
  h.notify.mockClear();
});

describe('who may change a date', () => {
  it('refuses a member who is neither host, co-host nor admin with 403', async () => {
    await expect(setOverride('e1', 'stranger', false, skip(T0))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    expect(h.state.overrides).toHaveLength(0);
  });

  it('lets an accepted co-host and a site admin do it', async () => {
    h.state.cohosts.add('cohost');
    await setOverride('e1', 'cohost', false, skip(T0));
    await setOverride('e1', 'stranger', true, skip(T1));
    expect(h.state.overrides.map((o) => o.createdById)).toEqual(['cohost', 'stranger']);
  });

  it('answers 404 for a one-off event and for one that does not exist', async () => {
    h.state.events = [
      eventRow({
        recurrence: null,
      }),
    ];
    await expect(setOverride('e1', 'host', false, skip(T0))).rejects.toBeInstanceOf(EventError);
    await expect(setOverride('nope', 'host', false, skip(T0))).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('what is refused', () => {
  it('a time that is not an occurrence of the series', async () => {
    const odd = new Date(T0.getTime() + 3_600_000);
    await expect(setOverride('e1', 'host', false, skip(odd))).rejects.toMatchObject({
      code: 'NOT_OCCURRENCE',
    });
  });

  it('a past occurrence', async () => {
    const past = minute(NOW.getTime() - 14 * DAY);
    h.state.events = [
      eventRow({
        startsAt: past,
        endsAt: null,
      }),
    ];
    await expect(setOverride('e1', 'host', false, skip(past))).rejects.toMatchObject({
      code: 'PAST',
    });
  });

  it('a move onto, or past, the next occurrence', async () => {
    for (const startsAt of [T1, new Date(T1.getTime() + DAY)]) {
      await expect(
        setOverride('e1', 'host', false, {
          occurrenceAt: T0,
          kind: 'move',
          startsAt,
        }),
      ).rejects.toBeInstanceOf(OccurrenceChangeError);
    }
    await expect(
      setOverride('e1', 'host', false, {
        occurrenceAt: T0,
        kind: 'move',
        startsAt: T1,
      }),
    ).rejects.toMatchObject({
      code: 'COLLIDES',
    });
  });

  it('a move before now', async () => {
    await expect(
      setOverride('e1', 'host', false, {
        occurrenceAt: T0,
        kind: 'move',
        startsAt: new Date(NOW.getTime() - 1000),
      }),
    ).rejects.toMatchObject({
      code: 'MOVE_PAST',
    });
  });

  it('a fifty-third changed date', async () => {
    h.state.events = [
      eventRow({
        startsAt: T0,
      }),
    ];
    for (let i = 1; i <= 52; i++) {
      h.state.overrides.push({
        eventId: 'e1',
        occurrenceAt: new Date(T0.getTime() + (i + 100) * 7 * DAY),
        kind: 'skip',
      });
    }
    await expect(setOverride('e1', 'host', false, skip(T0))).rejects.toMatchObject({
      code: 'TOO_MANY',
    });
  });
});

describe('answering a skipped date', () => {
  const row = (): SeriesRow & {
    canceledAt: Date | null;
  } =>
    h.state.events[0] as unknown as SeriesRow & {
      canceledAt: Date | null;
    };

  it('is refused, and an answer with no date goes to the next live one', async () => {
    await setOverride('e1', 'host', false, skip(T0));
    await expect(
      rsvpRecurring(row(), 'u1', 'going', {
        everyTime: false,
        occurrenceAt: T0,
      }),
    ).rejects.toMatchObject({
      code: 'SKIPPED',
    } satisfies Partial<OccurrenceError>);
    const done = await rsvpRecurring(row(), 'u1', 'going', {
      everyTime: false,
    });
    expect(done.at.getTime()).toBe(T1.getTime());
  });

  it('works on a moved date, keyed by the original start', async () => {
    const moved = new Date(T0.getTime() + 2 * DAY);
    await setOverride('e1', 'host', false, {
      occurrenceAt: T0,
      kind: 'move',
      startsAt: moved,
    });
    const done = await rsvpRecurring(row(), 'u1', 'going', {
      everyTime: false,
      occurrenceAt: T0,
    });
    expect(done.at.getTime()).toBe(T0.getTime());
    expect(done.effectiveAt.getTime()).toBe(moved.getTime());
    expect(h.state.rsvps).toHaveLength(1);
    expect((h.state.rsvps[0]!.occurrenceAt as Date).getTime()).toBe(T0.getTime());
  });
});

describe('answers survive a move', () => {
  it('no RSVP row is rewritten, so standing and one-off answers still apply', async () => {
    h.state.rsvps = [
      answer('u1', 'going', WHOLE_EVENT, {
        everyTime: true,
      }),
      answer('u2', 'maybe', T0),
      answer('u3', 'waitlist', WHOLE_EVENT),
    ];
    const before = JSON.stringify(h.state.rsvps);
    await setOverride('e1', 'host', false, {
      occurrenceAt: T0,
      kind: 'move',
      startsAt: new Date(T0.getTime() + DAY),
    });
    expect(JSON.stringify(h.state.rsvps)).toBe(before);
    await restoreOccurrence('e1', 'host', false, T0);
    expect(JSON.stringify(h.state.rsvps)).toBe(before);
    expect(h.state.overrides).toHaveLength(0);
  });
});

describe('notifications', () => {
  it('go once to each person with an answer: standing, one-off and waitlisted, never the actor', async () => {
    h.state.rsvps = [
      answer('u1', 'going', WHOLE_EVENT, {
        everyTime: true,
      }),
      answer('u1', 'going', T0), // also answered the date itself: still one notice
      answer('u2', 'maybe', T0),
      answer('u3', 'waitlist', WHOLE_EVENT),
      answer('u4', 'going', WHOLE_EVENT, {
        everyTime: true,
      }),
      answer('u4', 'no', T0), // sat this date out
      answer('u5', 'going', T1), // another date
      answer('host', 'going', T0),
    ];
    await setOverride('e1', 'host', false, skip(T0));
    const told = h.notify.mock.calls.map((c) => c[0]);
    expect(told.map((n) => n.userId).sort()).toEqual(['u1', 'u2', 'u3']);
    expect(told.every((n) => n.entityType === 'event_occurrence' && n.entityId === 'e1')).toBe(true);
    expect(told[0]!.preview).toMatch(/^Game night on \d{1,2} \w{3} is skipped$/);
  });

  it('says where a moved date went, in the event time zone', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    await setOverride('e1', 'host', false, {
      occurrenceAt: T0,
      kind: 'move',
      startsAt: new Date(T0.getTime() + DAY),
    });
    expect(String(h.notify.mock.calls[0]![0].preview)).toMatch(/ moves to \w{3},? \d{1,2} \w{3},? \d{2}:\d{2}$/);
  });
});

describe('reminders', () => {
  const job = (over: Record<string, unknown> = {}) => ({
    eventId: 'e1',
    userId: 'u1',
    offset: '15m' as const,
    occurrenceAt: T0.toISOString(),
    startsAt: T0.toISOString(),
    ...over,
  });
  const remindedUsers = () => h.notify.mock.calls.map((c) => c[0].userId);

  it('the worker sends nothing for a skipped date', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    await setOverride('e1', 'host', false, skip(T0));
    h.notify.mockClear();
    await runEventReminder(job());
    expect(remindedUsers()).toEqual([]);
  });

  it('the worker drops a job scheduled for the old time and fires the one for the moved time', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    const moved = new Date(T0.getTime() + DAY);
    await setOverride('e1', 'host', false, {
      occurrenceAt: T0,
      kind: 'move',
      startsAt: moved,
    });
    h.notify.mockClear();
    await runEventReminder(job()); // startsAt = the original: stale
    expect(remindedUsers()).toEqual([]);
    await runEventReminder(
      job({
        startsAt: moved.toISOString(),
      }),
    );
    expect(remindedUsers()).toEqual(['u1']);
  });

  it('a job queued before moves existed (no startsAt) is judged by its occurrenceAt', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    await runEventReminder(
      job({
        startsAt: undefined,
      }),
    );
    expect(remindedUsers()).toEqual(['u1']);
  });

  it('a move cancels the old occurrence jobs and its new job is not dropped by the old singletonKey', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    await scheduleEventReminders(
      {
        id: 'e1',
        startsAt: T0,
      },
      'u1',
      true,
    );
    const old = h.state.jobs.map((j) => j.key);
    expect(old).toHaveLength(2);
    const moved = new Date(T0.getTime() + 2 * DAY);
    await setOverride('e1', 'host', false, {
      occurrenceAt: T0,
      kind: 'move',
      startsAt: moved,
    });
    expect(h.state.jobs.filter((j) => j.key && old.includes(j.key)).every((j) => j.state === 'cancelled')).toBe(true);
    const fresh = h.state.jobs.filter((j) => j.state === 'created');
    expect(fresh).toHaveLength(2);
    expect(fresh.every((j) => !old.includes(j.key))).toBe(true);
    expect(
      fresh.every((j) => j.data.startsAt === moved.toISOString() && j.data.occurrenceAt === T0.toISOString()),
    ).toBe(true);
    expect(h.state.dropped).toBe(0);
  });

  it('a skip cancels the jobs and schedules none', async () => {
    h.state.rsvps = [answer('u1', 'going', T0)];
    await scheduleEventReminders(
      {
        id: 'e1',
        startsAt: T0,
      },
      'u1',
      true,
    );
    await setOverride('e1', 'host', false, skip(T0));
    expect(h.state.jobs.every((j) => j.state === 'cancelled')).toBe(true);
  });

  it('the every-time chain passes over a skipped next date and schedules the one after, at its moved time', async () => {
    h.state.rsvps = [
      answer('u1', 'going', WHOLE_EVENT, {
        everyTime: true,
      }),
    ];
    await setOverride('e1', 'host', false, skip(T1));
    const movedT2 = new Date(T2.getTime() + DAY);
    await setOverride('e1', 'host', false, {
      occurrenceAt: T2,
      kind: 'move',
      startsAt: movedT2,
    });
    h.state.jobs = [];
    await runEventReminder(job());
    const next = h.state.jobs.filter((j) => j.state === 'created');
    expect(next.length).toBeGreaterThan(0);
    for (const j of next) {
      expect(j.data.occurrenceAt).toBe(T2.toISOString());
      expect(j.data.startsAt).toBe(movedT2.toISOString());
    }
  });

  it('skipping a date an every-time answer was already queued for hands the chain to the next live date', async () => {
    h.state.rsvps = [answer('u1', 'going', WHOLE_EVENT, { everyTime: true })];
    await scheduleEventReminders({ id: 'e1', startsAt: T0 }, 'u1', true);
    await setOverride('e1', 'host', false, skip(T0));
    const created = h.state.jobs.filter((j) => j.state === 'created');
    expect(created.length).toBeGreaterThan(0);
    for (const j of created) expect(j.data.occurrenceAt).toBe(T1.toISOString());
  });

  it('the series helper still reads the row as a series', () => {
    expect(seriesFromRow(h.state.events[0] as unknown as SeriesRow)?.rule).toBe('W');
  });
});
