/**
 * Peer-to-peer signaling and the relay fallback on the hub
 * (server/socket-server/handlers/tf2-p2p.ts), against the fake socket.io world:
 * accounts on every action, the hub vouching for who joins, signals only
 * between a host and its admitted member, size caps, kicks, the relay's
 * per-room and per-byte caps, and rooms expiring with their host.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleTf2P2pDisconnect,
  listPublicP2pRooms,
  registerTf2P2pHandlers,
  resetTf2P2pForTests,
} from '../handlers/tf2-p2p';
import { registerTf2GameHandlers } from '../handlers/tf2-game';
import { TF2_C2S, TF2_S2C, type ErrorPayload, type RoomDetailsPayload, type RoomsPayload } from '@/lib/tf2-game/net/events';
import {
  decodeRelay,
  encodeRelay,
  P2P_LIMITS,
  P2P_RELAY_LIMITS,
  type P2pAdmittedPayload,
  type P2pClosedPayload,
  type P2pHostedPayload,
  type P2pJoinRequest,
  type P2pRelayReadyPayload,
  type P2pSignalIn,
} from '@/lib/tf2-game/net/p2p/signal';
import { all, last, makeWorld, type FakeSocket } from './helpers';

process.env.LOG_LEVEL = 'silent';

const HOST = { map: 'ctf_2fort', maxPlayers: 8, botCount: 4, botDifficulty: 'normal', name: 'Friends only' };

let world: ReturnType<typeof makeWorld>;
let nextId = 0;

function connect(data?: Record<string, unknown>): FakeSocket {
  nextId += 1;
  return world.connect(`sock-${nextId}`, data ?? { userId: `user-${nextId}`, userName: `Player ${nextId}` });
}

const errors = (s: FakeSocket) => all<ErrorPayload>(s, TF2_S2C.ERROR).map((e) => e.code);

function host(s: FakeSocket, over: Record<string, unknown> = {}): P2pHostedPayload {
  world.send(s, TF2_C2S.P2P_HOST, { ...HOST, ...over });
  const hosted = last<P2pHostedPayload>(s, TF2_S2C.P2P_HOSTED);
  if (!hosted) throw new Error(`not hosted: ${errors(s).join(',')}`);
  return hosted;
}

/** Join and get admitted; returns the member's peer id. */
function joinAdmitted(h: FakeSocket, m: FakeSocket, code: string): string {
  world.send(m, TF2_C2S.P2P_JOIN, { code });
  const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
  world.send(h, TF2_C2S.P2P_ADMIT, { peerId: req.peerId, accept: true });
  expect(last<P2pAdmittedPayload>(m, TF2_S2C.P2P_ADMITTED)?.peerId).toBe(req.peerId);
  return req.peerId;
}

beforeEach(() => {
  world = makeWorld(registerTf2GameHandlers, registerTf2P2pHandlers);
});

afterEach(() => {
  vi.useRealTimers();
  resetTf2P2pForTests(world.io);
});

