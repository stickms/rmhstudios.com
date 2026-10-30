/**
 * Balatro signalling, relay and seat directory on the hub
 * (handlers/balatro-p2p.ts over p2p/signal-hub.ts and ./directory.ts), against
 * the fake socket.io world: host/join/admit/signal flows, every rejection
 * code, kicks, seats, forfeits, spectators, relay budgets, host grace and
 * promotion, resume and hub-restart reclaim, payload fuzz, and that every
 * payload the hub emits parses with the frozen S2C schemas.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBalatroP2pDisconnect, registerBalatroP2pHandlers, resetBalatroP2pForTests } from '../handlers/balatro-p2p';
import { registerBalatroQueueHandlers, resetBalatroQueueForTests } from '../handlers/balatro-queue';
import { balatroHub } from './directory';
import { all, last, makeWorld, type FakeSocket } from '../test-support/fake-world';
import { BALATRO_S2C, type BalatroS2CPayload } from '@/lib/balatro/net/events';
import { BALATRO_LIMITS, BALATRO_RELAY_LIMITS } from '@/lib/balatro/net/limits';
import { decodeRelay, encodeRelay, relaySlotOf } from '@/lib/shared/p2p/relay';
import { PROTOCOL_ERROR_EVENT } from '@/lib/shared/realtime/contract';

process.env.LOG_LEVEL = 'silent';

const HASH = `${'a'.repeat(24)}-v1`;
const OTHER_HASH = `${'b'.repeat(24)}-v1`;
const HOST = { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 4, contentHash: HASH, spectatable: true };
const OFFER = { type: 'offer', sdp: 'v=0' };
const CAND = { candidate: 'candidate:1 1 udp 1 10.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 };

type S2C = { [K in keyof typeof BALATRO_S2C]: BalatroS2CPayload<K> };

let world: ReturnType<typeof makeWorld>;
let nextId = 0;

function connect(data?: Record<string, unknown>): FakeSocket {
  nextId += 1;
  return world.connect(`bsock-${nextId}`, data ?? { userId: `user-${nextId}`, userName: `Player ${nextId}`, avatarUrl: null });
}

function disconnect(s: FakeSocket): void {
  handleBalatroP2pDisconnect(world.io, s as never);
  world.disconnect(s);
}

const errors = (s: FakeSocket) => all<S2C['balatro:p2p:error']>(s, 'balatro:p2p:error').map((e) => e.code);
const lastOf = <K extends keyof S2C>(s: FakeSocket, e: K) => last<S2C[K]>(s, e);
const allOf = <K extends keyof S2C>(s: FakeSocket, e: K) => all<S2C[K]>(s, e);

function host(s: FakeSocket, over: Record<string, unknown> = {}): S2C['balatro:p2p:hosted'] {
  world.send(s, 'balatro:p2p:host', { ...HOST, ...over });
  const hosted = lastOf(s, 'balatro:p2p:hosted');
  if (!hosted) throw new Error(`not hosted: ${errors(s).join(',')}`);
  return hosted;
}

function join(m: FakeSocket, code: string, over: Record<string, unknown> = {}) {
  world.send(m, 'balatro:p2p:join', { code, contentHash: HASH, ...over });
}

/** Join and get admitted; returns the member's peer id. */
function joinAdmitted(h: FakeSocket, m: FakeSocket, code: string, over: Record<string, unknown> = {}): string {
  join(m, code, over);
  const req = lastOf(h, 'balatro:p2p:join-request');
  if (!req) throw new Error(`no join request: ${errors(m).join(',')}`);
  world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
  expect(lastOf(m, 'balatro:p2p:admitted')?.code).toBe(code);
  return req.peerId;
}

function state(h: FakeSocket, over: Record<string, unknown> = {}) {
  world.send(h, 'balatro:p2p:state', {
    open: true,
    started: false,
    runId: null,
    members: [],
    successor: null,
    spectatable: true,
    summary: { players: 1, ante: null },
    ...over,
  });
}

beforeEach(() => {
  world = makeWorld(registerBalatroP2pHandlers, registerBalatroQueueHandlers);
});

