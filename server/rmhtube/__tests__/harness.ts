/**
 * In-process RMHTube hub for integration tests: the real RoomManager,
 * SyncEngine, MediaQueue, ChatHandler and ReconnectionHandler on a real
 * socket.io server, with socket.io-client users. Only Prisma is stubbed (the
 * hub's writes are fire-and-forget, so a stub that resolves is behaviourally
 * identical for sync) and auth is a test middleware that trusts
 * `handshake.auth.userId`.
 *
 * Timers are shortened through the same env vars production reads, so the
 * paths under test are the production paths, just faster.
 */

import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { C2S, S2C } from '../../../lib/rmhtube/events';
import type { VideoState } from '../../../lib/rmhtube/types';

export interface TestUser {
  id: string;
  socket: ClientSocket;
  /** Every anchor received, oldest first. */
  states: VideoState[];
  /** Every room action received. */
  actions: Array<{ type: string; data: Record<string, unknown>; seq: number }>;
  snapshots: Array<Record<string, unknown>>;
  errors: Array<{ code?: string; message?: string }>;
  emit: (event: string, payload?: unknown) => void;
  lastState: () => VideoState | undefined;
  close: () => void;
}

export interface Hub {
  url: string;
  path: string;
  io: Server;
  connect: (id: string) => Promise<TestUser>;
  stop: () => Promise<void>;
  roomManager: import('../room-manager').RoomManager;
}

export async function startHub(): Promise<Hub> {
  const [{ RoomManager }, { SyncEngine }, { MediaQueue }, { ChatHandler }, { ReconnectionHandler }, { config }] =
    await Promise.all([
      import('../room-manager'),
      import('../sync-engine'),
      import('../media-queue'),
      import('../chat-handler'),
      import('../reconnection'),
      import('../config'),
    ]);

  const http: HttpServer = createServer();
  const io = new Server(http, { path: config.SOCKET_PATH });
  io.use((socket, next) => {
    const auth = socket.handshake.auth as { userId?: string };
    if (!auth.userId) return next(new Error('no user'));
    socket.data.userId = auth.userId;
    socket.data.userName = auth.userId;
    socket.data.avatarUrl = null;
    next();
  });

  const roomManager = new RoomManager(io);
  const syncEngine = new SyncEngine(io, roomManager);
  const mediaQueue = new MediaQueue(io, roomManager, syncEngine);
  syncEngine.setAdvanceHandler((room) => mediaQueue.advanceQueue(room));
  const chatHandler = new ChatHandler(io, roomManager);
  const reconnection = new ReconnectionHandler(io, roomManager);

  io.on('connection', (socket) => {
    reconnection.attemptReconnect(socket);
    roomManager.handleConnection(socket);
    syncEngine.handleConnection(socket);
    mediaQueue.handleConnection(socket);
    chatHandler.handleConnection(socket);
    socket.on('disconnect', () => roomManager.handleDisconnect(socket));
  });
  syncEngine.startHeartbeat();

  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port } = http.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  const users: TestUser[] = [];

  const connect = async (id: string): Promise<TestUser> => {
    const socket = ioClient(url, {
      path: config.SOCKET_PATH,
      auth: { userId: id },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    const user: TestUser = {
      id,
      socket,
      states: [],
      actions: [],
      snapshots: [],
      errors: [],
      emit: (event, payload) => socket.emit(event, payload ?? {}),
      lastState: () => user.states[user.states.length - 1],
      close: () => socket.disconnect(),
    };
    socket.on(S2C.SYNC_STATE, (s: VideoState) => user.states.push(s));
    socket.on(S2C.ROOM_ACTION, (a: { type: string; payload: Record<string, unknown>; seq: number }) =>
      user.actions.push({ type: a.type, data: a.payload ?? {}, seq: a.seq }),
    );
    socket.on(S2C.ROOM_STATE_SNAPSHOT, (s: Record<string, unknown>) => user.snapshots.push(s));
    socket.on(S2C.ERROR, (e: TestUser['errors'][number]) => user.errors.push(e));
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    users.push(user);
    return user;
  };

  const stop = async () => {
    for (const u of users) u.socket.disconnect();
    syncEngine.stopHeartbeat();
    roomManager.stopGarbageCollector?.();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  };

  return { url, path: config.SOCKET_PATH, io, connect, stop, roomManager };
}

/** Poll until `predicate` holds (or fail with `label`). */
export async function waitFor<T>(
  predicate: () => T | undefined | null | false,
  label: string,
  timeoutMs = 3_000,
): Promise<T> {
  const started = Date.now();
  for (;;) {
    const value = predicate();
    if (value) return value as T;
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 15));
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A room with `host` in it and `others` joined; resolves to its id. */
export async function roomWith(host: TestUser, ...others: TestUser[]): Promise<string> {
  host.emit(C2S.ROOM_CREATE, { name: 'test' });
  const snap = await waitFor(() => host.snapshots[host.snapshots.length - 1], 'host snapshot');
  const roomId = snap.roomId as string;
  for (const o of others) {
    o.emit(C2S.ROOM_JOIN, { roomId });
    await waitFor(() => o.snapshots.length > 0, `${o.id} joined`);
  }
  return roomId;
}

/** Stub Prisma: every write resolves, every read finds nothing. */
export function prismaStub(): unknown {
  const model = new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === 'findMany') return () => Promise.resolve([]);
        if (key === 'count') return () => Promise.resolve(0);
        return () => Promise.resolve(null);
      },
    },
  );
  return new Proxy(
    {},
    {
      get: (_t, key) => {
        if (key === '$transaction') return () => Promise.resolve([]);
        if (key === '$disconnect') return () => Promise.resolve();
        return model;
      },
    },
  );
}