describe('accounts', () => {
  it('refuses every P2P action from a signed-out socket', () => {
    const h = connect();
    const { code } = host(h);
    const anon = connect({});
    world.send(anon, TF2_C2S.P2P_HOST, HOST);
    world.send(anon, TF2_C2S.P2P_UPDATE, { state: 'running', players: [], teamScores: [0, 0], round: null });
    world.send(anon, TF2_C2S.P2P_CLOSE, {});
    world.send(anon, TF2_C2S.P2P_JOIN, { code });
    world.send(anon, TF2_C2S.P2P_LEAVE, {});
    world.send(anon, TF2_C2S.P2P_ADMIT, { peerId: 'aaaaaaaaaaaa', accept: true });
    world.send(anon, TF2_C2S.P2P_KICK, { peerId: 'aaaaaaaaaaaa' });
    world.send(anon, TF2_C2S.P2P_SIGNAL, { candidate: null });
    world.send(anon, TF2_C2S.P2P_RELAY_START, {});
    expect(errors(anon)).toEqual(Array(9).fill('auth-required'));
    expect(last(h, TF2_S2C.P2P_JOIN_REQUEST)).toBeUndefined();
    world.send(anon, TF2_C2S.P2P_RELAY, encodeRelay(1, false, new Uint8Array([1, 2, 3])));
    expect(h.received.filter((r) => r.event === TF2_S2C.P2P_RELAY)).toEqual([]);
  });

  it('vouches for the joining account: the host sees the hub’s user id and name, never the peer’s claim', () => {
    const h = connect({ userId: 'u-host', userName: 'Engie' });
    const hosted = host(h);
    expect(hosted).toMatchObject({ hostName: 'Engie', hostUserId: 'u-host', resumed: false });
    const m = connect({ userId: 'u-medic', userName: 'Medic' });
    world.send(m, TF2_C2S.P2P_JOIN, { code: hosted.code, userId: 'u-host', name: 'Engie' });
    const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
    expect(req).toMatchObject({ code: hosted.code, userId: 'u-medic', name: 'Medic' });
    expect(req.peerId).toMatch(/^[A-Za-z0-9]{12}$/);
    // The host cannot join its own room from another socket of the same account.
    const again = connect({ userId: 'u-host', userName: 'Engie' });
    world.send(again, TF2_C2S.P2P_JOIN, { code: hosted.code });
    expect(errors(again)).toEqual(['bad-payload']);
  });
});

