import { noticeFallbackText } from '@/lib/notifications/notice-keys';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Scheduled watch parties (s03-09): ownership, the reminder job's once-only claims, link-only privacy, the
 * host limits and what the hub needs to find a scheduled room. Prisma is replaced by a small in-memory fake
 * that implements exactly the calls parties.server.ts makes.
 */

interface Room {
  id: string;
  name: string | null;
  description: string | null;
  hostId: string;
  isPublic: boolean;
  password: string | null;
  maxMembers: number;
  scheduledFor: Date | null;
  createdAt: Date;
  updatedAt: Date;
  closedAt: Date | null;
  queue: Record<string, unknown>[];
}
interface Rsvp {
  roomId: string;
  userId: string;
  createdAt: Date;
  remindedAt: Date | null;
  startedNotifiedAt: Date | null;
}

const db = vi.hoisted(() => ({
  rooms: [] as Room[],
  rsvps: [] as Rsvp[],
  members: [] as {
    roomId: string;
  }[],
  /** The fake's clock: rows are stamped with it, so they line up with the `now` each call is given. */
  now: new Date(),
}));
const notifications = vi.hoisted(() => ({
  sent: [] as Record<string, unknown>[],
}));

type Where = Record<string, unknown>;

function test(value: unknown, cond: unknown): boolean {
  if (cond === null) return value === null || value === undefined;
  if (cond instanceof Date) return value instanceof Date && value.getTime() === cond.getTime();
  if (typeof cond === 'object') {
    const c = cond as Record<string, unknown>;
    const v = value instanceof Date ? value.getTime() : (value as number);
    const n = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
    if ('in' in c) return (c.in as unknown[]).includes(value);
    if ('not' in c && c.not === null && value === null) return false;
    if ('not' in c && c.not === null && Object.keys(c).length === 1) return true;
    if ('gt' in c && !(v > n(c.gt))) return false;
    if ('gte' in c && !(v >= n(c.gte))) return false;
    if ('lt' in c && !(v < n(c.lt))) return false;
    if ('lte' in c && !(v <= n(c.lte))) return false;
    if ('not' in c && c.not === null && value === null) return false;
    return true;
  }
  return value === cond;
}

function matchRoom(row: Room, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === 'OR') return (cond as Where[]).some((w) => matchRoom(row, w));
    if (key === 'rsvps') {
      const some = (
        cond as {
          some: Where;
        }
      ).some;
      return db.rsvps.some((r) => r.roomId === row.id && r.userId === some.userId);
    }
    if (key === 'members') return !db.members.some((m) => m.roomId === row.id);
    return test((row as unknown as Record<string, unknown>)[key], cond);
  });
}

function matchRsvp(row: Rsvp, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => test((row as unknown as Record<string, unknown>)[key], cond));
}

const user = (id: string) => ({
  id,
  name: `User ${id}`,
  image: null,
  username: id,
  handle: id,
  isVerified: false,
  isAdmin: false,
});

function decorate(row: Room) {
  const rsvps = db.rsvps
    .filter((r) => r.roomId === row.id)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return {
    ...row,
    host: user(row.hostId),
    _count: {
      rsvps: rsvps.length,
    },
    rsvps: rsvps.slice(0, 5).map((r) => ({
      ...r,
      user: user(r.userId),
    })),
  };
}

vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    // Interactive transactions run against the same in-memory store (`this` is this object).
    $transaction: async function (this: unknown, fn: (tx: unknown) => unknown) {
      return fn(this);
    },
    $executeRaw: async () => 0,
    user: {
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => user(where.id),
    },
    rmhTubeRoom: {
      count: async ({ where }: { where: Where }) => db.rooms.filter((r) => matchRoom(r, where)).length,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const { queue, ...rest } = data as {
          queue?: {
            create: Record<string, unknown>;
          };
        } & Record<string, unknown>;
        const row = {
          description: null,
          name: null,
          closedAt: null,
          createdAt: db.now,
          updatedAt: db.now,
          ...rest,
          queue: queue ? [queue.create] : [],
        } as unknown as Room;
        if (db.rooms.some((r) => r.id === row.id)) {
          const { Prisma } = await import('@prisma/client');
          throw new Prisma.PrismaClientKnownRequestError('dup', {
            code: 'P2002',
            clientVersion: 'test',
          });
        }
        db.rooms.push(row);
        return decorate(row);
      },
      findUnique: async ({
        where,
      }: {
        where: {
          id: string;
        };
      }) => {
        const row = db.rooms.find((r) => r.id === where.id);
        return row ? decorate(row) : null;
      },
      // s14-10: the party page and the calendar read with `moderatedAt: null`.
      findFirst: async ({ where }: { where: Where }) => {
        const row = db.rooms.find((r) => matchRoom(r, where));
        return row ? decorate(row) : null;
      },
      findMany: async ({ where, orderBy, take }: { where: Where; orderBy?: unknown; take?: number }) => {
        const rows = db.rooms.filter((r) => matchRoom(r, where));
        if (orderBy) rows.sort((a, b) => (a.scheduledFor?.getTime() ?? 0) - (b.scheduledFor?.getTime() ?? 0));
        return rows.slice(0, take ?? rows.length).map(decorate);
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<Room> }) => {
        const rows = db.rooms.filter((r) => matchRoom(r, where));
        for (const r of rows)
          Object.assign(r, data, {
            updatedAt: new Date(),
          });
        return {
          count: rows.length,
        };
      },
    },
    rmhTubeRoomRsvp: {
      findMany: async ({ where }: { where: Where }) => db.rsvps.filter((r) => matchRsvp(r, where)),
      createMany: async ({ data }: { data: Partial<Rsvp>[] }) => {
        for (const d of data) {
          if (db.rsvps.some((r) => r.roomId === d.roomId && r.userId === d.userId)) continue;
          db.rsvps.push({
            createdAt: new Date(),
            remindedAt: null,
            startedNotifiedAt: null,
            ...(d as Record<string, unknown>),
          } as unknown as Rsvp);
        }
        return {
          count: data.length,
        };
      },
      deleteMany: async ({ where }: { where: Where }) => {
        const before = db.rsvps.length;
        db.rsvps = db.rsvps.filter((r) => !matchRsvp(r, where));
        return {
          count: before - db.rsvps.length,
        };
      },
      updateMany: async ({ where, data }: { where: Where; data: Partial<Rsvp> }) => {
        const rows = db.rsvps.filter((r) => matchRsvp(r, where));
        for (const r of rows) Object.assign(r, data);
        return {
          count: rows.length,
        };
      },
    },
  },
}));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: async (input: Record<string, unknown>) => {
    notifications.sent.push(input);
  },
}));

import {
  cancelParty,
  getParty,
  listUpcoming,
  runPartyReminders,
  scheduleParty,
  setGoing,
  updateParty,
} from '@/lib/rmhtube/parties.server';

const NOW = new Date(Date.UTC(2026, 10, 23, 12, 0, 0));
db.now = NOW;
const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
const input = (over: Record<string, unknown> = {}) => ({
  name: 'Movie night',
  startsAt: at(120).toISOString(),
  isPublic: true,
  maxMembers: 20,
  ...over,
});

async function schedule(host = 'host', over: Record<string, unknown> = {}) {
  const r = await scheduleParty(host, input(over) as never, NOW);
  if (!r.ok) throw new Error(`schedule refused: ${r.reason}`);
  return r.value;
}

beforeEach(() => {
  db.rooms = [];
  db.rsvps = [];
  db.members = [];
  notifications.sent = [];
});

