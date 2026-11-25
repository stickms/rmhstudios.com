import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-10: the hub ends a running room when the web tier publishes its code on `rmhtube:room:closed` (every socket in it
 * is told `room:closed` with reason `moderator` and leaves), does it once, never loads or restores a moderated room, and
 * refuses `room:create` with a name moderated for that host in the last 30 days. The hub reads through its own Prisma
 * client and never calls the web tier.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  handlers: new Map<string, (data: unknown) => void>(),
  rows: [] as Row[],
  queries: [] as { op: string; args: Row }[],
  created: [] as Row[],
  failReads: false,
}));

vi.mock('../../../lib/redis.server', () => ({
  redisSubscribe: (channel: string, handler: (data: unknown) => void) => {
    h.handlers.set(channel, handler);
    return () => {};
  },
}));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (typeof cond === 'object' && cond !== null && 'gte' in (cond as Row)) {
      return value instanceof Date && value.getTime() >= (cond as { gte: Date }).gte.getTime();
    }
    return value === cond;
  });

vi.mock('../prisma-client', () => ({
  getPrismaClient: () => ({
    rmhTubeRoom: {
      findUnique: async (args: { where: Row }) => {
        h.queries.push({ op: 'findUnique', args });
        return h.rows.find((r) => matches(r, args.where)) ?? null;
      },
      findMany: async (args: { where: Row }) => {
        h.queries.push({ op: 'findMany', args });
        if (h.failReads) throw new Error('db down');
        return h.rows.filter((r) => matches(r, args.where));
      },
      create: async (args: { data: Row }) => {
        h.created.push(args.data);
        return args.data;
      },
    },
    rmhTubeRoomMember: { upsert: async () => ({}) },
  }),
  disconnectPrisma: () => Promise.resolve(),
}));

import { RoomManager } from '../room-manager';
import { S2C } from '../../../lib/rmhtube/events';

const DAY = 86_400_000;

function setup() {
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  const left: string[] = [];
  const io = {
    to: (room: string) => ({ emit: (event: string, payload?: unknown) => emitted.push({ room, event, payload }) }),
    in: (room: string) => ({ socketsLeave: (target: string) => left.push(`${room}->${target}`) }),
  };
  const rm = new RoomManager(io as never);
  const member = (userId: string) => ({ userId, userName: userId, isConnected: true });
  const room = {
    id: 'ROOM01',
    name: 'Late Night',
    hostUserId: 'host',
    members: new Map([
      ['host', member('host')],
      ['guest', member('guest')],
    ]),
  };
  rm.rooms.set('ROOM01', room as never);
  rm.userRoomIndex.set('host', 'ROOM01');
  rm.userRoomIndex.set('guest', 'ROOM01');
  const grace = setTimeout(() => {}, 60_000);
  rm.graceTimers.set('guest', grace);
  return { rm, emitted, left };
}

beforeEach(() => {
  h.handlers.clear();
  h.rows = [];
  h.queries = [];
  h.created = [];
});

describe('the hub subscription', () => {
  it('subscribes once at construction and ends the room for everyone in it', () => {
    const { emitted, left, rm } = setup();
    const handler = h.handlers.get('rmhtube:room:closed');
    expect(handler).toBeTypeOf('function');
    handler!({ roomId: 'ROOM01' });
    expect(emitted).toEqual([{ room: 'ROOM01', event: S2C.ROOM_CLOSED, payload: { reason: 'moderator' } }]);
    expect(S2C.ROOM_CLOSED).toBe('rmhtube:room:closed');
    expect(left).toEqual(['ROOM01->ROOM01']);
    expect(rm.rooms.has('ROOM01')).toBe(false);
    expect(rm.userRoomIndex.size).toBe(0);
    expect(rm.graceTimers.size).toBe(0);
  });

  it('is a no-op for a second message and for a room that is not running', () => {
    const { emitted, left } = setup();
    const handler = h.handlers.get('rmhtube:room:closed')!;
    handler({ roomId: 'ROOM01' });
    handler({ roomId: 'ROOM01' });
    handler({ roomId: 'NOROOM' });
    expect(emitted).toHaveLength(1);
    expect(left).toHaveLength(1);
  });

  it('ignores a malformed payload', () => {
    const { emitted, rm } = setup();
    const handler = h.handlers.get('rmhtube:room:closed')!;
    handler({ roomId: 5 });
    handler({});
    handler(null);
    handler('ROOM01');
    expect(emitted).toEqual([]);
    expect(rm.rooms.has('ROOM01')).toBe(true);
  });

  it('writes nothing: the web tier already stamped the row', () => {
    const { rm } = setup();
    expect(rm.closeRoomByModerator('ROOM01')).toBe(true);
    expect(h.queries).toEqual([]);
    expect(rm.closeRoomByModerator('ROOM01')).toBe(false);
  });
});

