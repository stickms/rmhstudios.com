/**
 * The Bum's Rush relay's security boundary.
 *
 * This game's server is a room manager and a relay — it never simulates
 * (design doc §9.1). That decision buys the hub its CPU back and costs it the
 * only defence a simulating server gets for free: if the relay will forward
 * anything to anyone, a guest can drive everybody else's world. In a game built
 * entirely out of grabbing each other, that is total control of the room —
 * pull three players into a pit from a machine that is not simulating anything.
 *
 * So the two rules below are the whole boundary, and they are tested here
 * rather than left to a manual pass:
 *
 *   1. `br:snapshot` is accepted ONLY from the room's current host.
 *   2. `br:input` is accepted only for seats the sender actually owns.
 *
 * These run against the real handler with fake sockets, so they exercise the
 * shipped ordering (rate limit → size cap → schema → ownership) rather than a
 * restatement of it.
 */

import { describe, expect, it, beforeEach } from 'vitest';
import type { Server, Socket } from 'socket.io';
import { registerBumsRushHandlers, handleBumsRushDisconnect } from '../bums-rush';
import { BR_C2S, BR_S2C, NET_LIMITS } from '@/lib/bums-rush/constants';

type Handler = (payload: unknown) => void;

interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  rooms: Set<string>;
  handlers: Map<string, Handler>;
  emitted: { event: string; payload: unknown }[];
  /** What this socket received via `io.to(room).emit` / `socket.to(room).emit`. */
  broadcastsSeen: { event: string; payload: unknown }[];
}

const COSMETICS = { head: 'biro', hat: null, gloves: 'mitten', ink: 'seat-1' };

function makeWorld() {
  const sockets = new Map<string, FakeSocket>();

  const roomMembers = (room: string) =>
    [...sockets.values()].filter((s) => s.rooms.has(room));

  const io = {
    sockets: {
      sockets: {
        get: (id: string) => sockets.get(id) as unknown as Socket | undefined,
      },
    },
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        for (const s of roomMembers(room)) s.broadcastsSeen.push({ event, payload });
      },
    }),
  } as unknown as Server;

  // One object plays both parts: the socket.io surface the handler drives, and
  // the recorder the assertions read. Keeping them separate meant
  // `io.sockets.sockets.get(id).emit(...)` — which is how the handler reaches
  // the host with relayed input — landed on an object that had no `emit`.
  function connect(id: string): FakeSocket {
    const fake = {
      id,
      data: {} as Record<string, unknown>,
      rooms: new Set<string>([id]),
      handlers: new Map<string, Handler>(),
      emitted: [] as { event: string; payload: unknown }[],
      broadcastsSeen: [] as { event: string; payload: unknown }[],
      on(event: string, fn: Handler) {
        fake.handlers.set(event, fn);
      },
      emit(event: string, payload: unknown) {
        fake.emitted.push({ event, payload });
      },
      join(room: string) {
        fake.rooms.add(room);
      },
      leave(room: string) {
        fake.rooms.delete(room);
      },
      to(room: string) {
        return {
          emit: (event: string, payload: unknown) => {
            for (const s of roomMembers(room)) {
              if (s.id !== id) s.broadcastsSeen.push({ event, payload });
            }
          },
        };
      },
    };
    sockets.set(id, fake as unknown as FakeSocket);
    registerBumsRushHandlers(io, fake as unknown as Socket);
    return fake as unknown as FakeSocket;
  }

  const send = (s: FakeSocket, event: string, payload: unknown) => {
    const fn = s.handlers.get(event);
    if (!fn) throw new Error(`handler never registered for ${event}`);
    fn(payload);
  };

  // Room state reaches a client either directly (`socket.emit`, on join) or as a
  // room broadcast (`io.to(room).emit`, on every subsequent change), so both
  // channels have to be searched or the newest snapshot is missed.
  const lastRoom = (s: FakeSocket) =>
    [...s.emitted, ...s.broadcastsSeen].reverse().find((e) => e.event === BR_S2C.ROOM)?.payload as
      | { code: string; seats: { seat: number; clientId: string }[] }
      | undefined;

  return { io, connect, send, lastRoom, sockets };
}

/**
 * The input packet from §9.4: `u8 seatCount`, then per seat
 * `u8 seat, u16 frame, i8 aim×4, u8 grip×2, u8 buttons`.
 */
