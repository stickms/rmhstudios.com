import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import { io as connect, type Socket } from 'socket.io-client';
import {
  __resetDreamRiftLobbies,
  __setResumeGraceMs,
  handleDreamRiftDisconnect,
  registerDreamRiftHandlers,
} from '../../server/handlers';
import { C2S, S2C, type JoinedPayload } from './events';

/**
 * Real sockets + the real hub handler: kill a seated player's transport
 * mid-game (what a Wi-Fi drop does) and check the seat is held for the grace
 * window and handed back to the reconnected socket, instead of the player
 * being deleted from the lobby (and a vanished host migrating away).
 */
let http: HttpServer;
let io: Server;
let url: string;
const open: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  io = new Server(http, { path: '/socket/' });
  io.on('connection', (socket) => {
    registerDreamRiftHandlers(io, socket);
    socket.on('disconnect', () => handleDreamRiftDisconnect(io, socket));
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
});

afterEach(() => {
  for (const s of open.splice(0)) s.disconnect();
  __resetDreamRiftLobbies();
});

afterAll(async () => {
  await io.close();
});

type Msg = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Log = { ev: string; data: Msg }[];

function client(): { s: Socket; log: Log } {
  const s = connect(url, { path: '/socket/', forceNew: true, reconnection: true, reconnectionDelay: 50, reconnectionDelayMax: 100 });
  open.push(s);
  const log: Log = [];
  s.onAny((ev, data) => log.push({ ev, data }));
  return { s, log };
}
const until = async (fn: () => boolean, ms = 6000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const has = (log: Log, ev: string, pred: (d: Msg) => boolean = () => true) => log.some((e) => e.ev === ev && pred(e.data));

async function startGame() {
  const host = client();
  const guest = client();
  await until(() => host.s.connected && guest.s.connected);
  host.s.emit(C2S.CREATE, { isPublic: false, difficulty: 'normal' });
  await until(() => has(host.log, S2C.JOINED));
  const hostJoin = host.log.find((e) => e.ev === S2C.JOINED)!.data as JoinedPayload;
  guest.s.emit(C2S.JOIN, { code: hostJoin.code });
  await until(() => has(guest.log, S2C.JOINED));
  const guestJoin = guest.log.find((e) => e.ev === S2C.JOINED)!.data as JoinedPayload;
  guest.s.emit(C2S.READY, { ready: true });
  await until(() => has(host.log, S2C.LOBBY, (l) => (l.players as Msg[]).every((p) => p.isHost || p.ready)));
  host.s.emit(C2S.START, {});
  await until(() => has(guest.log, S2C.START));
  return { host, guest, hostJoin, guestJoin, code: hostJoin.code };
}

// The transport dies under the client without it hanging up; socket.io reconnects on its own.
const dropTransport = (c: { s: Socket }) => (c.s.io as unknown as { engine: { close(): void } }).engine.close();

describe('dream rift hub: a dropped player resumes the same seat', () => {
  it('guest drop mid-game: seat is held, reclaimed on a new socket, host never sees peerLeft', async () => {
    const { host, guest, guestJoin, code } = await startGame();
    expect(guestJoin.resumeToken).toMatch(/^[0-9a-f]{32}$/);
    // The token is private to its owner: never in the room-wide lobby snapshot.
    expect(JSON.stringify(host.log.filter((e) => e.ev === S2C.LOBBY))).not.toContain(guestJoin.resumeToken);

    const oldId = guest.s.id;
    // What features/dream-rift/engine/net/connection.ts does on every (re)connect.
    guest.s.on('connect', () => guest.s.emit(C2S.RESUME, { code, token: guestJoin.resumeToken }));
    dropTransport(guest);

    await until(() => has(host.log, S2C.PEER_STATUS, (d) => d.slot === guestJoin.yourSlot && d.connected === false));
    await until(() => has(guest.log, S2C.RESUMED));
    const resumed = guest.log.find((e) => e.ev === S2C.RESUMED)!.data as JoinedPayload;
    expect(resumed.yourSlot).toBe(guestJoin.yourSlot);
    expect(resumed.selfId).toBe(guest.s.id);
    expect(guest.s.id).not.toBe(oldId);
    await until(() => has(host.log, S2C.PEER_STATUS, (d) => d.slot === guestJoin.yourSlot && d.connected === true));
    expect(has(host.log, S2C.PEER_LEFT)).toBe(false);

    // The lobby now points the seat at the new socket, and relay works both ways.
    const lobby = host.log.filter((e) => e.ev === S2C.LOBBY).at(-1)!.data;
    expect((lobby.players as Msg[]).find((p) => p.slot === guestJoin.yourSlot)?.socketId).toBe(guest.s.id);
    guest.s.emit(C2S.RELAY, { k: 'p', slot: guestJoin.yourSlot, d: { x: 1 } });
    await until(() => has(host.log, S2C.RELAY, (m) => m.k === 'p'));
    host.s.emit(C2S.RELAY, { k: 'world', d: { t: 1 } });
    await until(() => has(guest.log, S2C.RELAY, (m) => m.k === 'world'));
  });

  it('host drop mid-game: host seat and host flag are kept, no migration', async () => {
    const { host, guest, hostJoin, code } = await startGame();
    host.s.on('connect', () => host.s.emit(C2S.RESUME, { code, token: hostJoin.resumeToken }));
    dropTransport(host);
    await until(() => has(host.log, S2C.RESUMED));
    await until(() => has(guest.log, S2C.LOBBY, (l) => l.hostSocketId === host.s.id));
    expect(has(guest.log, S2C.HOST_CHANGED)).toBe(false);
    expect(has(guest.log, S2C.PEER_LEFT)).toBe(false);
  });

  it('a seat nobody reclaims is freed when the grace window ends (and the host migrates)', async () => {
    __setResumeGraceMs(150);
    const { host, guest, hostJoin } = await startGame();
    host.s.io.opts.reconnection = false;
    host.s.disconnect();
    await until(() => has(guest.log, S2C.PEER_STATUS, (d) => d.slot === hostJoin.yourSlot && d.connected === false));
    expect(has(guest.log, S2C.PEER_LEFT)).toBe(false);
    await until(() => has(guest.log, S2C.PEER_LEFT, (d) => d.slot === hostJoin.yourSlot));
    await until(() => has(guest.log, S2C.HOST_CHANGED));
  });

  it('a wrong token cannot take a seat', async () => {
    const { guest, code } = await startGame();
    const thief = client();
    await until(() => thief.s.connected);
    thief.s.emit(C2S.RESUME, { code, token: 'f'.repeat(32) });
    await until(() => has(thief.log, S2C.ERROR));
    expect(has(thief.log, S2C.RESUMED)).toBe(false);
    expect(has(guest.log, S2C.PEER_LEFT)).toBe(false);
  });

  it('a drop in the waiting lobby still removes the player at once (no ghost seats in public rooms)', async () => {
    const host = client();
    const guest = client();
    await until(() => host.s.connected && guest.s.connected);
    host.s.emit(C2S.CREATE, { isPublic: true, difficulty: 'normal' });
    await until(() => has(host.log, S2C.JOINED));
    const code = (host.log.find((e) => e.ev === S2C.JOINED)!.data as JoinedPayload).code;
    guest.s.emit(C2S.JOIN, { code });
    await until(() => has(guest.log, S2C.JOINED));
    guest.s.io.opts.reconnection = false;
    guest.s.disconnect();
    await until(() => has(host.log, S2C.PEER_LEFT));
  });
});