afterEach(() => {
  // Every payload the hub sent parses with the frozen S2C contract (a browser would drop it otherwise).
  for (const s of world.sockets.values()) {
    for (const r of s.received) {
      const schema = (BALATRO_S2C as Record<string, { safeParse(v: unknown): { success: boolean } }>)[r.event];
      if (schema) expect(schema.safeParse(r.payload).success, `${r.event} ${JSON.stringify(r.payload)}`).toBe(true);
    }
  }
  vi.useRealTimers();
  resetBalatroP2pForTests();
  resetBalatroQueueForTests();
});

describe('hosting and joining', () => {
  it('hosts with a code, token, peer id and ICE; vouches for the joiner', () => {
    const h = connect({ userId: 'u-host', userName: 'Jimbo', avatarUrl: 'https://cdn.example/a.png' });
    const hosted = host(h);
    expect(hosted.code).toMatch(BALATRO_LIMITS.CODE_RE);
    expect(hosted.token).toHaveLength(24);
    expect(hosted.peerId).toHaveLength(12);
    expect(hosted.ice.length).toBeGreaterThan(0);
    const m = connect({ userId: 'u-m', userName: '<b>Mime</b>', avatarUrl: 'https://cdn.example/m.png' });
    join(m, hosted.code, { userId: 'u-host', name: 'Jimbo' });
    const joining = lastOf(m, 'balatro:p2p:joining')!;
    expect(joining).toMatchObject({ code: hosted.code, hostUserId: 'u-host' });
    const req = lastOf(h, 'balatro:p2p:join-request')!;
    expect(req).toEqual({
      peerId: joining.peerId,
      userId: 'u-m',
      name: 'bMime/b',
      avatarUrl: 'https://cdn.example/m.png',
      role: 'player',
      rejoin: false,
    });
    expect(relaySlotOf(req.peerId)).toBeGreaterThan(0);
    world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
    expect(lastOf(m, 'balatro:p2p:admitted')).toMatchObject({ code: hosted.code, hostPeerId: hosted.peerId });
  });

  it('refuses unknown codes, version mismatches, the host itself, full rooms and room-limit', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 2 });
    const a = connect();
    join(a, 'ZZZZZZ');
    join(a, code, { contentHash: OTHER_HASH });
    expect(errors(a)).toEqual(['not-found', 'version-mismatch']);
    const self = connect({ userId: (h.data as { userId: string }).userId, userName: 'x' });
    join(self, code);
    expect(errors(self)).toEqual(['invalid']);
    joinAdmitted(h, a, code);
    const b = connect();
    join(b, code);
    expect(errors(b)).toEqual(['full']);
    // A host-closed door is full to newcomers.
    const h2 = connect();
    const two = host(h2);
    state(h2, { open: false });
    const c = connect();
    join(c, two.code);
    expect(errors(c)).toEqual(['full']);
  });

  it('refuses newcomers once started but lets seated players rejoin with rejoin:true', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect({ userId: 'u-seat', userName: 'Seat' });
    joinAdmitted(h, m, code);
    state(h, { started: true, runId: 'run1', members: ['u-seat'] });
    const late = connect();
    join(late, code);
    expect(errors(late)).toEqual(['started']);
    disconnect(m);
    expect(lastOf(h, 'balatro:p2p:member-away')).toMatchObject({ away: true });
    const back = connect({ userId: 'u-seat', userName: 'Seat' });
    join(back, code);
    expect(errors(back)).toEqual([]);
    expect(lastOf(h, 'balatro:p2p:join-request')).toMatchObject({ userId: 'u-seat', rejoin: true });
  });

  it('keeps one seat per account across rooms (seat-held + heldCode), and seat:query reports it', () => {
    const h1 = connect();
    const r1 = host(h1);
    const h2 = connect();
    const r2 = host(h2);
    const m = connect({ userId: 'u-one', userName: 'One' });
    joinAdmitted(h1, m, r1.code);
    const tab = connect({ userId: 'u-one', userName: 'One' });
    join(tab, r2.code);
    expect(all<S2C['balatro:p2p:error']>(tab, 'balatro:p2p:error')).toEqual([
      { event: 'balatro:p2p:join', code: 'seat-held', heldCode: r1.code },
    ]);
    world.send(tab, 'balatro:p2p:host', HOST);
    expect(lastOf(tab, 'balatro:p2p:error')).toMatchObject({ code: 'seat-held', heldCode: r1.code });
    state(h1, { started: true, runId: 'r-9' });
    world.send(tab, 'balatro:seat:query', {});
    expect(lastOf(tab, 'balatro:seat')).toEqual({ code: r1.code, hostOnline: true, runId: 'r-9', started: true });
    // "Seat held" → Leave from the other tab releases it; the host is told with the old peer id.
    world.send(tab, 'balatro:p2p:leave', {});
    expect(lastOf(h1, 'balatro:p2p:member-left')).toMatchObject({ userId: 'u-one', reason: 'left' });
    world.send(tab, 'balatro:seat:query', {});
    expect(lastOf(tab, 'balatro:seat')).toEqual({ code: null, hostOnline: false, runId: null, started: false });
    join(tab, r2.code);
    expect(lastOf(h2, 'balatro:p2p:join-request')?.userId).toBe('u-one');
  });

  it('a second pending join elsewhere withdraws the first; a second tab in the same room replaces the first', () => {
    const h1 = connect();
    const r1 = host(h1);
    const h2 = connect();
    const r2 = host(h2);
    const m = connect({ userId: 'u-two', userName: 'Two' });
    join(m, r1.code);
    const firstPeer = lastOf(h1, 'balatro:p2p:join-request')!.peerId;
    join(m, r2.code);
    expect(lastOf(h1, 'balatro:p2p:member-left')).toEqual({ peerId: firstPeer, userId: 'u-two', reason: 'left' });
    const tab = connect({ userId: 'u-two', userName: 'Two' });
    join(tab, r2.code);
    expect([...balatroHub.room(r2.code)!.members.values()].map((x) => x.socketId)).toEqual([tab.id]);
  });

  it('refuses the host’s refusal reasons through `rejected`, and frees nothing it should keep', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    join(m, code);
    const req = lastOf(h, 'balatro:p2p:join-request')!;
    world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: false, reason: 'version-mismatch' });
    expect(lastOf(m, 'balatro:p2p:rejected')).toEqual({ code, reason: 'version-mismatch' });
    world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
    expect(errors(h)).toEqual(['not-found']);
    const m2 = connect();
    join(m2, code);
    world.send(h, 'balatro:p2p:admit', { peerId: lastOf(h, 'balatro:p2p:join-request')!.peerId, accept: false });
    expect(lastOf(m2, 'balatro:p2p:rejected')).toEqual({ code, reason: 'host-refused' });
  });

  it('host-only events from a member are not-host', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(m, 'balatro:p2p:admit', { peerId: peer, accept: true });
    world.send(m, 'balatro:p2p:kick', { peerId: peer });
    world.send(m, 'balatro:p2p:state', { open: true, started: false, runId: null, members: [], successor: null, spectatable: false, summary: { players: 1, ante: null } });
    world.send(m, 'balatro:p2p:forfeit-seat', { userId: 'x', runId: 'y' });
    world.send(m, 'balatro:p2p:close', {});
    expect(errors(m)).toEqual(['not-host', 'not-host', 'not-host', 'not-host', 'not-host']);
  });
});

