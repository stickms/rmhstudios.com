import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server } from 'socket.io';
import {
  __resetKowloonRooms,
  handleKowloonKnockoutDisconnect,
  registerKowloonKnockoutHandlers,
} from '../../../server/socket-server/handlers/kowloon-knockout';
import { NetworkClient, type ServerMessage } from './client';

/**
 * Real sockets, real hub handler, real NetworkClient: kill the guest's
 * transport mid-match (what a Wi-Fi drop does) and check it gets its seat
 * back, rather than 'Disconnected' and a trip to the versus browser.
 */
let http: HttpServer;
let io: Server;
let url: string;

beforeAll(async () => {
  http = createServer();
  io = new Server(http, { path: '/socket/' });
  io.on('connection', (socket) => {
    registerKowloonKnockoutHandlers(io, socket);
    socket.on('disconnect', () => handleKowloonKnockoutDisconnect(io, socket));
  });
  await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/`;
});

afterAll(async () => {
  __resetKowloonRooms();
  await io.close();
});

function collect(c: NetworkClient) {
  const log: ServerMessage[] = [];
  for (const t of ['error', 'connection', 'peer_status', 'match_start', 'lobby_update', 'snapshot', 'player_left', 'room_created'] as const) {
    c.on(t, (m) => log.push(m));
  }
  return log;
}
const until = async (fn: () => boolean, ms = 6000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error('timeout');
    await new Promise((r) => setTimeout(r, 20));
  }
};

async function startMatch() {
  const host = new NetworkClient();
  const guest = new NetworkClient();
  const hostLog = collect(host);
  const guestLog = collect(guest);
  await host.connect(url);
  await guest.connect(url);
  host.createRoom('ffa', 'stone_tiger' as never, true);
  await until(() => hostLog.some((m) => m.type === 'room_created'));
  const code = (hostLog.find((m) => m.type === 'room_created') as { code: string }).code;
  guest.joinRoom(code, 'iron_bull' as never);
  await until(() => guestLog.some((m) => m.type === 'lobby_update'));
  host.start();
  await until(() => guestLog.some((m) => m.type === 'match_start'));
  return { host, guest, hostLog, guestLog };
}

// Simulate the network dying under the client without the client hanging up.
const dropTransport = (c: NetworkClient) => (c as any).socket.io.engine.close();

describe('kowloon knockout: a dropped guest resumes the same match', () => {
  it('guest drop mid-match: reconnects, keeps seat, gets snapshots again, host never sees player_left', async () => {
    const { host, guest, hostLog, guestLog } = await startMatch();
    dropTransport(guest);
    await until(() => guestLog.some((m) => m.type === 'connection' && m.status === 'reconnecting'));
    await until(() => guestLog.some((m) => m.type === 'connection' && m.status === 'live'));
    expect(guestLog.some((m) => m.type === 'error')).toBe(false);
    expect(guest.seat).toBe(1);
    expect(hostLog.some((m) => m.type === 'peer_status' && m.seat === 1 && !m.connected)).toBe(true);
    expect(hostLog.some((m) => m.type === 'peer_status' && m.seat === 1 && m.connected)).toBe(true);
    expect(hostLog.some((m) => m.type === 'player_left')).toBe(false);
    host.sendSnapshot({ tick: 7 } as never);
    await until(() => guestLog.some((m) => m.type === 'snapshot'));
    host.disconnect();
    guest.disconnect();
  });

  it('host drop mid-match: host resumes and the guest is told it was only waiting', async () => {
    const { host, guest, hostLog, guestLog } = await startMatch();
    dropTransport(host);
    await until(() => guestLog.some((m) => m.type === 'peer_status' && m.seat === 0 && !m.connected));
    await until(() => hostLog.some((m) => m.type === 'connection' && m.status === 'live'));
    await until(() => guestLog.some((m) => m.type === 'peer_status' && m.seat === 0 && m.connected));
    expect(guestLog.some((m) => m.type === 'error')).toBe(false);
    host.disconnect();
    guest.disconnect();
  });

  it('lobby drop is still just Disconnected (nothing to resume)', async () => {
    const guest = new NetworkClient();
    const log = collect(guest);
    await guest.connect(url);
    dropTransport(guest);
    await until(() => log.some((m) => m.type === 'error'));
    expect(log.find((m) => m.type === 'error')).toMatchObject({ message: 'Disconnected' });
  });
});