describe('scheduling', () => {
  it('creates the room row the hub loads on first join: open, scheduled, no password, first video queued', async () => {
    const party = await schedule('host', {
      firstVideoUrl: 'https://youtu.be/dQw4w9WgXcQ',
    });
    const row = db.rooms.find((r) => r.id === party.roomId)!;
    // RoomManager.loadRoomFromDb reads { id, closedAt: null } and the queue where playedAt is null.
    expect(row.closedAt).toBeNull();
    expect(row.scheduledFor?.toISOString()).toBe(at(120).toISOString());
    expect(row.hostId).toBe('host');
    expect(row.password).toBeNull();
    expect(row.queue).toHaveLength(1);
    expect(row.queue[0]).toMatchObject({
      mediaType: 'youtube',
      position: 0,
      addedById: 'host',
    });
    expect(row.queue[0]).not.toHaveProperty('playedAt');
    expect(party.roomId).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('refuses a time outside the 15-minute to 30-day window', async () => {
    expect(
      await scheduleParty(
        'host',
        input({
          startsAt: at(5).toISOString(),
        }) as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'TOO_SOON',
    });
    expect(
      await scheduleParty(
        'host',
        input({
          startsAt: at(31 * 24 * 60).toISOString(),
        }) as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'TOO_FAR',
    });
  });

  it('refuses a first video the player cannot embed', async () => {
    expect(
      await scheduleParty(
        'host',
        input({
          firstVideoUrl: 'https://example.com/page',
        }) as never,
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'INVALID_VIDEO',
    });
  });

  it('holds a host to 5 upcoming parties', async () => {
    for (let i = 0; i < 5; i++) await schedule('host');
    expect(await scheduleParty('host', input() as never, NOW)).toEqual({
      ok: false,
      reason: 'HOST_LIMIT',
    });
    // Another member is not affected.
    await expect(schedule('other')).resolves.toBeDefined();
  });

  it('holds a host to 5 a day even when earlier ones were cancelled', async () => {
    for (let i = 0; i < 5; i++) {
      const p = await schedule('host');
      await cancelParty(p.roomId, 'host', NOW);
    }
    expect(await scheduleParty('host', input() as never, NOW)).toEqual({
      ok: false,
      reason: 'DAILY_LIMIT',
    });
  });
});

describe('who may change a party', () => {
  it('lets only the host edit', async () => {
    const party = await schedule();
    expect(
      await updateParty(
        party.roomId,
        'stranger',
        {
          name: 'Hijacked',
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(db.rooms[0]!.name).toBe('Movie night');
    const edited = await updateParty(
      party.roomId,
      'host',
      {
        name: 'Renamed',
        description: 'New',
      },
      NOW,
    );
    expect(edited.ok).toBe(true);
    expect(db.rooms[0]!.name).toBe('Renamed');
  });

  it('lets only the host cancel, and cancelling closes the room so the hub cannot load it', async () => {
    const party = await schedule();
    expect(await cancelParty(party.roomId, 'stranger', NOW)).toEqual({
      ok: false,
      reason: 'FORBIDDEN',
    });
    expect(db.rooms[0]!.closedAt).toBeNull();
    expect((await cancelParty(party.roomId, 'host', NOW)).ok).toBe(true);
    expect(db.rooms[0]!.closedAt).toEqual(NOW);
    expect(await cancelParty(party.roomId, 'host', NOW)).toEqual({
      ok: false,
      reason: 'CLOSED',
    });
  });

  it('refuses to edit a closed party and answers 404 for a room that is not a party', async () => {
    const party = await schedule();
    await cancelParty(party.roomId, 'host', NOW);
    expect(
      await updateParty(
        party.roomId,
        'host',
        {
          name: 'x',
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'CLOSED',
    });
    db.rooms.push({
      ...db.rooms[0]!,
      id: 'ZZZZZZ',
      scheduledFor: null,
      closedAt: null,
    });
    expect(
      await updateParty(
        'ZZZZZZ',
        'host',
        {
          name: 'x',
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
    expect(await getParty('ZZZZZZ', 'host')).toBeNull();
  });

  it('tells the people going once when the time changes, and re-arms their reminders', async () => {
    const party = await schedule();
    await setGoing(party.roomId, 'a', true, NOW);
    db.rsvps[0]!.remindedAt = NOW;
    const moved = await updateParty(
      party.roomId,
      'host',
      {
        startsAt: at(300).toISOString(),
      },
      NOW,
    );
    expect(moved.ok).toBe(true);
    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]).toMatchObject({
      userId: 'a',
      entityType: 'rmhtube_party',
      preview: expect.objectContaining({ fallback: 'Time changed: Movie night' }),
    });
    expect(db.rsvps[0]!.remindedAt).toBeNull();
    // A rename alone tells nobody.
    await updateParty(
      party.roomId,
      'host',
      {
        name: 'Renamed',
      },
      NOW,
    );
    expect(notifications.sent).toHaveLength(1);
  });

  it('notifies the people going when the host cancels', async () => {
    const party = await schedule();
    await setGoing(party.roomId, 'a', true, NOW);
    await cancelParty(party.roomId, 'host', NOW);
    expect(notifications.sent).toHaveLength(1);
    expect(notifications.sent[0]).toMatchObject({
      userId: 'a',
      preview: expect.objectContaining({ fallback: 'Cancelled: Movie night' }),
    });
  });
});

describe('listing', () => {
  it('does not list a link-only party to anyone but its host and the people going', async () => {
    const hidden = await schedule('host', {
      isPublic: false,
      name: 'Secret',
    });
    const open = await schedule('host', {
      name: 'Open',
    });
    const names = async (viewer: string | null) => (await listUpcoming(viewer, NOW)).map((p) => p.name);
    expect(await names(null)).toEqual(['Open']);
    expect(await names('stranger')).toEqual(['Open']);
    expect((await names('host')).sort()).toEqual(['Open', 'Secret']);
    await setGoing(hidden.roomId, 'guest', true, NOW);
    expect((await names('guest')).sort()).toEqual(['Open', 'Secret']);
    expect(open.isPublic).toBe(true);
  });

  it('puts the member’s own parties first and only lists the next 7 days publicly', async () => {
    const far = await schedule('someone', {
      name: 'Far',
      startsAt: at(10 * 24 * 60).toISOString(),
    });
    const soon = await schedule('someone', {
      name: 'Soon',
      startsAt: at(60).toISOString(),
    });
    const mine = await schedule('me', {
      name: 'Mine',
      startsAt: at(500).toISOString(),
    });
    const list = await listUpcoming('me', NOW);
    expect(list.map((p) => p.name)).toEqual(['Mine', 'Soon']);
    expect(list.find((p) => p.roomId === far.roomId)).toBeUndefined();
    expect(list[0]!.roomId).toBe(mine.roomId);
    expect(list[1]!.roomId).toBe(soon.roomId);
  });

  it('never lists a cancelled party', async () => {
    const p = await schedule();
    await cancelParty(p.roomId, 'host', NOW);
    expect(await listUpcoming('host', NOW)).toEqual([]);
  });

  it('shows at most the first five going and the count', async () => {
    const party = await schedule();
    for (let i = 0; i < 8; i++) await setGoing(party.roomId, `u${i}`, true, new Date(NOW.getTime() + i));
    const seen = (await getParty(party.roomId, 'u7'))!;
    expect(seen.goingCount).toBe(8);
    expect(seen.firstGoing).toHaveLength(5);
    expect(seen.viewerGoing).toBe(true);
    expect((await getParty(party.roomId, null))!.viewerGoing).toBe(false);
  });
});

describe('going', () => {
  it('toggles, and a late RSVP is not told about reminders that have passed', async () => {
    const party = await schedule('host', {
      startsAt: at(60).toISOString(),
    });
    await setGoing(party.roomId, 'early', true, NOW);
    await setGoing(party.roomId, 'late', true, at(50));
    const early = db.rsvps.find((r) => r.userId === 'early')!;
    const late = db.rsvps.find((r) => r.userId === 'late')!;
    expect(early.remindedAt).toBeNull();
    expect(late.remindedAt).not.toBeNull();
    expect(late.startedNotifiedAt).toBeNull();
    await setGoing(party.roomId, 'early', false, NOW);
    expect(db.rsvps.map((r) => r.userId)).toEqual(['late']);
  });

  it('refuses an RSVP to a closed or long-finished party', async () => {
    const party = await schedule();
    expect(await setGoing(party.roomId, 'a', true, at(120 + 4 * 60))).toEqual({
      ok: false,
      reason: 'CLOSED',
    });
    await cancelParty(party.roomId, 'host', NOW);
    expect(await setGoing(party.roomId, 'a', true, NOW)).toEqual({
      ok: false,
      reason: 'CLOSED',
    });
    expect(await setGoing('NOPE12', 'a', true, NOW)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});

describe('the reminder job', () => {
  it('sends each reminder once, even when it runs twice (and again)', async () => {
    const party = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    await setGoing(party.roomId, 'a', true, NOW);
    await setGoing(party.roomId, 'b', true, NOW);
    const previews = () =>
      notifications.sent.map((n) => `${n.userId}:${noticeFallbackText(n.preview as never)}`).sort();

    // Nothing is due two hours out.
    expect(await runPartyReminders(at(0))).toEqual({
      closed: 0,
      soon: 0,
      started: 0,
    });

    // 10 minutes before: the 15-minute reminder, once to each.
    expect(await runPartyReminders(at(110))).toEqual({
      closed: 0,
      soon: 2,
      started: 0,
    });
    expect(await runPartyReminders(at(110))).toEqual({
      closed: 0,
      soon: 0,
      started: 0,
    });
    expect(await runPartyReminders(at(112))).toEqual({
      closed: 0,
      soon: 0,
      started: 0,
    });
    expect(previews()).toEqual(['a:Starting in 15 minutes: Movie night', 'b:Starting in 15 minutes: Movie night']);

    // At the start: the second reminder, once to each, linking to the room.
    expect(await runPartyReminders(at(121))).toEqual({
      closed: 0,
      soon: 0,
      started: 2,
    });
    expect(await runPartyReminders(at(121))).toEqual({
      closed: 0,
      soon: 0,
      started: 0,
    });
    expect(notifications.sent).toHaveLength(4);
    expect(notifications.sent.at(-1)).toMatchObject({
      type: 'SYSTEM',
      entityType: 'rmhtube_party',
      entityId: party.roomId,
      link: `/rmhtube/${party.roomId}`,
    });
  });

  it('two workers racing for the same reminder send it once', async () => {
    const party = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    await setGoing(party.roomId, 'a', true, NOW);
    await Promise.all([runPartyReminders(at(110)), runPartyReminders(at(110))]);
    expect(notifications.sent.filter((n) => n.userId === 'a')).toHaveLength(1);
  });

  it('does not send the 15-minute reminder for a party that has already started', async () => {
    const party = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    await setGoing(party.roomId, 'a', true, NOW);
    await runPartyReminders(at(125));
    expect(notifications.sent.map((n) => noticeFallbackText(n.preview as never))).toEqual([
      'Starting now: Movie night',
    ]);
  });

  it('sends nothing for a cancelled party', async () => {
    const party = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    await setGoing(party.roomId, 'a', true, NOW);
    await cancelParty(party.roomId, 'host', NOW);
    notifications.sent = [];
    await runPartyReminders(at(110));
    expect(notifications.sent).toEqual([]);
  });

  it('closes a party nobody opened within three hours, and keeps one that was opened', async () => {
    const unopened = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    const opened = await schedule('host', {
      startsAt: at(120).toISOString(),
    });
    db.members.push({
      roomId: opened.roomId,
    });
    const result = await runPartyReminders(at(120 + 181));
    expect(result.closed).toBe(1);
    expect(db.rooms.find((r) => r.id === unopened.roomId)!.closedAt).not.toBeNull();
    expect(db.rooms.find((r) => r.id === opened.roomId)!.closedAt).toBeNull();
  });
});