function encodeInput(seat: number): Uint8Array {
  const b = new Uint8Array(12);
  const v = new DataView(b.buffer);
  v.setUint8(0, 1);
  v.setUint8(1, seat);
  v.setUint16(2, 1, true);
  v.setUint8(8, 255);
  return b;
}

describe("Bum's Rush relay — the security boundary (§9.1, §9.3)", () => {
  let world: ReturnType<typeof makeWorld>;
  let host: FakeSocket;
  let guest: FakeSocket;
  /** Captured before the recorders are cleared for the assertions. */
  let seats: { seat: number; clientId: string }[];

  beforeEach(() => {
    world = makeWorld();
    host = world.connect('host-sock');
    guest = world.connect('guest-sock');

    world.send(host, BR_C2S.CREATE_ROOM, {
      mode: 'campaign',
      private: false,
      cosmetics: COSMETICS,
      name: 'Host',
      levelId: 'w1-01',
    });
    const room = world.lastRoom(host);
    expect(room, 'the room was never created').toBeDefined();

    world.send(guest, BR_C2S.JOIN_ROOM, {
      code: room!.code,
      cosmetics: COSMETICS,
      name: 'Guest',
    });
    world.send(host, BR_C2S.CLAIM_SEAT, { localIndex: 0, cosmetics: COSMETICS, name: 'Host' });
    world.send(guest, BR_C2S.CLAIM_SEAT, { localIndex: 0, cosmetics: COSMETICS, name: 'Guest' });
    world.send(host, BR_C2S.START, {});

    const seated = world.lastRoom(host) ?? world.lastRoom(guest);
    expect(seated, 'nobody was seated').toBeDefined();
    seats = seated!.seats;
    expect(seats.length, 'expected a seat each').toBeGreaterThanOrEqual(2);

    // Cleared AFTER the room state is captured — clearing first threw away the
    // only record of who sits where.
    host.broadcastsSeen.length = 0;
    guest.broadcastsSeen.length = 0;
    host.emitted.length = 0;
  });

  it('relays a snapshot from the host to the room', () => {
    world.send(host, BR_C2S.SNAPSHOT, new Uint8Array(64));
    expect(
      guest.broadcastsSeen.some((b) => b.event === BR_S2C.SNAPSHOT),
      'the guest never received the host snapshot',
    ).toBe(true);
  });

  it('DROPS a snapshot from a guest — the one check that matters', () => {
    world.send(guest, BR_C2S.SNAPSHOT, new Uint8Array(64));
    expect(
      host.broadcastsSeen.some((b) => b.event === BR_S2C.SNAPSHOT),
      'a guest puppeted the room: its snapshot reached the host',
    ).toBe(false);
  });

  it('drops an oversized snapshot even from the host', () => {
    world.send(host, BR_C2S.SNAPSHOT, new Uint8Array(NET_LIMITS.SNAPSHOT_BYTES + 1));
    expect(guest.broadcastsSeen.some((b) => b.event === BR_S2C.SNAPSHOT)).toBe(false);
  });

  it("forwards a guest's input for a seat it owns", () => {
    const guestSeat = seats.find((s) => s.clientId === guest.id)?.seat;
    expect(guestSeat, 'the guest never got a seat').toBeDefined();

    world.send(guest, BR_C2S.INPUT, encodeInput(guestSeat!));
    expect(
      host.emitted.some((e) => e.event === BR_S2C.INPUT),
      "the host never received the guest's own input",
    ).toBe(true);
  });

  it("DROPS a guest's input for someone else's seat", () => {
    const hostSeat = seats.find((s) => s.clientId === host.id)?.seat;
    expect(hostSeat).toBeDefined();

    world.send(guest, BR_C2S.INPUT, encodeInput(hostSeat!));
    expect(
      host.emitted.some((e) => e.event === BR_S2C.INPUT),
      "a guest sent input for the host's character",
    ).toBe(false);
  });

  it('stops relaying once the host disconnects and the room is gone', () => {
    handleBumsRushDisconnect(world.io, host as unknown as Socket);
    guest.broadcastsSeen.length = 0;
    world.send(host, BR_C2S.SNAPSHOT, new Uint8Array(64));
    expect(guest.broadcastsSeen.some((b) => b.event === BR_S2C.SNAPSHOT)).toBe(false);
  });
});