describe('kick, leave, close, forfeit', () => {
  it('kicks for good: the member is told, the host is told, rejoining is refused', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect({ userId: 'u-k', userName: 'K' });
    const peer = joinAdmitted(h, m, code);
    world.send(h, 'balatro:p2p:kick', { peerId: peer });
    expect(lastOf(m, 'balatro:p2p:rejected')).toEqual({ code, reason: 'kicked' });
    expect(lastOf(h, 'balatro:p2p:member-left')).toEqual({ peerId: peer, userId: 'u-k', reason: 'kicked' });
    const again = connect({ userId: 'u-k', userName: 'K' });
    join(again, code);
    expect(errors(again)).toEqual(['kicked']);
    world.send(again, 'balatro:seat:query', {});
    expect(lastOf(again, 'balatro:seat')?.code).toBeNull();
    // Kicking an unknown peer or the host itself is refused.
    world.send(h, 'balatro:p2p:kick', { peerId: 'nobodyhere01' });
    world.send(h, 'balatro:p2p:kick', { peerId: lastOf(h, 'balatro:p2p:hosted')!.peerId });
    expect(errors(h)).toEqual(['not-found', 'invalid']);
  });

  it('kicks a player whose socket is gone (by its last peer id)', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect({ userId: 'u-gone', userName: 'G' });
    const peer = joinAdmitted(h, m, code);
    disconnect(m);
    world.send(h, 'balatro:p2p:kick', { peerId: peer });
    expect(lastOf(h, 'balatro:p2p:member-left')).toMatchObject({ userId: 'u-gone', reason: 'kicked' });
    const back = connect({ userId: 'u-gone', userName: 'G' });
    join(back, code);
    expect(errors(back)).toEqual(['kicked']);
  });

  it('forfeits a seat for the run: rejoin refused while that run lasts', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect({ userId: 'u-f', userName: 'F' });
    joinAdmitted(h, m, code);
    state(h, { started: true, runId: 'run-A', members: ['u-f'] });
    disconnect(m);
    world.send(h, 'balatro:p2p:forfeit-seat', { userId: 'u-f', runId: 'run-A' });
    const back = connect({ userId: 'u-f', userName: 'F' });
    join(back, code);
    expect(errors(back)).toEqual(['forfeited']);
    world.send(back, 'balatro:seat:query', {});
    expect(lastOf(back, 'balatro:seat')?.code).toBeNull();
    // A new run in the same lobby (Return to Lobby) lets them back as a newcomer.
    state(h, { started: false, runId: 'run-B' });
    join(back, code);
    expect(lastOf(h, 'balatro:p2p:join-request')).toMatchObject({ userId: 'u-f', rejoin: false });
  });

  it('member leave tells the host; close tells every member and frees every seat', () => {
    const h = connect();
    const { code } = host(h);
    const a = connect();
    const b = connect({ userId: 'u-b', userName: 'B' });
    const pa = joinAdmitted(h, a, code);
    joinAdmitted(h, b, code);
    world.send(a, 'balatro:p2p:leave', {});
    expect(lastOf(h, 'balatro:p2p:member-left')).toEqual({ peerId: pa, userId: (a.data as { userId: string }).userId, reason: 'left' });
    world.send(h, 'balatro:p2p:close', {});
    expect(lastOf(b, 'balatro:p2p:closed')).toEqual({ code, reason: 'host-closed' });
    expect(balatroHub.room(code)).toBeNull();
    world.send(b, 'balatro:seat:query', {});
    expect(lastOf(b, 'balatro:seat')?.code).toBeNull();
    // The host is free to host again.
    host(h);
  });

  it('a pending member that disconnects is reported as disconnected', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    join(m, code);
    const peer = lastOf(m, 'balatro:p2p:joining')!.peerId;
    disconnect(m);
    expect(lastOf(h, 'balatro:p2p:member-left')).toMatchObject({ peerId: peer, reason: 'disconnected' });
  });
});

