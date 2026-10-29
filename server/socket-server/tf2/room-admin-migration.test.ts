/**
 * The hub's half of host migration, TURN credentials, room doors and room
 * ownership (server/socket-server/handlers/tf2-p2p.ts, tf2-game.ts), against
 * the fake socket.io world:
 *
 *   - a P2P host names a successor; when the host leaves (on purpose, or its
 *     socket stays gone past the grace) the successor is promoted with a new
 *     token, everyone else is told `migrating` and re-requested of the new
 *     host with their hub-vouched accounts; a member that asks again while the
 *     room waits for its new host is held, not refused;
 *   - every account gets ICE servers with a TURN credential minted for it
 *     (expiring, HMAC'd — never a static one) when TURN is configured;
 *   - a P2P host's lock and password keep new accounts out (rejoins pass);
 *   - a dedicated room has an owner (its creator; handed on; inherited by the
 *     oldest signed-in player), who may kick (refused for the room's life),
 *     change the map (allowlist), lock it, set a password and speak as the
 *     server — and nobody else may; a spectator's join seats them as one.
 */

import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTf2P2pDisconnect, registerTf2P2pHandlers, resetTf2P2pForTests } from '../handlers/tf2-p2p';
import { handleTf2GameDisconnect, registerTf2GameHandlers, resetTf2GameForTests } from '../handlers/tf2-game';
import {
  TF2_C2S,
  TF2_S2C,
  type ChatMessage,
  type ErrorPayload,
  type JoinedPayload,
  type KickedPayload,
  type RoomInfoPayload,
} from '@/lib/tf2-game/net/events';
import {
  P2P_LIMITS,
  type P2pAdmittedPayload,
  type P2pHostedPayload,
  type P2pJoinRequest,
  type P2pMigratingPayload,
  type P2pPromotedPayload,
} from '@/lib/tf2-game/net/p2p/signal';
import { MatchPool, setMatchPool } from '@/lib/tf2-game/server/pool.server';
import { EchoMatchHost } from '@/lib/tf2-game/server/echo-host';
import type { MatchHost, MatchOptions, PlayerInfo } from '@/lib/tf2-game/server/match-host';
import { all, last, makeWorld, until, type FakeSocket } from './helpers';

process.env.LOG_LEVEL = 'silent';

const HOST = { map: 'ctf_2fort', maxPlayers: 8, botCount: 2, botDifficulty: 'normal', name: 'Friends' };
const ROOM = { map: 'ctf_2fort', maxPlayers: 8, botCount: 1, botDifficulty: 'normal', name: 'Public' };

/** An echo host that records what the hub asked of the match. */
class RecordingHost extends EchoMatchHost {
  static last: RecordingHost | null = null;
  readonly added: Array<{ id: number; info: PlayerInfo }> = [];
  readonly levels: string[] = [];
  readonly owners: Array<number | null> = [];
  constructor(o: MatchOptions) {
    super(o);
    RecordingHost.last = this;
  }
  override addPlayer(id: number, info: PlayerInfo): void {
    this.added.push({ id, info });
    super.addPlayer(id, info);
  }
  async changeLevel(map: string): Promise<boolean> {
    this.levels.push(map);
    return true;
  }
  setOwner(id: number | null): void {
    this.owners.push(id);
  }
}

let world: ReturnType<typeof makeWorld>;
let pool: MatchPool;
let nextId = 0;

function connect(data?: Record<string, unknown>): FakeSocket {
  nextId += 1;
  return world.connect(`sock-${nextId}`, data ?? { userId: `user-${nextId}`, userName: `Player ${nextId}` });
}

const errors = (s: FakeSocket) => all<ErrorPayload>(s, TF2_S2C.ERROR).map((e) => e.code);

function host(s: FakeSocket): P2pHostedPayload {
  world.send(s, TF2_C2S.P2P_HOST, HOST);
  const hosted = last<P2pHostedPayload>(s, TF2_S2C.P2P_HOSTED);
  if (!hosted) throw new Error(`not hosted: ${errors(s).join(',')}`);
  return hosted;
}

function joinAdmitted(h: FakeSocket, m: FakeSocket, code: string, extra: Record<string, unknown> = {}): string {
  world.send(m, TF2_C2S.P2P_JOIN, { code, ...extra });
  const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
  world.send(h, TF2_C2S.P2P_ADMIT, { peerId: req.peerId, accept: true });
  expect(last<P2pAdmittedPayload>(m, TF2_S2C.P2P_ADMITTED)?.peerId).toBe(req.peerId);
  return req.peerId;
}