describe('hosting and the browser', () => {
  it('announces a room, lists it for the browser, hides private ones', async () => {
    const h = connect({ userId: 'u1', userName: 'Pyro' });
    const hosted = host(h);
    expect(hosted.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(hosted.token).toMatch(/^[A-Za-z0-9]{24}$/);
    expect(hosted.relay).toEqual({ maxPeers: P2P_RELAY_LIMITS.MAX_PEERS_PER_ROOM, bytesPerSec: P2P_RELAY_LIMITS.BYTES_PER_SEC });
    host(connect(), { private: true, map: 'koth_viaduct' });
    world.send(h, TF2_C2S.P2P_UPDATE, {
      state: 'running',
      players: [
        { name: 'Pyro', team: 2, cls: 7, score: 4, bot: false },
        { name: 'Bot <script>', team: 3, cls: 1, score: 1, bot: true },
      ],
      teamScores: [1, 0],
      round: { state: 'running', timeLeft: 312 },
    });
    const viewer = connect({});
    world.send(viewer, TF2_C2S.LIST_ROOMS, {});
    const page = last<RoomsPayload>(viewer, TF2_S2C.ROOMS)!;
    expect(page.rooms).toHaveLength(1);
    expect(page.rooms[0]).toMatchObject({
      code: hosted.code,
      kind: 'p2p',
      host: 'Pyro',
      players: 1,
      bots: 1,
      maxPlayers: 8,
      state: 'running',
      teamScores: [1, 0],
      round: { state: 'running', timeLeft: 312 },
    });
    // Nothing that could be an address.
    expect(JSON.stringify(page)).not.toMatch(/\d+\.\d+\.\d+\.\d+|candidate|sdp/);
    world.send(viewer, TF2_C2S.ROOM_DETAILS, { code: hosted.code });
    const details = last<RoomDetailsPayload>(viewer, TF2_S2C.ROOM_DETAILS)!;
    expect(details.room?.roster.map((p) => p.name)).toEqual(['Pyro', 'Bot script']);
  });

  it('validates the announcement: allowlisted map, its own mode, at most 12 players', () => {
    const h = connect();
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, map: 'de_dust2' });
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, mode: 'koth' });
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, maxPlayers: 13 });
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, resume: { code: 'ABCDEF', token: 'x'.repeat(24) } });
    expect(errors(h)).toEqual(['unknown-map', 'bad-mode', 'bad-payload', 'no-such-room']);
    expect(listPublicP2pRooms()).toEqual([]);
  });

  it('hosts CS:GO rooms on its own maps and modes, listed apart from TF2', () => {
    const h = connect({ userId: 'u-cs', userName: 'Phoenix' });
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, game: 'csgo', map: 'ctf_2fort' });
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, game: 'csgo', map: 'de_dust2', mode: 'ctf' });
    expect(errors(h)).toEqual(['unknown-map', 'bad-mode']);
    const cs = host(h, { game: 'csgo', map: 'de_dust2', mode: 'dm', maxPlayers: 10 });
    host(connect(), { map: 'cp_dustbowl' });
    const viewer = connect({});
    world.send(viewer, TF2_C2S.LIST_ROOMS, { game: 'csgo' });
    const page = last<RoomsPayload>(viewer, TF2_S2C.ROOMS)!;
    expect(page.rooms.map((r) => [r.code, r.game, r.map, r.mode])).toEqual([[cs.code, 'csgo', 'de_dust2', 'dm']]);
    world.send(viewer, TF2_C2S.LIST_ROOMS, {});
    const tf2 = last<RoomsPayload>(viewer, TF2_S2C.ROOMS)!;
    expect(tf2.rooms.map((r) => [r.map, r.game])).toEqual([['cp_dustbowl', undefined]]);
    // A member is admitted to the CS room with its game and mode.
    const m = connect();
    joinAdmitted(h, m, cs.code);
    expect(last<P2pAdmittedPayload>(m, TF2_S2C.P2P_ADMITTED)).toMatchObject({ game: 'csgo', map: 'de_dust2', mode: 'dm' });
  });

  it('closing the room tells every member; the host’s socket dropping does after a 30 s grace, unless it resumes', () => {
    vi.useFakeTimers();
    const h = connect({ userId: 'u-host', userName: 'Host' });
    const hosted = host(h);
    const m = connect();
    joinAdmitted(h, m, hosted.code);

    handleTf2P2pDisconnect(world.io, h as never);
    world.disconnect(h);
    expect(listPublicP2pRooms()).toEqual([]);
    vi.advanceTimersByTime(P2P_LIMITS.HOST_GRACE_MS - 1000);
    expect(last(m, TF2_S2C.P2P_CLOSED)).toBeUndefined();
    // Back within the grace, with the token: the room is still its.
    const back = world.connect('sock-back', { userId: 'u-host', userName: 'Host' });
    world.send(back, TF2_C2S.P2P_HOST, { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(last<P2pHostedPayload>(back, TF2_S2C.P2P_HOSTED)).toMatchObject({ code: hosted.code, resumed: true });
    vi.advanceTimersByTime(5_000);
    expect(last(m, TF2_S2C.P2P_CLOSED)).toBeUndefined();
    // Someone else's account cannot take it with a stolen token.
    const thief = connect();
    world.send(thief, TF2_C2S.P2P_HOST, { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(errors(thief)).toEqual(['no-such-room']);

    // Gone for good this time.
    handleTf2P2pDisconnect(world.io, back as never);
    world.disconnect(back);
    vi.advanceTimersByTime(P2P_LIMITS.HOST_GRACE_MS + 10);
    expect(last<P2pClosedPayload>(m, TF2_S2C.P2P_CLOSED)).toEqual({ code: hosted.code, reason: 'host-left' });

    // An explicit close is immediate.
    const h2 = connect();
    const second = host(h2);
    const m2 = connect();
    joinAdmitted(h2, m2, second.code);
    world.send(h2, TF2_C2S.P2P_CLOSE, {});
    expect(last<P2pClosedPayload>(m2, TF2_S2C.P2P_CLOSED)).toEqual({ code: second.code, reason: 'host-closed' });
    world.send(connect(), TF2_C2S.P2P_JOIN, { code: second.code });
  });
});

describe('joining and signaling', () => {
  it('relays offers, answers and candidates only between the host and its admitted member', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    world.send(m, TF2_C2S.P2P_JOIN, { code });
    const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
    // Not admitted yet: nothing passes either way.
    world.send(m, TF2_C2S.P2P_SIGNAL, { candidate: null });
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: req.peerId, description: { type: 'offer', sdp: 'v=0' } });
    expect(errors(m)).toEqual(['bad-payload']);
    expect(errors(h)).toEqual(['not-in-room']);
    world.send(h, TF2_C2S.P2P_ADMIT, { peerId: req.peerId, accept: true });
    expect(last<P2pAdmittedPayload>(m, TF2_S2C.P2P_ADMITTED)).toMatchObject({ code, map: 'ctf_2fort', mode: 'ctf' });

    world.send(h, TF2_C2S.P2P_SIGNAL, { to: req.peerId, description: { type: 'offer', sdp: 'v=0 offer' } });
    expect(last<P2pSignalIn>(m, TF2_S2C.P2P_SIGNAL)).toEqual({ code, from: 'host', description: { type: 'offer', sdp: 'v=0 offer' } });
    world.send(m, TF2_C2S.P2P_SIGNAL, { description: { type: 'answer', sdp: 'v=0 answer' } });
    world.send(m, TF2_C2S.P2P_SIGNAL, { candidate: { candidate: 'candidate:1 1 udp 1 10.0.0.2 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } });
    const toHost = all<P2pSignalIn>(h, TF2_S2C.P2P_SIGNAL);
    expect(toHost.map((s) => s.from)).toEqual([req.peerId, req.peerId]);
    expect(toHost[0].description?.type).toBe('answer');

    // A member names no target; a stranger reaches nobody; nobody else hears any of it.
    world.send(m, TF2_C2S.P2P_SIGNAL, { to: req.peerId, candidate: null });
    const stranger = connect();
    world.send(stranger, TF2_C2S.P2P_SIGNAL, { candidate: null });
    world.send(stranger, TF2_C2S.P2P_SIGNAL, { to: req.peerId, candidate: null });
    expect(errors(m).slice(-1)).toEqual(['bad-payload']);
    expect(errors(stranger)).toEqual(['not-in-room', 'not-in-room']);
    expect(all(stranger, TF2_S2C.P2P_SIGNAL)).toEqual([]);
    // Another room's host cannot signal this member.
    const other = connect();
    host(other, { map: 'pl_upward' });
    world.send(other, TF2_C2S.P2P_SIGNAL, { to: req.peerId, candidate: null });
    expect(errors(other)).toEqual(['not-in-room']);
  });

  it('caps signal sizes and shapes', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peerId = joinAdmitted(h, m, code);
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: peerId, description: { type: 'offer', sdp: 'x'.repeat(P2P_LIMITS.SDP_MAX_LENGTH + 1) } });
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: peerId, candidate: { candidate: 'x'.repeat(P2P_LIMITS.CANDIDATE_MAX_LENGTH + 1) } });
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: peerId, description: { type: 'offer', sdp: 'v=0' }, candidate: null });
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: peerId });
    world.send(h, TF2_C2S.P2P_SIGNAL, { to: peerId, description: { type: 'rollback', sdp: 'v=0' } });
    expect(errors(h)).toEqual(Array(5).fill('bad-payload'));
    expect(all(m, TF2_S2C.P2P_SIGNAL)).toEqual([]);
  });

  it('enforces room size and the host’s kicks and refusals', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 2, botCount: 0 });
    const a = connect({ userId: 'u-a', userName: 'A' });
    const peerA = joinAdmitted(h, a, code);
    const b = connect();
    world.send(b, TF2_C2S.P2P_JOIN, { code });
    expect(errors(b)).toEqual(['room-full']);

    world.send(h, TF2_C2S.P2P_KICK, { peerId: peerA });
    expect(last<P2pClosedPayload>(a, TF2_S2C.P2P_CLOSED)).toEqual({ code, reason: 'kicked' });
    // The same account from a fresh socket is refused at the hub.
    const aAgain = connect({ userId: 'u-a', userName: 'A' });
    world.send(aAgain, TF2_C2S.P2P_JOIN, { code });
    expect(errors(aAgain)).toEqual(['kicked']);
    // A refusal reaches the asker with the host's reason.
    const c = connect();
    world.send(c, TF2_C2S.P2P_JOIN, { code });
    const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
    world.send(h, TF2_C2S.P2P_ADMIT, { peerId: req.peerId, accept: false, reason: 'full' });
    expect(last<P2pClosedPayload>(c, TF2_S2C.P2P_CLOSED)).toEqual({ code, reason: 'full' });
    // Only the host admits or kicks.
    world.send(c, TF2_C2S.P2P_KICK, { peerId: req.peerId });
    expect(errors(c)).toEqual(['not-host']);
  });

  it('tells the host when a member’s hub connection goes', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peerId = joinAdmitted(h, m, code);
    handleTf2P2pDisconnect(world.io, m as never);
    expect(last(h, TF2_S2C.P2P_PEER_LEFT)).toEqual({ peerId });
  });
});