describe('spectators', () => {
  it('admits spectators past started, caps them at 8, refuses them on non-spectatable rooms', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 2 });
    state(h, { started: true, runId: 'r' });
    const specs = Array.from({ length: BALATRO_LIMITS.MAX_SPECTATORS }, () => connect());
    for (const s of specs) {
      join(s, code, { role: 'spectator' });
      expect(errors(s)).toEqual([]);
    }
    expect(lastOf(h, 'balatro:p2p:join-request')?.role).toBe('spectator');
    const ninth = connect();
    join(ninth, code, { role: 'spectator' });
    expect(errors(ninth)).toEqual(['full']);
    // A spectator that leaves frees its place.
    disconnect(specs[0]);
    join(ninth, code, { role: 'spectator' });
    expect(errors(ninth)).toEqual(['full']);
    expect(lastOf(ninth, 'balatro:p2p:joining')?.code).toBe(code);
    const h2 = connect();
    const closed = host(h2, { spectatable: false });
    const s = connect();
    join(s, closed.code, { role: 'spectator' });
    expect(errors(s)).toEqual(['invalid']);
  });

  it('never promotes a spectator', () => {
    vi.useFakeTimers();
    const h = connect();
    const { code } = host(h);
    const s = connect();
    joinAdmitted(h, s, code, { role: 'spectator' });
    disconnect(h);
    vi.advanceTimersByTime(BALATRO_LIMITS.MIGRATE_GRACE_MS + 10);
    expect(lastOf(s, 'balatro:p2p:promote')).toBeUndefined();
    vi.advanceTimersByTime(BALATRO_LIMITS.HOST_GRACE_MS);
    expect(lastOf(s, 'balatro:p2p:closed')).toEqual({ code, reason: 'host-lost' });
  });
});