const env = { ...process.env };

beforeEach(() => {
  world = makeWorld(registerTf2GameHandlers, registerTf2P2pHandlers);
  pool = new MatchPool({ workerPath: null, allowInProcess: true, factory: async (o) => new RecordingHost(o) as MatchHost, maxMatches: 3 });
  setMatchPool(pool);
});

afterEach(() => {
  vi.useRealTimers();
  process.env = { ...env };
  resetTf2P2pForTests(world.io);
  resetTf2GameForTests(world.io);
  pool.shutdown();
  setMatchPool(null);
});

describe('host migration (P2P)', () => {
  it('a host that leaves with a successor named hands the match over; the others are asked for again', () => {
    const h = connect({ userId: 'u-host', userName: 'Host' });
    const { code, token } = host(h);
    const a = connect({ userId: 'u-a', userName: 'Alice' });
    const b = connect({ userId: 'u-b', userName: 'Bob' });
    const peerA = joinAdmitted(h, a, code);
    const peerB = joinAdmitted(h, b, code, { canHost: false });
    // Only a member that may host can be named; Bob opted out.
    world.send(h, TF2_C2S.P2P_SUCCESSOR, { peerId: peerB });
    expect(errors(h)).toContain('not-in-room');
    world.send(h, TF2_C2S.P2P_SUCCESSOR, { peerId: peerA });

    world.send(h, TF2_C2S.P2P_CLOSE, { migrate: true });
    const promoted = last<P2pPromotedPayload>(a, TF2_S2C.P2P_PROMOTED)!;
    expect(promoted.previousHost).toBe('Host');
    expect(promoted.hosted).toMatchObject({ code, hostName: 'Alice', hostUserId: 'u-a', resumed: true });
    expect(promoted.hosted.token).not.toBe(token);
    // Bob hears who hosts now, and the new host is asked for him with the hub's account for him.
    expect(last<P2pMigratingPayload>(b, TF2_S2C.P2P_MIGRATING)).toEqual({ code, host: 'Alice' });
    const req = last<P2pJoinRequest>(a, TF2_S2C.P2P_JOIN_REQUEST)!;
    expect(req).toMatchObject({ code, peerId: peerB, userId: 'u-b', name: 'Bob', canHost: false });
    // Alice hosts: she admits Bob, and Bob's signals now go to her.
    world.send(a, TF2_C2S.P2P_ADMIT, { peerId: peerB, accept: true });
    expect(last<P2pAdmittedPayload>(b, TF2_S2C.P2P_ADMITTED)).toMatchObject({ code, host: 'Alice' });
    world.send(b, TF2_C2S.P2P_SIGNAL, { candidate: null });
    expect(last(a, TF2_S2C.P2P_SIGNAL)).toMatchObject({ code, from: peerB });
    // The old host's token is spent: it cannot take the room back.
    world.send(h, TF2_C2S.P2P_HOST, { ...HOST, resume: { code, token } });
    expect(errors(h)).toContain('no-such-room');
  });

  it("a host whose connection drops is replaced after the short grace; members asking meanwhile wait", () => {
    vi.useFakeTimers();
    const h = connect({ userId: 'u-host', userName: 'Host' });
    const { code } = host(h);
    const a = connect({ userId: 'u-a', userName: 'Alice' });
    const b = connect({ userId: 'u-b', userName: 'Bob' });
    const peerA = joinAdmitted(h, a, code);
    joinAdmitted(h, b, code);
    world.send(h, TF2_C2S.P2P_SUCCESSOR, { peerId: peerA });
    handleTf2P2pDisconnect(world.io, h as never);
    world.disconnect(h);
    // Bob's link to the old host died: he asks again — held, not refused.
    world.send(b, TF2_C2S.P2P_JOIN, { code });
    expect(errors(b)).toEqual([]);
    expect(last(a, TF2_S2C.P2P_PROMOTED)).toBeUndefined();
    vi.advanceTimersByTime(P2P_LIMITS.MIGRATE_GRACE_MS + 10);
    expect(last<P2pPromotedPayload>(a, TF2_S2C.P2P_PROMOTED)?.hosted.hostUserId).toBe('u-a');
    expect(last<P2pJoinRequest>(a, TF2_S2C.P2P_JOIN_REQUEST)).toMatchObject({ userId: 'u-b' });
  });

  it('without a successor the room still ends with its host', () => {
    vi.useFakeTimers();
    const h = connect();
    const { code } = host(h);
    const a = connect();
    joinAdmitted(h, a, code);
    handleTf2P2pDisconnect(world.io, h as never);
    vi.advanceTimersByTime(P2P_LIMITS.HOST_GRACE_MS + 10);
    expect(last(a, TF2_S2C.P2P_CLOSED)).toMatchObject({ code, reason: 'host-left' });
  });
});

