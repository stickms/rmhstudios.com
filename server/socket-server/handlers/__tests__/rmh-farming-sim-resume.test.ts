import { describe, expect, it, vi } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { C2S, S2C } from '../../../../lib/rmh-farming-sim/events';
import { handleRmhFarmingSimDisconnect, registerRmhFarmingSimHandlers } from '../rmh-farming-sim';

const db = vi.hoisted(() => {
  const rows = new Map<string, any>();
  return {
    rows,
    prisma: {
      farmingSimFarm: {
        findUnique: async ({ where }: any) =>
          where.ownerId ? (rows.get(where.ownerId) ?? null) : ([...rows.values()].find((r) => r.code === where.code) ?? null),
        upsert: async ({ where, create, update }: any) => {
          rows.set(where.ownerId, { ...(rows.get(where.ownerId) ?? create), ...update });
        },
      },
      farmFestivalEntry: { upsert: async () => undefined },
    },
  };
});
vi.mock('../../prisma-client', () => ({ getPrismaClient: () => db.prisma }));
vi.mock('../../logger', () => ({ logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../rate-limit', () => ({ checkRateLimit: () => true }));

type Handler = (payload?: unknown) => void;

function world() {
  const sockets = new Map<string, FakeSocket>();
  const io = {
    sockets: { sockets },
    to: (ids: string[]) => ({
      emit: (e: string, p: unknown) => ids.forEach((id) => sockets.get(id)?.emit(e, p)),
      volatile: { emit: (e: string, p: unknown) => ids.forEach((id) => sockets.get(id)?.emit(e, p)) },
    }),
  } as unknown as Server;
  class FakeSocket {
    handlers = new Map<string, Handler>();
    emitted: { event: string; payload: any }[] = [];
    disconnected = false;
    data: Record<string, unknown>;
    constructor(
      public id: string,
      userId: string,
    ) {
      this.data = { userId, userName: userId };
      sockets.set(id, this);
      registerRmhFarmingSimHandlers(io, this as unknown as Socket);
    }
    on(e: string, h: Handler) {
      this.handlers.set(e, h);
      return this;
    }
    emit(e: string, p?: unknown) {
      this.emitted.push({ event: e, payload: p });
      return true;
    }
    fire(e: string, p?: unknown) {
      this.handlers.get(e)?.(p);
    }
    last(e: string) {
      return [...this.emitted].reverse().find((x) => x.event === e)?.payload;
    }
    drop() {
      this.disconnected = true;
      sockets.delete(this.id);
      handleRmhFarmingSimDisconnect(io, this as unknown as Socket);
    }
  }
  return { make: (id: string, userId: string) => new FakeSocket(id, userId) };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

describe('farming sim: a visiting guest who drops returns to the farm they were visiting', () => {
  it('rejoins the host farm on reconnect when still a member', async () => {
    const w = world();
    const host = w.make('h', 'host-user');
    host.fire(C2S.HELLO);
    await settle();
    const hostFarmCode = host.last(S2C.WELCOME).ownFarmCode as string;

    const guest = w.make('g1', 'guest-user');
    guest.fire(C2S.HELLO);
    await settle();
    guest.fire(C2S.JOIN_FARM, { code: hostFarmCode });
    await settle();
    host.fire(C2S.APPROVE_JOIN, { userId: 'guest-user' });
    await settle();
    expect(guest.last(S2C.FARM_STATE).id).toBe('host-user');

    guest.drop();
    const back = w.make('g2', 'guest-user');
    back.fire(C2S.HELLO, { resume: hostFarmCode });
    await settle();
    expect(back.last(S2C.WELCOME).resume).toBe('ok');
    expect(back.last(S2C.FARM_STATE).id).toBe('host-user');
    // and actions on the visited farm are accepted for the new socket (it holds presence there)
    expect(host.last(S2C.PRESENCE).some((p: any) => p.userId === 'guest-user')).toBe(true);
  });

  it('lands at home with resume=failed when the guest was removed meanwhile', async () => {
    const w = world();
    const host = w.make('h', 'host-2');
    host.fire(C2S.HELLO);
    await settle();
    const code = host.last(S2C.WELCOME).ownFarmCode as string;
    const guest = w.make('g1', 'guest-2');
    guest.fire(C2S.HELLO);
    await settle();
    guest.fire(C2S.JOIN_FARM, { code });
    await settle();
    host.fire(C2S.APPROVE_JOIN, { userId: 'guest-2' });
    await settle();
    guest.drop();
    host.fire(C2S.KICK, { userId: 'guest-2' });
    await settle();

    const back = w.make('g2', 'guest-2');
    back.fire(C2S.HELLO, { resume: code });
    await settle();
    expect(back.last(S2C.WELCOME).resume).toBe('failed');
    expect(back.last(S2C.FARM_STATE).id).toBe('guest-2');
  });

  it('a plain HELLO still opens the player\'s own farm', async () => {
    const w = world();
    const s = w.make('s', 'solo');
    s.fire(C2S.HELLO);
    await settle();
    expect(s.last(S2C.WELCOME).resume).toBeUndefined();
    expect(s.last(S2C.FARM_STATE).id).toBe('solo');
  });
});