describe('signals', () => {
  it('routes host ↔ admitted member only, with the sender’s peer id', () => {
    const h = connect();
    const hosted = host(h);
    const a = connect();
    const b = connect();
    const pa = joinAdmitted(h, a, hosted.code);
    join(b, hosted.code);
    const pb = lastOf(h, 'balatro:p2p:join-request')!.peerId;
    world.send(h, 'balatro:p2p:signal', { to: pa, description: OFFER });
    expect(lastOf(a, 'balatro:p2p:signal')).toEqual({ from: hosted.peerId, description: OFFER });
    world.send(a, 'balatro:p2p:signal', { candidate: CAND });
    expect(lastOf(h, 'balatro:p2p:signal')).toEqual({ from: pa, candidate: CAND });
    world.send(a, 'balatro:p2p:signal', { to: hosted.peerId, candidate: CAND });
    expect(allOf(h, 'balatro:p2p:signal')).toHaveLength(2);
    // Not to a pending member, not member → member, not without a room.
    world.send(h, 'balatro:p2p:signal', { to: pb, description: OFFER });
    world.send(h, 'balatro:p2p:signal', { description: OFFER });
    world.send(a, 'balatro:p2p:signal', { to: pb, description: OFFER });
    world.send(b, 'balatro:p2p:signal', { description: OFFER });
    const loner = connect();
    world.send(loner, 'balatro:p2p:signal', { description: OFFER });
    expect(errors(h)).toEqual(['invalid', 'invalid']);
    expect(errors(a)).toEqual(['invalid']);
    expect(errors(b)).toEqual(['invalid']);
    expect(errors(loner)).toEqual(['not-found']);
    expect(allOf(b, 'balatro:p2p:signal')).toEqual([]);
  });
});