describe('ICE: TURN before the hub relay, with minted credentials', () => {
  it('hands each account STUN, then TURN with a short-lived credential bound to it (none without TURN)', () => {
    process.env.TURN_URL = 'turn:turn.example.org:3478?transport=udp,turns:turn.example.org:443';
    process.env.TURN_SECRET = 'test-secret';
    const h = connect({ userId: 'u-host', userName: 'Host' });
    const hosted = host(h);
    const turn = hosted.ice!.find((s) => (Array.isArray(s.urls) ? s.urls : [s.urls]).some((u) => u.startsWith('turn')))!;
    const [expiry, user] = turn.username!.split(':');
    expect(user).toBe('u-host');
    expect(Number(expiry) * 1000).toBeGreaterThan(Date.now());
    expect(Number(expiry) * 1000).toBeLessThan(Date.now() + 15 * 60_000);
    expect(turn.credential).toBe(createHmac('sha1', 'test-secret').update(turn.username!).digest('base64'));
    // STUN first, then TURN (the order ICE gathers and pairs them); the hub relay is the client's last resort.
    expect(hosted.ice![0].urls.toString()).toMatch(/^stun:/);
    const a = connect({ userId: 'u-a', userName: 'A' });
    world.send(a, TF2_C2S.P2P_JOIN, { code: hosted.code });
    const req = last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)!;
    world.send(h, TF2_C2S.P2P_ADMIT, { peerId: req.peerId, accept: true });
    const admitted = last<P2pAdmittedPayload>(a, TF2_S2C.P2P_ADMITTED)!;
    expect(admitted.ice!.some((s) => s.username?.endsWith(':u-a'))).toBe(true);

    delete process.env.TURN_URL;
    delete process.env.TURN_SECRET;
    const h2 = connect();
    const plain = host(h2);
    expect(plain.ice!.every((s) => !s.username && !s.credential)).toBe(true);
  });
});

describe("a P2P host's door", () => {
  it('lock and password keep new accounts out; a member who played here comes back', () => {
    const h = connect({ userId: 'u-host', userName: 'Host' });
    const { code } = host(h);
    const a = connect({ userId: 'u-a', userName: 'A' });
    joinAdmitted(h, a, code);
    world.send(h, TF2_C2S.ROOM_ADMIN, { action: 'password', password: 'hunter2' });
    const n = connect({ userId: 'u-new', userName: 'New' });
    world.send(n, TF2_C2S.P2P_JOIN, { code });
    world.send(n, TF2_C2S.P2P_JOIN, { code, password: 'wrong' });
    expect(errors(n)).toEqual(['password', 'password']);
    world.send(n, TF2_C2S.P2P_JOIN, { code, password: 'hunter2' });
    expect(last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)?.userId).toBe('u-new');
    world.send(h, TF2_C2S.ROOM_ADMIN, { action: 'lock', locked: true });
    const late = connect({ userId: 'u-late', userName: 'Late' });
    world.send(late, TF2_C2S.P2P_JOIN, { code, password: 'hunter2' });
    expect(errors(late)).toEqual(['locked']);
    // A's rejoin (its link dropped) is not a new account.
    const a2 = connect({ userId: 'u-a', userName: 'A' });
    world.send(a2, TF2_C2S.P2P_JOIN, { code });
    expect(errors(a2)).toEqual([]);
    // The spectator choice rides the join request.
    const spec = connect({ userId: 'u-a', userName: 'A' });
    world.send(spec, TF2_C2S.P2P_JOIN, { code, spectate: true });
    expect(last<P2pJoinRequest>(h, TF2_S2C.P2P_JOIN_REQUEST)?.spectate).toBe(true);
  });
});