describe('the relay fallback', () => {
  function roomWith(n: number) {
    const h = connect();
    const { code } = host(h, { maxPlayers: 12 });
    const members = Array.from({ length: n }, () => {
      const m = connect();
      return { socket: m, peerId: joinAdmitted(h, m, code) };
    });
    return { h, code, members };
  }

  it('relays at most four members per room, and only for members of it', () => {
    const { h, members } = roomWith(5);
    for (const m of members.slice(0, 4)) world.send(h, TF2_C2S.P2P_RELAY_START, { peerId: m.peerId });
    expect(all<P2pRelayReadyPayload>(h, TF2_S2C.P2P_RELAY_READY)).toHaveLength(4);
    expect(last<P2pRelayReadyPayload>(members[0].socket, TF2_S2C.P2P_RELAY_READY)?.slot).toBe(1);
    world.send(members[4].socket, TF2_C2S.P2P_RELAY_START, {});
    expect(errors(members[4].socket)).toEqual(['relay-full']);
    const stranger = connect();
    world.send(stranger, TF2_C2S.P2P_RELAY_START, {});
    expect(errors(stranger)).toEqual(['not-in-room']);
  });

  it('carries opaque packets both ways with the member’s slot, and nothing for a member not on the relay', () => {
    const { h, members } = roomWith(2);
    const [a, b] = members;
    world.send(a.socket, TF2_C2S.P2P_RELAY_START, {});
    const slot = last<P2pRelayReadyPayload>(a.socket, TF2_S2C.P2P_RELAY_READY)!.slot;
    // Member → host: the hub stamps the sender's slot whatever the member wrote.
    world.send(a.socket, TF2_C2S.P2P_RELAY, encodeRelay(99, false, new Uint8Array([1, 2, 3])));
    const got = all<Uint8Array>(h, TF2_S2C.P2P_RELAY).map((p) => decodeRelay(p)!);
    expect(got).toEqual([{ slot, reliable: false, payload: new Uint8Array([1, 2, 3]) }]);
    expect(h.received.filter((r) => r.event === TF2_S2C.P2P_RELAY).every((r) => r.volatile)).toBe(true);
    // Host → member, reliable: not volatile.
    world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, true, new Uint8Array([9])));
    const toA = a.socket.received.filter((r) => r.event === TF2_S2C.P2P_RELAY);
    expect(toA).toHaveLength(1);
    expect(toA[0].volatile).toBe(false);
    // b never asked for the relay: its packets go nowhere, and the host cannot address it.
    world.send(b.socket, TF2_C2S.P2P_RELAY, encodeRelay(0, false, new Uint8Array([7])));
    world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(2, false, new Uint8Array([7])));
    expect(all(h, TF2_S2C.P2P_RELAY)).toHaveLength(1);
    expect(all(b.socket, TF2_S2C.P2P_RELAY)).toEqual([]);
    // Malformed and oversized packets are dropped.
    world.send(a.socket, TF2_C2S.P2P_RELAY, new Uint8Array([4, 0, 1]));
    world.send(a.socket, TF2_C2S.P2P_RELAY, encodeRelay(slot, false, new Uint8Array(P2P_RELAY_LIMITS.MAX_UNRELIABLE_BYTES + 1)));
    world.send(a.socket, TF2_C2S.P2P_RELAY, encodeRelay(slot, true, new Uint8Array(P2P_RELAY_LIMITS.MAX_PACKET_BYTES)));
    world.send(a.socket, TF2_C2S.P2P_RELAY, 'not bytes');
    expect(all(h, TF2_S2C.P2P_RELAY)).toHaveLength(1);
  });

  it('drops unreliable packets for a receiver that is backed up, never reliable ones', () => {
    const { h, members } = roomWith(1);
    const [a] = members;
    world.send(a.socket, TF2_C2S.P2P_RELAY_START, {});
    const slot = last<P2pRelayReadyPayload>(a.socket, TF2_S2C.P2P_RELAY_READY)!.slot;
    // A real socket exposes its engine's write queue; the fake gets one.
    const conn = { writeBuffer: [] as unknown[] };
    (a.socket as unknown as { conn: typeof conn }).conn = conn;
    world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, false, new Uint8Array([1])));
    conn.writeBuffer.length = 40;
    world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, false, new Uint8Array([2])));
    world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, true, new Uint8Array([3])));
    const got = a.socket.received.filter((r) => r.event === TF2_S2C.P2P_RELAY);
    expect(got.map((r) => decodeRelay(r.payload as Uint8Array)!.payload[0])).toEqual([1, 3]);
    // Not socket.io's `volatile` (it would also drop the packet behind a frame still being written).
    expect(got.every((r) => !r.volatile)).toBe(true);
  });

  it('holds each relayed member to its byte budget: unreliable dropped, reliable debt cut off', () => {
    vi.useFakeTimers();
    const { h, members } = roomWith(1);
    const [a] = members;
    world.send(h, TF2_C2S.P2P_RELAY_START, { peerId: a.peerId });
    const slot = last<P2pRelayReadyPayload>(a.socket, TF2_S2C.P2P_RELAY_READY)!.slot;
    // A burst of 200 full datagrams at once: only the bucket's depth gets through.
    for (let i = 0; i < 200; i++) world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, false, new Uint8Array(1200)));
    const burst = all(a.socket, TF2_S2C.P2P_RELAY).length;
    expect(burst).toBe(Math.floor(P2P_RELAY_LIMITS.BURST_BYTES / 1200));
    // A second later the budget has refilled by BYTES_PER_SEC.
    vi.advanceTimersByTime(1000);
    for (let i = 0; i < 200; i++) world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, false, new Uint8Array(1200)));
    expect(all(a.socket, TF2_S2C.P2P_RELAY).length - burst).toBe(Math.floor(P2P_RELAY_LIMITS.BYTES_PER_SEC / 1200));
    // Reliable packets always pass… until the debt passes its bound: then the member is cut off.
    const before = all(a.socket, TF2_S2C.P2P_RELAY).length;
    let sent = 0;
    while (!last(a.socket, TF2_S2C.P2P_CLOSED) && sent < 100) {
      world.send(h, TF2_C2S.P2P_RELAY, encodeRelay(slot, true, new Uint8Array(16_000)));
      sent++;
    }
    expect(all(a.socket, TF2_S2C.P2P_RELAY).length - before).toBe(sent - 1);
    expect(sent).toBeGreaterThan(P2P_RELAY_LIMITS.MAX_DEBT_BYTES / 16_000);
    expect(last<P2pClosedPayload>(a.socket, TF2_S2C.P2P_CLOSED)?.reason).toBe('relay-overflow');
    expect(last(h, TF2_S2C.P2P_PEER_LEFT)).toEqual({ peerId: a.peerId });
  });
});