describe('relay', () => {
  function relayed() {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(m, 'balatro:p2p:relay:start', {});
    return { h, m, code, peer, slot: relaySlotOf(peer)! };
  }
  const frames = (s: FakeSocket) => all<Uint8Array>(s, 'balatro:p2p:relay').map((b) => decodeRelay(b)!);

  it('carries frames both ways, re-stamping the member’s slot; only after relay:start', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    const slot = relaySlotOf(peer)!;
    world.send(m, 'balatro:p2p:relay', encodeRelay(0, true, new Uint8Array([1])));
    expect(frames(h)).toEqual([]);
    world.send(m, 'balatro:p2p:relay:start', {});
    world.send(h, 'balatro:p2p:relay:start', {});
    expect(errors(h)).toEqual([]);
    world.send(m, 'balatro:p2p:relay', encodeRelay(99, true, new Uint8Array([1, 2])));
    expect(frames(h)).toEqual([{ slot, reliable: true, payload: new Uint8Array([1, 2]) }]);
    world.send(h, 'balatro:p2p:relay', encodeRelay(slot, false, new Uint8Array([3])));
    expect(frames(m)).toEqual([{ slot, reliable: false, payload: new Uint8Array([3]) }]);
    expect(m.received.filter((r) => r.event === 'balatro:p2p:relay').map((r) => r.volatile)).toEqual([true]);
    // A frame for an empty slot, a bad header, an oversize unreliable payload: dropped.
    world.send(h, 'balatro:p2p:relay', encodeRelay(slot === 1 ? 2 : 1, true, new Uint8Array([3])));
    world.send(h, 'balatro:p2p:relay', new Uint8Array([4, slot, 1]));
    world.send(h, 'balatro:p2p:relay', encodeRelay(slot, false, new Uint8Array(1_400)));
    expect(frames(m)).toHaveLength(1);
  });

  it('refuses relay:start before admission and caps relayed members per room', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 16 });
    const pending = connect();
    join(pending, code, { role: 'spectator' });
    world.send(pending, 'balatro:p2p:relay:start', {});
    expect(errors(pending)).toEqual(['invalid']);
    const lone = connect();
    world.send(lone, 'balatro:p2p:relay:start', {});
    expect(errors(lone)).toEqual(['not-found']);
    world.send(h, 'balatro:p2p:admit', { peerId: lastOf(h, 'balatro:p2p:join-request')!.peerId, accept: true });
    const players = Array.from({ length: BALATRO_RELAY_LIMITS.MAX_PEERS_PER_ROOM }, () => connect());
    for (const m of players) {
      joinAdmitted(h, m, code);
      world.send(m, 'balatro:p2p:relay:start', {});
      world.send(m, 'balatro:p2p:relay:start', {}); // idempotent
      expect(errors(m)).toEqual([]);
    }
    world.send(pending, 'balatro:p2p:relay:start', {});
    expect(errors(pending)).toEqual(['invalid', 'full']);
    // A relayed member leaving frees its place.
    world.send(players[0], 'balatro:p2p:leave', {});
    world.send(pending, 'balatro:p2p:relay:start', {});
    expect(errors(pending)).toEqual(['invalid', 'full']);
  });

  it('drops unreliable frames past the byte budget and cuts a reliable overflow off the relay', () => {
    vi.useFakeTimers();
    const { h, m, slot } = relayed();
    const ping = encodeRelay(slot, false, new Uint8Array(1_000));
    for (let i = 0; i < 80; i++) world.send(m, 'balatro:p2p:relay', ping);
    // 64 KB burst: at most 65 of the 1000-byte pings get through, the rest drop.
    const through = frames(h).length;
    expect(through).toBeGreaterThan(50);
    expect(through).toBeLessThanOrEqual(65);
    expect(errors(m)).toEqual([]);
    // Refills at 8 KB/s.
    vi.advanceTimersByTime(1_000);
    for (let i = 0; i < 20; i++) world.send(m, 'balatro:p2p:relay', ping);
    expect(frames(h).length - through).toBeGreaterThanOrEqual(8);
    expect(frames(h).length - through).toBeLessThanOrEqual(9);
    // Reliable frames run a debt up to 1 MiB, then the member is cut off with rate-limited.
    const big = encodeRelay(slot, true, new Uint8Array(16 * 1024));
    let n = 0;
    while (errors(m).length === 0 && n < 200) {
      world.send(m, 'balatro:p2p:relay', big);
      n += 1;
    }
    expect(errors(m)).toEqual(['rate-limited']);
    expect(n).toBeGreaterThan(60);
    const before = frames(h).length;
    world.send(m, 'balatro:p2p:relay', big);
    expect(frames(h).length).toBe(before);
  });
});