describe('a moderated room is not loaded again', () => {
  const stored = (extra: Row) => ({ id: 'ROOM02', closedAt: null, moderatedAt: null, ...extra });

  it('loadRoomFromDb reads with moderatedAt: null and answers null for a moderated room', async () => {
    h.rows = [stored({ moderatedAt: new Date('2026-12-09T00:00:00Z') })];
    const { rm } = setup();
    expect(await rm.loadRoomFromDb('ROOM02')).toBeNull();
    expect(h.queries[0]).toMatchObject({
      op: 'findUnique',
      args: { where: { id: 'ROOM02', closedAt: null, moderatedAt: null } },
    });
  });

  it('restoreRoomsFromDb reads with moderatedAt: null and restores nothing for a moderated room', async () => {
    h.rows = [stored({ moderatedAt: new Date('2026-12-09T00:00:00Z'), members: [{}] })];
    const { rm } = setup();
    await rm.restoreRoomsFromDb();
    expect(h.queries[0]).toMatchObject({ op: 'findMany', args: { where: { closedAt: null, moderatedAt: null } } });
    expect(rm.rooms.has('ROOM02')).toBe(false);
  });
});

describe('room:create with a removed name', () => {
  function socket() {
    const emitted: { event: string; payload: unknown }[] = [];
    return {
      id: 's1',
      data: { userId: 'host', userName: 'Hosty', avatarUrl: null },
      join: vi.fn(),
      emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
      emitted,
    };
  }
  const create = (rm: RoomManager, s: ReturnType<typeof socket>, name: string) =>
    (rm as unknown as { createRoom: (s: unknown, p: { name: string }) => Promise<void> }).createRoom(s, { name });

  it('answers the hub error event and creates nothing, for a name moderated within 30 days', async () => {
    h.rows = [{ id: 'OLD001', hostId: 'host', name: 'late night', moderatedAt: new Date(Date.now() - 29 * DAY) }];
    const { rm } = setup();
    rm.rooms.clear();
    rm.userRoomIndex.clear();
    const s = socket();
    await create(rm, s, '  Late NIGHT ');
    expect(s.emitted).toHaveLength(1);
    expect(s.emitted[0]).toMatchObject({ event: S2C.ERROR, payload: { code: 'ROOM_NAME_REMOVED' } });
    expect(rm.rooms.size).toBe(0);
    expect(h.created).toEqual([]);
    const query = h.queries.find((q) => q.op === 'findMany')!;
    expect(query.args.where).toMatchObject({ hostId: 'host' });
    const since = (query.args.where as { moderatedAt: { gte: Date } }).moderatedAt.gte.getTime();
    expect(Math.abs(Date.now() - 30 * DAY - since)).toBeLessThan(5_000);
  });

  it('fails closed when the removed-name read errors', async () => {
    const { rm } = setup();
    rm.rooms.clear();
    rm.userRoomIndex.clear();
    h.failReads = true;
    const s = socket();
    await create(rm, s, 'Anything');
    h.failReads = false;
    expect(s.emitted[0]).toMatchObject({ event: S2C.ERROR, payload: { code: 'ROOM_CREATE_FAILED' } });
    expect(rm.rooms.size).toBe(0);
  });

  it('lets the name go after 30 days, for another host, and for another name', async () => {
    h.rows = [
      { id: 'OLD001', hostId: 'host', name: 'late night', moderatedAt: new Date(Date.now() - 31 * DAY) },
      { id: 'OLD002', hostId: 'someone-else', name: 'late night', moderatedAt: new Date(Date.now() - 2 * DAY) },
    ];
    for (const name of ['Late Night', 'Early Morning']) {
      const { rm } = setup();
      rm.rooms.clear();
      rm.userRoomIndex.clear();
      const s = socket();
      await create(rm, s, name);
      expect(s.emitted.map((e) => e.event)).not.toContain(S2C.ERROR);
      expect(rm.rooms.size).toBe(1);
    }
  });
});
