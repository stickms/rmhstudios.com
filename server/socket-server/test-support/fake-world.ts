/**
 * TEST SUPPORT ONLY — shared fixtures for the games-hub tests (TF2, Balatro):
 * a fake socket.io world (the approach of
 * handlers/__tests__/bums-rush-security.test.ts, plus `volatile` and a
 * recorded `disconnect`) and a polling `until` for asynchronous round trips.
 * Moved from tf2/helpers.ts, which re-exports it.
 */

import type { Server, Socket } from 'socket.io';

type Handler = (payload: unknown) => void;

export interface Received {
  event: string;
  payload: unknown;
  volatile: boolean;
}

export interface FakeSocket {
  id: string;
  data: Record<string, unknown>;
  rooms: Set<string>;
  handlers: Map<string, Handler>;
  /** Everything this socket received, by any route. */
  received: Received[];
  /** Set when the server hung up on it (`socket.disconnect()`, e.g. `bindEvents` on a bad payload). */
  disconnected: boolean;
}

export function makeWorld(...registers: Array<(io: Server, socket: Socket) => void>) {
  const sockets = new Map<string, FakeSocket>();

  const deliver = (room: string, event: string, payload: unknown, volatile: boolean) => {
    for (const s of sockets.values()) {
      if (s.rooms.has(room)) s.received.push({ event, payload, volatile });
    }
  };

  const io = {
    sockets: {
      sockets: {
        get: (id: string) => sockets.get(id) as unknown as Socket | undefined,
      },
    },
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => deliver(room, event, payload, false),
      volatile: {
        emit: (event: string, payload: unknown) => deliver(room, event, payload, true),
      },
    }),
  } as unknown as Server;

  function connect(id: string, data: Record<string, unknown> = {}): FakeSocket {
    const fake = {
      id,
      data,
      rooms: new Set<string>([id]),
      handlers: new Map<string, Handler>(),
      received: [] as Received[],
      disconnected: false,
      on(event: string, fn: Handler) {
        fake.handlers.set(event, fn);
      },
      emit(event: string, payload: unknown) {
        fake.received.push({ event, payload, volatile: false });
      },
      volatile: {
        emit(event: string, payload: unknown) {
          fake.received.push({ event, payload, volatile: true });
        },
      },
      join(room: string) {
        fake.rooms.add(room);
      },
      leave(room: string) {
        fake.rooms.delete(room);
      },
      disconnect() {
        fake.disconnected = true;
      },
    };
    sockets.set(id, fake as unknown as FakeSocket);
    for (const register of registers) register(io, fake as unknown as Socket);
    return fake as unknown as FakeSocket;
  }

  const send = (s: FakeSocket, event: string, payload?: unknown) => {
    const fn = s.handlers.get(event);
    if (!fn) throw new Error(`handler never registered for ${event}`);
    fn(payload);
  };

  const disconnect = (s: FakeSocket) => {
    sockets.delete(s.id);
  };

  return { io, connect, send, disconnect, sockets };
}

export function last<T = unknown>(s: FakeSocket, event: string): T | undefined {
  for (let i = s.received.length - 1; i >= 0; i -= 1) {
    if (s.received[i].event === event) return s.received[i].payload as T;
  }
  return undefined;
}

export function all<T = unknown>(s: FakeSocket, event: string): T[] {
  return s.received.filter((r) => r.event === event).map((r) => r.payload as T);
}

export async function until(check: () => boolean, timeoutMs = 2_000, what = 'condition'): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
