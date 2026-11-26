/**
 * The Dream Rift hub records a co-op game when it starts (sprint 15 09): one `DreamRiftCoopRun` insert with the lobby's
 * accounts by slot, taken from the socket session and never from a payload, and the new row's id sent to the room in
 * the start payload as `runId`. A failed or slow insert is logged and the game starts anyway, without a run id. A solo
 * lobby writes nothing. The fake client is wrapped in `shapeChecked`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock('../../../../server/socket-server/prisma-client', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const client = shapeChecked({ dreamRiftCoopRun: { create: (...args: unknown[]) => h.create(...args) } });
  return { getPrismaClient: () => client };
});
vi.mock('../../../../server/socket-server/rate-limit', () => ({ checkRateLimit: () => true }));

import { __resetDreamRiftLobbies, registerDreamRiftHandlers } from '../handlers';
import { C2S, S2C, type StartPayload } from '../../engine/net/events';

type Handler = (payload?: unknown) => unknown;

class FakeSocket {
  handlers = new Map<string, Handler>();
  emitted: Array<{ ev: string; data: unknown }> = [];
  rooms = new Set<string>();
  constructor(
    public id: string,
    public data: { userId?: string; userName?: string },
  ) {}
  on(ev: string, fn: Handler) {
    this.handlers.set(ev, fn);
  }
  emit(ev: string, data?: unknown) {
    this.emitted.push({ ev, data });
  }
  join(room: string) {
    this.rooms.add(room);
  }
  leave(room: string) {
    this.rooms.delete(room);
  }
  to() {
    return { emit: () => {} };
  }
  fire(ev: string, payload?: unknown) {
    return this.handlers.get(ev)?.(payload);
  }
  last(ev: string) {
    return [...this.emitted].reverse().find((e) => e.ev === ev)?.data;
  }
}

const sockets = new Map<string, FakeSocket>();
const io = {
  to: (target: string) => ({
    emit: (ev: string, data?: unknown) => sockets.get(target)?.emit(ev, data),
  }),
  sockets: { sockets: { get: (id: string) => sockets.get(id) } },
};

function connect(id: string, data: FakeSocket['data']): FakeSocket {
  const s = new FakeSocket(id, data);
  sockets.set(id, s);
  registerDreamRiftHandlers(io as never, s as never);
  return s;
}

/** A lobby with the host and one guest seat ready to start. */
function lobbyOfTwo(hostData: FakeSocket['data'], guestData: FakeSocket['data']) {
  const host = connect('sock-host', hostData);
  const guest = connect('sock-guest', guestData);
  host.fire(C2S.CREATE, { isPublic: false, difficulty: 'hard' });
  const code = (host.last(S2C.JOINED) as { code: string }).code;
  guest.fire(C2S.JOIN, { code });
  guest.fire(C2S.READY, { ready: true });
  return { host, guest };
}

beforeEach(() => {
  h.create.mockReset();
  h.create.mockResolvedValue({ id: 'whatever' });
});
afterEach(() => {
  __resetDreamRiftLobbies();
  sockets.clear();
  vi.useRealTimers();
});

describe('the hub starts a co-op run', () => {
  it('creates the run with the roster from the socket sessions and sends runId to the room', async () => {
    const { host, guest } = lobbyOfTwo(
      { userId: 'u-host', userName: 'Host' },
      { userId: 'u-guest', userName: 'Friend' },
    );
    await host.fire(C2S.START);

    expect(h.create).toHaveBeenCalledTimes(1);
    const arg = h.create.mock.calls[0]![0] as { data: Record<string, unknown>; select: unknown };
    expect(arg.data).toMatchObject({
      difficulty: 'hard',
      playerCount: 2,
      hostUserId: 'u-host',
      memberIds: ['u-host', 'u-guest', '', ''],
      players: [],
    });
    expect(arg.data.startedAt).toBeInstanceOf(Date);
    expect(typeof arg.data.id).toBe('string');

    const hostStart = host.last(S2C.START) as StartPayload;
    const guestStart = guest.last(S2C.START) as StartPayload;
    expect(hostStart.runId).toBe(arg.data.id);
    expect(guestStart.runId).toBe(arg.data.id);
    expect(hostStart.yourSlot).toBe(0);
    expect(guestStart.yourSlot).toBe(1);
  });

  it('records a signed-out player as an empty slot and a guest host as no host', async () => {
    const { host } = lobbyOfTwo({ userName: 'Guest Host' }, { userId: 'u-guest', userName: 'Friend' });
    await host.fire(C2S.START);
    const data = (h.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.hostUserId).toBeNull();
    expect(data.memberIds).toEqual(['', 'u-guest', '', '']);
  });

  it('takes accounts from the session, never from a client payload', async () => {
    const { host } = lobbyOfTwo({ userId: 'u-host' }, { userId: 'u-guest' });
    // A client can send anything with its events; none of it reaches the insert.
    host.fire(C2S.SET_SETTINGS, { difficulty: 'easy', memberIds: ['victim'], userId: 'victim' });
    await host.fire(C2S.START, { memberIds: ['victim'], userId: 'victim', runId: 'forged' });
    const data = (h.create.mock.calls[0]![0] as { data: Record<string, unknown> }).data;
    expect(data.memberIds).toEqual(['u-host', 'u-guest', '', '']);
    expect(JSON.stringify(data)).not.toContain('victim');
    expect(data.id).not.toBe('forged');
  });

  it('still starts the game when the insert fails, without a run id', async () => {
    h.create.mockRejectedValue(new Error('database is down'));
    const { host, guest } = lobbyOfTwo({ userId: 'u-host' }, { userId: 'u-guest' });
    await host.fire(C2S.START);
    const hostStart = host.last(S2C.START) as StartPayload;
    expect(hostStart).toBeDefined();
    expect(hostStart.runId).toBeNull();
    expect((guest.last(S2C.START) as StartPayload).runId).toBeNull();
    expect(hostStart.roster).toHaveLength(2);
  });

  it('still starts the game when the insert is too slow', async () => {
    vi.useFakeTimers();
    h.create.mockReturnValue(new Promise(() => {}));
    const { host } = lobbyOfTwo({ userId: 'u-host' }, { userId: 'u-guest' });
    const started = host.fire(C2S.START);
    await vi.advanceTimersByTimeAsync(2_500);
    await started;
    expect((host.last(S2C.START) as StartPayload).runId).toBeNull();
  });

  it('writes no run for a lobby of one', async () => {
    const host = connect('sock-host', { userId: 'u-host' });
    host.fire(C2S.CREATE, { isPublic: false, difficulty: 'normal' });
    await host.fire(C2S.START);
    expect(h.create).not.toHaveBeenCalled();
    expect((host.last(S2C.START) as StartPayload).runId).toBeNull();
  });

  it('only the host can start, and a second start does not record a second run', async () => {
    const { host, guest } = lobbyOfTwo({ userId: 'u-host' }, { userId: 'u-guest' });
    await guest.fire(C2S.START);
    expect(h.create).not.toHaveBeenCalled();
    await host.fire(C2S.START);
    await host.fire(C2S.START);
    expect(h.create).toHaveBeenCalledTimes(1);
  });
});