describe('host grace, promotion, resume', () => {
  function lobby() {
    const h = connect({ userId: 'u-h', userName: 'Host' });
    const hosted = host(h);
    const a = connect({ userId: 'u-a', userName: 'A' });
    const b = connect({ userId: 'u-b', userName: 'B' });
    const pa = joinAdmitted(h, a, hosted.code);
    const pb = joinAdmitted(h, b, hosted.code);
    return { h, a, b, pa, pb, hosted };
  }

  it('promotes the named successor after the 2 s grace and re-admits the rest through it', () => {
    vi.useFakeTimers();
    const { h, a, b, pb, hosted } = lobby();
    state(h, { successor: pb, members: ['u-h', 'u-a', 'u-b'] });
    disconnect(h);
    vi.advanceTimersByTime(BALATRO_LIMITS.MIGRATE_GRACE_MS - 100);
    expect(lastOf(b, 'balatro:p2p:promote')).toBeUndefined();
    vi.advanceTimersByTime(200);
    const promote = lastOf(b, 'balatro:p2p:promote')!;
    expect(promote.code).toBe(hosted.code);
    expect(promote.token).not.toBe(hosted.token);
    expect(lastOf(a, 'balatro:p2p:host-changed')).toEqual({ code: hosted.code, hostPeerId: pb, hostUserId: 'u-b' });
    expect(lastOf(b, 'balatro:p2p:join-request')).toMatchObject({ userId: 'u-a', rejoin: true });
    // The new host admits A again; signals now flow B ↔ A.
    world.send(b, 'balatro:p2p:admit', { peerId: lastOf(b, 'balatro:p2p:join-request')!.peerId, accept: true });
    world.send(a, 'balatro:p2p:signal', { candidate: CAND });
    expect(lastOf(b, 'balatro:p2p:signal')?.candidate).toEqual(CAND);
    // The old host cannot resume with its old token; it can rejoin as a seated player.
    const back = connect({ userId: 'u-h', userName: 'Host' });
    world.send(back, 'balatro:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(errors(back)).toEqual(['not-host']);
    join(back, hosted.code);
    expect(lastOf(b, 'balatro:p2p:join-request')).toMatchObject({ userId: 'u-h', rejoin: true });
  });

  it('falls back to the earliest-joined connected player when no successor is named', () => {
    vi.useFakeTimers();
    const { h, a, b, pa } = lobby();
    disconnect(h);
    vi.advanceTimersByTime(BALATRO_LIMITS.MIGRATE_GRACE_MS + 1);
    expect(lastOf(a, 'balatro:p2p:promote')).toBeDefined();
    expect(lastOf(b, 'balatro:p2p:host-changed')?.hostPeerId).toBe(pa);
  });

  it('a host that resumes within the grace keeps its room; pending joins are re-sent', () => {
    vi.useFakeTimers();
    const { h, a, hosted } = lobby();
    disconnect(h);
    const late = connect();
    join(late, hosted.code);
    vi.advanceTimersByTime(1_000);
    const h2 = connect({ userId: 'u-h', userName: 'Host' });
    world.send(h2, 'balatro:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(lastOf(h2, 'balatro:p2p:hosted')).toMatchObject({ code: hosted.code, token: hosted.token, peerId: hosted.peerId });
    expect(lastOf(h2, 'balatro:p2p:join-request')?.userId).toBe((late.data as { userId: string }).userId);
    vi.advanceTimersByTime(BALATRO_LIMITS.HOST_GRACE_MS * 2);
    expect(lastOf(a, 'balatro:p2p:promote')).toBeUndefined();
    expect(lastOf(a, 'balatro:p2p:closed')).toBeUndefined();
    // A wrong token, another account, or a different build are refused.
    const thief = connect();
    world.send(thief, 'balatro:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    world.send(h2, 'balatro:p2p:host', { ...HOST, resume: { code: hosted.code, token: 'x'.repeat(24) } });
    world.send(h2, 'balatro:p2p:host', { ...HOST, contentHash: OTHER_HASH, resume: { code: hosted.code, token: hosted.token } });
    expect(errors(thief)).toEqual(['not-host']);
    expect(errors(h2)).toEqual(['not-host', 'version-mismatch']);
  });

  it('a deliberate host leave promotes at once; with nobody to promote it closes', () => {
    const { h, b, pa } = lobby();
    world.send(h, 'balatro:p2p:leave', {});
    expect(lastOf(b, 'balatro:p2p:host-changed')?.hostPeerId).toBe(pa);
    const solo = connect();
    const r = host(solo);
    const s = connect();
    joinAdmitted(solo, s, r.code, { role: 'spectator' });
    world.send(solo, 'balatro:p2p:leave', {});
    expect(lastOf(s, 'balatro:p2p:closed')).toEqual({ code: r.code, reason: 'host-closed' });
  });

  it('closes host-lost after 30 s when the successor is gone too', () => {
    vi.useFakeTimers();
    const { h, a, b, hosted } = lobby();
    disconnect(a);
    disconnect(b);
    disconnect(h);
    vi.advanceTimersByTime(BALATRO_LIMITS.HOST_GRACE_MS - 10);
    expect(balatroHub.room(hosted.code)).not.toBeNull();
    vi.advanceTimersByTime(20);
    expect(balatroHub.room(hosted.code)).toBeNull();
  });

  it('re-claims a code after a hub restart and takes the seats from the host’s first state', () => {
    const { h, hosted } = lobby();
    resetBalatroP2pForTests();
    world = makeWorld(registerBalatroP2pHandlers, registerBalatroQueueHandlers);
    const h2 = connect({ userId: 'u-h', userName: 'Host' });
    world.send(h2, 'balatro:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(lastOf(h2, 'balatro:p2p:hosted')).toMatchObject({ code: hosted.code, token: hosted.token });
    state(h2, { started: true, runId: 'run-x', members: ['u-h', 'u-a', 'u-b'] });
    const a2 = connect({ userId: 'u-a', userName: 'A' });
    join(a2, hosted.code);
    expect(lastOf(h2, 'balatro:p2p:join-request')).toMatchObject({ userId: 'u-a', rejoin: true });
    const stranger = connect();
    join(stranger, hosted.code);
    expect(errors(stranger)).toEqual(['started']);
    // Only the first state re-declares seats.
    state(h2, { started: true, runId: 'run-x', members: ['u-h', 'u-a', 'u-b', 'u-z'] });
    const z = connect({ userId: 'u-z', userName: 'Z' });
    join(z, hosted.code);
    expect(errors(z)).toEqual(['started']);
    void h;
  });
});

describe('payload fuzz and the directory', () => {
  it('hangs up on payloads no honest client sends', () => {
    const cases: Array<[string, unknown]> = [
      ['balatro:p2p:host', { ...HOST, maxPlayers: 99 }],
      ['balatro:p2p:join', { code: 'abc', contentHash: HASH }],
      ['balatro:p2p:join', { code: 'ABCDEF', contentHash: 'nope' }],
      ['balatro:p2p:signal', { description: OFFER, candidate: CAND }],
      ['balatro:p2p:signal', {}],
      ['balatro:p2p:signal', { description: { type: 'offer', sdp: 'x'.repeat(20_000) } }],
      ['balatro:p2p:relay', 'not bytes'],
      ['balatro:p2p:relay', new Uint8Array(BALATRO_RELAY_LIMITS.MAX_PACKET_BYTES + 1)],
      ['balatro:p2p:state', { open: true }],
      ['balatro:p2p:kick', { peerId: 'short' }],
      ['balatro:p2p:admit', null],
    ];
    for (const [event, payload] of cases) {
      const s = connect();
      world.send(s, event, payload);
      expect(s.disconnected, event).toBe(true);
      expect(lastOf(s, PROTOCOL_ERROR_EVENT as never)).toMatchObject({ event, reason: 'invalid_payload' });
    }
  });

  it('lists spectatable lobbies whose host is connected, with the host’s summary', () => {
    const h1 = connect();
    const r1 = host(h1, { queueMode: 'pvp_royale' });
    state(h1, { started: true, runId: 'r', summary: { players: 5, ante: 3 } });
    const h2 = connect();
    host(h2, { spectatable: false });
    const h3 = connect();
    const r3 = host(h3);
    const h4 = connect();
    host(h4);
    disconnect(h4);
    const viewer = connect();
    world.send(viewer, 'balatro:spectate:list', {});
    const lobbies = lastOf(viewer, 'balatro:spectate:lobbies')!.lobbies;
    expect(lobbies.map((l) => l.code).sort()).toEqual([r1.code, r3.code].sort());
    expect(lobbies.find((l) => l.code === r1.code)).toEqual({ code: r1.code, queueMode: 'pvp_royale', players: 5, ante: 3 });
    // The host can hide its lobby again.
    state(h1, { spectatable: false });
    world.send(viewer, 'balatro:spectate:list', {});
    expect(lastOf(viewer, 'balatro:spectate:lobbies')!.lobbies.map((l) => l.code)).toEqual([r3.code]);
  });

});