describe('dedicated rooms: the owner', () => {
  async function room(owner: FakeSocket): Promise<string> {
    world.send(owner, TF2_C2S.CREATE_ROOM, ROOM);
    await until(() => !!last<JoinedPayload>(owner, TF2_S2C.JOINED), 2_000, 'joined');
    return last<JoinedPayload>(owner, TF2_S2C.JOINED)!.code;
  }

  it('the creator owns the room and administers it; nobody else may', async () => {
    const o = connect({ userId: 'u-owner', userName: 'Owner' });
    const code = await room(o);
    const info = last<RoomInfoPayload>(o, TF2_S2C.ROOM_INFO)!;
    expect(info).toMatchObject({ code, ownerName: 'Owner', locked: false, passworded: false });
    const match = RecordingHost.last!;
    await until(() => match.owners.length > 0, 2_000, 'owner set in the match');
    expect(match.owners.at(-1)).toBe(info.ownerId);

    const p = connect({ userId: 'u-p', userName: 'Pat' });
    world.send(p, TF2_C2S.JOIN_ROOM, { code, spectate: true });
    await until(() => match.added.length === 2, 2_000, 'second player');
    expect(match.added[1].info).toMatchObject({ name: 'Pat', spectate: true });
    // Not the owner: refused.
    world.send(p, TF2_C2S.ROOM_ADMIN, { action: 'lock', locked: true });
    expect(errors(p)).toEqual(['not-owner']);

    // The owner's actions.
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'changelevel', map: 'not_a_map' });
    expect(errors(o)).toEqual(['unknown-map']);
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'changelevel', map: 'cp_dustbowl' });
    await until(() => match.levels.length === 1, 2_000, 'level change');
    expect(match.levels).toEqual(['cp_dustbowl']);
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'say', text: 'gg\u0007 all' });
    expect(last<ChatMessage>(p, TF2_S2C.CHAT)).toMatchObject({ from: 0, name: 'Console', text: 'gg all' });
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'password', password: 'pw' });
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'lock', locked: true });
    expect(last<RoomInfoPayload>(p, TF2_S2C.ROOM_INFO)).toMatchObject({ locked: true, passworded: true });
    const n = connect({ userId: 'u-n', userName: 'N' });
    world.send(n, TF2_C2S.JOIN_ROOM, { code, password: 'pw' });
    expect(errors(n)).toEqual(['locked']);
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'lock', locked: false });
    world.send(n, TF2_C2S.JOIN_ROOM, { code });
    expect(errors(n)).toEqual(['locked', 'password']);

    // Kick: out, and refused for the room's life.
    const patId = last<JoinedPayload>(p, TF2_S2C.JOINED)!.playerId;
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'kick', playerId: patId });
    expect(last<KickedPayload>(p, TF2_S2C.KICKED)).toEqual({ code, reason: 'kicked' });
    world.send(p, TF2_C2S.JOIN_ROOM, { code, password: 'pw' });
    expect(errors(p)).toContain('kicked');
  });

  it('hands ownership on, and the oldest signed-in player inherits it when the owner leaves', async () => {
    const o = connect({ userId: 'u-owner', userName: 'Owner' });
    const code = await room(o);
    const a = connect({ userId: 'u-a', userName: 'A' });
    const b = connect({ userId: 'u-b', userName: 'B' });
    world.send(a, TF2_C2S.JOIN_ROOM, { code });
    world.send(b, TF2_C2S.JOIN_ROOM, { code });
    const aId = last<JoinedPayload>(a, TF2_S2C.JOINED)!.playerId;
    const bId = last<JoinedPayload>(b, TF2_S2C.JOINED)!.playerId;
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'transfer', playerId: bId });
    expect(last<RoomInfoPayload>(a, TF2_S2C.ROOM_INFO)?.ownerId).toBe(bId);
    // The old owner is now an ordinary player.
    world.send(o, TF2_C2S.ROOM_ADMIN, { action: 'lock', locked: true });
    expect(errors(o)).toEqual(['not-owner']);
    // B leaves: the oldest remaining signed-in player (the creator, here again an ordinary player) inherits.
    handleTf2GameDisconnect(world.io, b as never);
    const after = last<RoomInfoPayload>(a, TF2_S2C.ROOM_INFO)!;
    const oId = last<JoinedPayload>(o, TF2_S2C.JOINED)!.playerId;
    expect(after.ownerId).toBe(Math.min(oId, aId));
  });
});
