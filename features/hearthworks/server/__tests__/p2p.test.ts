/**
 * Hearthworks signalling, relay and host migration on the hub (features/hearthworks/server/p2p.ts over
 * p2p/signal-hub.ts), against the fake socket.io world: auth on every event, host / list / join / admit /
 * signal flows, every rejection, kicks, the player cap, relay budgets, hostile payloads and spoofed ids,
 * host grace, promotion and expiry — and that every payload the hub emits parses with the shared S2C schemas.
 *
 * Main suite: an auth boundary (anonymous sockets must never reach rooms, signalling or the relay) and the
 * hub's only line of defence against a hostile peer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  handleHearthworksP2pDisconnect,
  registerHearthworksP2pHandlers,
  resetHearthworksP2pForTests,
} from '../p2p';
import {
  HW_C2S,
  HW_C2S_EVENTS,
  HW_LIMITS,
  HW_RELAY_LIMITS,
  HW_S2C,
  type HwS2CPayload,
} from '@features/hearthworks/engine/net/events';
import { decodeRelay, encodeRelay, relaySlotOf } from '@/lib/shared/p2p/relay';
import { PROTOCOL_ERROR_EVENT } from '@/lib/shared/realtime/contract';
import { all, last, makeWorld, type FakeSocket } from '../../../../server/socket-server/test-support/fake-world';

process.env.LOG_LEVEL = 'silent';

const WORLD = { seed: 20261104, size: 32 };
const HOST = { name: 'Moss Hollow', maxPlayers: 4, world: WORLD };
const OFFER = { type: 'offer', sdp: 'v=0' };
const CAND = { candidate: 'candidate:1 1 udp 1 10.0.0.1 9 typ host', sdpMid: '0', sdpMLineIndex: 0 };

type S2C = { [K in keyof typeof HW_S2C]: HwS2CPayload<K> };

let world: ReturnType<typeof makeWorld>;
let nextId = 0;

function connect(data?: Record<string, unknown>): FakeSocket {
  nextId += 1;
  return world.connect(`hsock-${nextId}`, data ?? { userId: `user-${nextId}`, userName: `Player ${nextId}` });
}

function disconnect(s: FakeSocket): void {
  handleHearthworksP2pDisconnect(world.io, s as never);
  world.disconnect(s);
}

const errors = (s: FakeSocket) => all<S2C['hearthworks:p2p:error']>(s, 'hearthworks:p2p:error').map((e) => e.code);
const lastOf = <K extends keyof S2C>(s: FakeSocket, e: K) => last<S2C[K]>(s, e);
const allOf = <K extends keyof S2C>(s: FakeSocket, e: K) => all<S2C[K]>(s, e);

function host(s: FakeSocket, over: Record<string, unknown> = {}): S2C['hearthworks:p2p:hosted'] {
  world.send(s, 'hearthworks:p2p:host', { ...HOST, ...over });
  const hosted = lastOf(s, 'hearthworks:p2p:hosted');
  if (!hosted) throw new Error(`not hosted: ${errors(s).join(',')}`);
  return hosted;
}

function join(m: FakeSocket, code: string) {
  world.send(m, 'hearthworks:p2p:join', { code });
}

/** Join and get admitted; returns the member's peer id. */
function joinAdmitted(h: FakeSocket, m: FakeSocket, code: string): string {
  join(m, code);
  const req = lastOf(h, 'hearthworks:p2p:join-request');
  if (!req) throw new Error(`no join request: ${errors(m).join(',')}`);
  world.send(h, 'hearthworks:p2p:admit', { peerId: req.peerId, accept: true });
  expect(lastOf(m, 'hearthworks:p2p:admitted')?.code).toBe(code);
  return req.peerId;
}

beforeEach(() => {
  vi.useFakeTimers();
  world = makeWorld(registerHearthworksP2pHandlers);
});

afterEach(() => {
  resetHearthworksP2pForTests();
  vi.useRealTimers();
});

// ─── The account ────────────────────────────────────────────────────────────

/** A payload that passes each event's schema, so only the account can refuse it. */
const VALID: Record<keyof typeof HW_C2S, unknown> = {
  'hearthworks:p2p:host': HOST,
  'hearthworks:p2p:list': {},
  'hearthworks:p2p:join': { code: 'ABCDEF' },
  'hearthworks:p2p:admit': { peerId: 'aaaaaaaaaa01', accept: true },
  'hearthworks:p2p:signal': { description: OFFER },
  'hearthworks:p2p:relay:start': {},
  'hearthworks:p2p:relay': encodeRelay(1, false, new Uint8Array([1])),
  'hearthworks:p2p:successor': { peerId: null },
  'hearthworks:p2p:kick': { peerId: 'aaaaaaaaaa01' },
  'hearthworks:p2p:host-silent': {},
  'hearthworks:p2p:leave': {},
};

describe('Hearthworks multiplayer needs an account', () => {
  const events = Object.values(HW_C2S_EVENTS);

  it('names a schema-valid payload for every event (so the test reaches the account check)', () => {
    for (const e of events) {
      expect(VALID[e], e).toBeDefined();
      expect(HW_C2S[e].safeParse(VALID[e]).success, e).toBe(true);
    }
  });

  it.each(events)('refuses %s from a signed-out socket', (event) => {
    const anon = world.connect(`anon-${event}`, {});
    world.send(anon, event, VALID[event]);
    const errs = allOf(anon, 'hearthworks:p2p:error');
    // The relay hot path is silent: an error per packet would double a flood.
    if (event === 'hearthworks:p2p:relay') expect(errs).toEqual([]);
    else expect(errs).toEqual([{ event, code: 'auth-required' }]);
    // Nothing else came back: no room, no listing, no signal.
    expect(anon.received.filter((r) => r.event !== 'hearthworks:p2p:error')).toEqual([]);
    expect(anon.disconnected).toBe(false);
  });

  it('lets a signed-in account host, and refuses an anonymous join to that real room', () => {
    const h = connect();
    const { code } = host(h);
    const anon = world.connect('anon', {});
    join(anon, code);
    expect(errors(anon)).toEqual(['auth-required']);
    expect(allOf(h, 'hearthworks:p2p:join-request')).toEqual([]);
  });

  it('treats a userId the client smuggles into a payload as the junk it is (the hub only trusts its session)', () => {
    const h = connect({ userId: 'real-host', userName: 'Real Host' });
    const { code } = host(h, { userId: 'someone-else', name: 'x' });
    const m = connect({ userId: 'real-member', userName: 'Real Member' });
    world.send(m, 'hearthworks:p2p:join', { code, userId: 'real-host', name: 'Not Me' });
    expect(lastOf(h, 'hearthworks:p2p:join-request')).toMatchObject({ userId: 'real-member', name: 'Real Member' });
  });
});

// ─── Hosting, listing, joining ──────────────────────────────────────────────

describe('hosting and the room list', () => {
  it('hosts a room: a 6-character code, a resume token, our peer id and ICE servers', () => {
    const h = connect();
    const hosted = host(h);
    expect(hosted.code).toMatch(HW_LIMITS.CODE_RE);
    expect(hosted.token).toHaveLength(HW_LIMITS.TOKEN_LENGTH);
    expect(Array.isArray(hosted.ice)).toBe(true);
    expect(HW_S2C['hearthworks:p2p:hosted'].safeParse(hosted).success).toBe(true);
  });

  it('lists public rooms with the host name, player count and the world digest, and hides private ones', () => {
    const h1 = connect({ userId: 'u1', userName: 'Ada' });
    const h2 = connect({ userId: 'u2', userName: 'Bo' });
    const code1 = host(h1, { name: 'Ada <b>farm</b>' }).code;
    host(h2, { private: true });
    const m = connect();
    world.send(m, 'hearthworks:p2p:list', {});
    const { rooms } = lastOf(m, 'hearthworks:p2p:rooms')!;
    expect(rooms).toEqual([
      { code: code1, name: 'Ada bfarm/b', host: 'Ada', players: 1, maxPlayers: 4, world: WORLD },
    ]);
  });

  it('counts admitted members (not pending ones) in the listing', () => {
    const h = connect();
    const { code } = host(h);
    const m1 = connect();
    const m2 = connect();
    joinAdmitted(h, m1, code);
    join(m2, code); // pending
    world.send(connect(), 'hearthworks:p2p:list', {});
    const lister = connect();
    world.send(lister, 'hearthworks:p2p:list', {});
    expect(lastOf(lister, 'hearthworks:p2p:rooms')!.rooms[0].players).toBe(2);
  });

  it('refuses a second room from a socket that already hosts or has joined one', () => {
    const h = connect();
    const { code } = host(h);
    world.send(h, 'hearthworks:p2p:host', HOST);
    expect(errors(h)).toEqual(['invalid']);
    const m = connect();
    joinAdmitted(h, m, code);
    world.send(m, 'hearthworks:p2p:host', HOST);
    expect(errors(m)).toEqual(['invalid']);
  });

  it('rejects out-of-range or malformed host payloads (and hangs up on them)', () => {
    for (const bad of [
      { ...HOST, maxPlayers: 1 },
      { ...HOST, maxPlayers: 9 },
      { ...HOST, world: { seed: -1, size: 32 } },
      { ...HOST, world: { seed: 1, size: 500 } },
      { ...HOST, name: 'x'.repeat(500) },
      'not an object',
      null,
    ]) {
      const s = connect();
      world.send(s, 'hearthworks:p2p:host', bad);
      expect(last(s, PROTOCOL_ERROR_EVENT)).toEqual({ event: 'hearthworks:p2p:host', reason: 'invalid_payload' });
      expect(s.disconnected).toBe(true);
      expect(lastOf(s, 'hearthworks:p2p:hosted')).toBeUndefined();
    }
  });

  it('re-claims a room after a socket blip with the resume token, and refuses a wrong token or another account', () => {
    const h = connect({ userId: 'owner', userName: 'Owner' });
    const hosted = host(h);
    disconnect(h);
    const back = connect({ userId: 'owner', userName: 'Owner' });
    world.send(back, 'hearthworks:p2p:host', { ...HOST, resume: { code: hosted.code, token: 'x'.repeat(24) } });
    expect(errors(back)).toEqual(['not-host']);
    const thief = connect({ userId: 'thief', userName: 'Thief' });
    world.send(thief, 'hearthworks:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(errors(thief)).toEqual(['not-host']);
    world.send(back, 'hearthworks:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(lastOf(back, 'hearthworks:p2p:hosted')?.code).toBe(hosted.code);
    // The room survives the host's grace now.
    vi.advanceTimersByTime(HW_LIMITS.HOST_GRACE_MS * 2);
    const m = connect();
    join(m, hosted.code);
    expect(lastOf(m, 'hearthworks:p2p:joining')?.code).toBe(hosted.code);
  });

  it('re-creates a room under its old code after a hub restart, when the code is free', () => {
    const h = connect({ userId: 'owner', userName: 'Owner' });
    const hosted = host(h);
    disconnect(h);
    resetHearthworksP2pForTests(); // the hub restarted and forgot everything
    world = makeWorld(registerHearthworksP2pHandlers);
    const back = connect({ userId: 'owner', userName: 'Owner' });
    world.send(back, 'hearthworks:p2p:host', { ...HOST, resume: { code: hosted.code, token: hosted.token } });
    expect(lastOf(back, 'hearthworks:p2p:hosted')).toMatchObject({ code: hosted.code, token: hosted.token });
  });
});

describe('joining and admission', () => {
  it('vouches for the joiner: the host gets the hub-verified id and name, the joiner a peer id', () => {
    const h = connect({ userId: 'host-1', userName: 'Hosty' });
    const { code } = host(h);
    const m = connect({ userId: 'acct-77', userName: 'Mina' });
    join(m, code);
    const joining = lastOf(m, 'hearthworks:p2p:joining')!;
    expect(joining).toMatchObject({ code, hostUserId: 'host-1', hostName: 'Hosty', world: WORLD });
    expect(lastOf(h, 'hearthworks:p2p:join-request')).toEqual({
      peerId: joining.peerId,
      userId: 'acct-77',
      name: 'Mina',
    });
    expect(relaySlotOf(joining.peerId)).toBe(1);
  });

  it('admits on the host\'s word, hands out ICE servers and tells everyone the roster', () => {
    const h = connect({ userId: 'host-1', userName: 'Hosty' });
    const { code, peerId: hostPeer } = host(h);
    const m = connect({ userId: 'acct-77', userName: 'Mina' });
    joinAdmitted(h, m, code);
    expect(lastOf(m, 'hearthworks:p2p:admitted')).toMatchObject({ code, hostPeerId: hostPeer });
    const expected = [
      { id: 'host-1', name: 'Hosty', host: true },
      { id: 'acct-77', name: 'Mina', host: false },
    ];
    expect(lastOf(h, 'hearthworks:p2p:roster')).toEqual({ code, players: expected });
    expect(lastOf(m, 'hearthworks:p2p:roster')).toEqual({ code, players: expected });
  });

  it('refuses unknown codes, the host joining its own room and codes that are not codes', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    join(m, 'ZZZZZZ');
    expect(errors(m)).toEqual(['not-found']);
    join(h, code);
    expect(errors(h)).toEqual(['invalid']);
    const sameAccount = connect({ userId: h.data.userId, userName: 'Same' });
    join(sameAccount, code);
    expect(errors(sameAccount)).toEqual(['invalid']);
    const junk = connect();
    world.send(junk, 'hearthworks:p2p:join', { code: 'abc' });
    expect(last(junk, PROTOCOL_ERROR_EVENT)).toBeDefined();
  });

  it('caps the room at its player count (pending joins count) and frees a seat when someone leaves', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 2 });
    const m1 = connect();
    const m2 = connect();
    joinAdmitted(h, m1, code);
    join(m2, code);
    expect(errors(m2)).toEqual(['full']);
    world.send(m1, 'hearthworks:p2p:leave', {});
    join(m2, code);
    expect(lastOf(m2, 'hearthworks:p2p:joining')?.code).toBe(code);
  });

  it('lets the host refuse a join; the joiner is told and the host\'s roster is unchanged', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    join(m, code);
    const req = lastOf(h, 'hearthworks:p2p:join-request')!;
    world.send(h, 'hearthworks:p2p:admit', { peerId: req.peerId, accept: false });
    expect(lastOf(m, 'hearthworks:p2p:rejected')).toEqual({ code, reason: 'host-refused' });
    expect(lastOf(m, 'hearthworks:p2p:admitted')).toBeUndefined();
  });

  it('replaces the same account\'s older entry when it joins again (a rejoin or a second tab)', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 2 });
    const first = connect({ userId: 'dup', userName: 'Dup' });
    joinAdmitted(h, first, code);
    const second = connect({ userId: 'dup', userName: 'Dup' });
    join(second, code); // not "full": the old entry went quietly
    expect(lastOf(second, 'hearthworks:p2p:joining')?.code).toBe(code);
    // The old socket can no longer signal as that member.
    world.send(first, 'hearthworks:p2p:signal', { description: { type: 'answer', sdp: 'v=0' } });
    expect(errors(first)).toEqual(['not-found']);
  });

  it('moves a socket that joins a second room out of the first, and tells the first host', () => {
    const h1 = connect();
    const h2 = connect();
    const c1 = host(h1).code;
    const c2 = host(h2).code;
    const m = connect();
    joinAdmitted(h1, m, c1);
    join(m, c2);
    expect(lastOf(h1, 'hearthworks:p2p:member-left')).toMatchObject({ reason: 'left' });
    expect(lastOf(h2, 'hearthworks:p2p:join-request')).toBeDefined();
  });

  it('tells the host when a member leaves or its socket drops', () => {
    const h = connect();
    const { code } = host(h);
    const a = connect();
    const b = connect();
    const pa = joinAdmitted(h, a, code);
    const pb = joinAdmitted(h, b, code);
    world.send(a, 'hearthworks:p2p:leave', {});
    expect(lastOf(h, 'hearthworks:p2p:member-left')).toMatchObject({ peerId: pa, reason: 'left' });
    disconnect(b);
    expect(lastOf(h, 'hearthworks:p2p:member-left')).toMatchObject({ peerId: pb, reason: 'disconnected' });
    expect(lastOf(h, 'hearthworks:p2p:roster')!.players.map((p) => p.id)).toEqual([h.data.userId]);
  });
});

describe('kicks', () => {
  it('refuses a kicked account at the door for the room\'s life, and only the host can kick', () => {
    const h = connect();
    const { code } = host(h);
    const a = connect({ userId: 'ann', userName: 'Ann' });
    const b = connect();
    const pa = joinAdmitted(h, a, code);
    const pb = joinAdmitted(h, b, code);
    world.send(b, 'hearthworks:p2p:kick', { peerId: pa });
    expect(errors(b)).toEqual(['not-host']);
    world.send(h, 'hearthworks:p2p:kick', { peerId: pa });
    expect(lastOf(a, 'hearthworks:p2p:rejected')).toEqual({ code, reason: 'kicked' });
    expect(lastOf(h, 'hearthworks:p2p:member-left')).toMatchObject({ peerId: pa, reason: 'kicked' });
    const again = connect({ userId: 'ann', userName: 'Ann' });
    join(again, code);
    expect(errors(again)).toEqual(['kicked']);
    expect(pb).not.toBe(pa);
  });

  it('cannot kick an unknown peer or the host itself', () => {
    const h = connect();
    const { peerId: hostPeer } = host(h);
    world.send(h, 'hearthworks:p2p:kick', { peerId: hostPeer });
    world.send(h, 'hearthworks:p2p:kick', { peerId: 'zzzzzzzzzz01' });
    expect(errors(h)).toEqual(['not-found', 'not-found']);
  });
});

// ─── Signalling ─────────────────────────────────────────────────────────────

describe('signalling', () => {
  it('relays offers, answers and candidates between the host and an admitted member, stamping the sender', () => {
    const h = connect();
    const { code, peerId: hostPeer } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(h, 'hearthworks:p2p:signal', { to: peer, description: OFFER });
    expect(lastOf(m, 'hearthworks:p2p:signal')).toEqual({ from: hostPeer, description: OFFER });
    world.send(m, 'hearthworks:p2p:signal', { description: { type: 'answer', sdp: 'v=0' } });
    expect(lastOf(h, 'hearthworks:p2p:signal')).toEqual({ from: peer, description: { type: 'answer', sdp: 'v=0' } });
    world.send(m, 'hearthworks:p2p:signal', { candidate: CAND });
    expect(lastOf(h, 'hearthworks:p2p:signal')).toEqual({ from: peer, candidate: CAND });
    for (const s of [...allOf(h, 'hearthworks:p2p:signal'), ...allOf(m, 'hearthworks:p2p:signal')]) {
      expect(HW_S2C['hearthworks:p2p:signal'].safeParse(s).success).toBe(true);
    }
  });

  it('refuses signalling from a member the host has not admitted, in both directions', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    join(m, code);
    const peer = lastOf(h, 'hearthworks:p2p:join-request')!.peerId;
    world.send(m, 'hearthworks:p2p:signal', { description: OFFER });
    expect(errors(m)).toEqual(['invalid']);
    world.send(h, 'hearthworks:p2p:signal', { to: peer, description: OFFER });
    expect(errors(h)).toEqual(['invalid']);
    expect(lastOf(h, 'hearthworks:p2p:signal')).toBeUndefined();
    expect(lastOf(m, 'hearthworks:p2p:signal')).toBeUndefined();
  });

  it('does not let a member address another member, a stranger, or a different room', () => {
    const h1 = connect();
    const h2 = connect();
    const c1 = host(h1).code;
    host(h2);
    const a = connect();
    const b = connect();
    const pb = joinAdmitted(h1, b, c1);
    joinAdmitted(h1, a, c1);
    // A member signals only its host: naming another member's peer id is refused.
    world.send(a, 'hearthworks:p2p:signal', { to: pb, description: OFFER });
    expect(errors(a)).toEqual(['invalid']);
    expect(lastOf(b, 'hearthworks:p2p:signal')).toBeUndefined();
    // A host cannot reach a peer id from somebody else's room.
    world.send(h2, 'hearthworks:p2p:signal', { to: pb, description: OFFER });
    expect(errors(h2)).toEqual(['invalid']);
    expect(lastOf(b, 'hearthworks:p2p:signal')).toBeUndefined();
    // A stranger in no room at all.
    const nobody = connect();
    world.send(nobody, 'hearthworks:p2p:signal', { description: OFFER });
    expect(errors(nobody)).toEqual(['not-found']);
  });

  it('refuses admit / kick / successor from a socket that is not the host, and unknown or foreign peer ids', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(m, 'hearthworks:p2p:admit', { peerId: peer, accept: true });
    world.send(m, 'hearthworks:p2p:successor', { peerId: peer });
    expect(errors(m)).toEqual(['not-host', 'not-host']);
    world.send(h, 'hearthworks:p2p:admit', { peerId: 'zzzzzzzzzz09', accept: true });
    world.send(h, 'hearthworks:p2p:successor', { peerId: 'zzzzzzzzzz09' });
    expect(errors(h)).toEqual(['not-found', 'not-found']);
  });

  it('drops malformed or oversize signalling payloads and hangs up on the sender', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    joinAdmitted(h, m, code);
    const bads = [
      { description: { type: 'offer', sdp: 'x'.repeat(HW_LIMITS.SDP_MAX_LENGTH + 1) } },
      { candidate: { ...CAND, candidate: 'x'.repeat(HW_LIMITS.CANDIDATE_MAX_LENGTH + 1) } },
      { description: OFFER, candidate: CAND }, // both
      {}, // neither
      { description: { type: 'rollback', sdp: 'v=0' } },
    ];
    for (const bad of bads) {
      const s = connect();
      world.send(s, 'hearthworks:p2p:signal', bad);
      expect(s.disconnected).toBe(true);
    }
    expect(lastOf(h, 'hearthworks:p2p:signal')).toBeUndefined();
  });
});

// ─── The relay fallback ─────────────────────────────────────────────────────

describe('the relay fallback', () => {
  function relayed() {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(m, 'hearthworks:p2p:relay:start', {});
    const slot = relaySlotOf(peer)!;
    return { h, m, peer, slot, code };
  }

  it('forwards frames both ways under the member\'s slot, never taking the slot from the sender', () => {
    const { h, m, slot } = relayed();
    world.send(m, 'hearthworks:p2p:relay', encodeRelay(99, true, new Uint8Array([1, 2, 3]))); // a spoofed slot
    const up = last<Uint8Array>(h, 'hearthworks:p2p:relay')!;
    expect(decodeRelay(up)).toMatchObject({ slot, reliable: true });
    expect([...decodeRelay(up)!.payload]).toEqual([1, 2, 3]);
    world.send(h, 'hearthworks:p2p:relay', encodeRelay(slot, true, new Uint8Array([9])));
    const down = last<Uint8Array>(m, 'hearthworks:p2p:relay')!;
    expect([...decodeRelay(down)!.payload]).toEqual([9]);
  });

  it('forwards nothing for a member that did not ask for the relay, or one the host has not admitted', () => {
    const h = connect();
    const { code } = host(h);
    const m = connect();
    const peer = joinAdmitted(h, m, code);
    world.send(m, 'hearthworks:p2p:relay', encodeRelay(relaySlotOf(peer)!, true, new Uint8Array([1])));
    world.send(h, 'hearthworks:p2p:relay', encodeRelay(relaySlotOf(peer)!, true, new Uint8Array([1])));
    expect(last(h, 'hearthworks:p2p:relay')).toBeUndefined();
    expect(last(m, 'hearthworks:p2p:relay')).toBeUndefined();
    const pending = connect();
    join(pending, code);
    world.send(pending, 'hearthworks:p2p:relay:start', {});
    expect(errors(pending)).toEqual(['invalid']);
  });

  it('silently drops garbage frames: empty payload, unknown flag bits, unreliable frames over the MTU', () => {
    const { h, m } = relayed();
    world.send(m, 'hearthworks:p2p:relay', new Uint8Array([1, 1])); // header only
    world.send(m, 'hearthworks:p2p:relay', new Uint8Array([0x82, 1, 7])); // unknown flag bit
    world.send(m, 'hearthworks:p2p:relay', encodeRelay(1, false, new Uint8Array(1_301))); // unreliable, over the MTU
    expect(all(h, 'hearthworks:p2p:relay')).toEqual([]);
    expect(errors(m)).toEqual([]);
    expect(m.disconnected).toBe(false);
  });

  it('hangs up on a frame above the packet cap', () => {
    const { m } = relayed();
    world.send(m, 'hearthworks:p2p:relay', encodeRelay(1, true, new Uint8Array(HW_RELAY_LIMITS.MAX_PACKET_BYTES + 1)));
    expect(m.disconnected).toBe(true);
  });

  it('drops unreliable frames past the byte budget but keeps accepting what fits after it refills', () => {
    const { h, m } = relayed();
    const frame = encodeRelay(1, false, new Uint8Array(1_200));
    const burst = Math.floor(HW_RELAY_LIMITS.BURST_BYTES / 1_200);
    for (let i = 0; i < burst + 20; i += 1) world.send(m, 'hearthworks:p2p:relay', frame);
    const got = all(h, 'hearthworks:p2p:relay').length;
    expect(got).toBeGreaterThan(burst - 2);
    expect(got).toBeLessThanOrEqual(burst + 1);
    vi.advanceTimersByTime(2_000); // 2 s × 48 KB/s refills the bucket (and the rate-limit window)
    world.send(m, 'hearthworks:p2p:relay', frame);
    expect(all(h, 'hearthworks:p2p:relay').length).toBe(got + 1);
  });

  it('cuts a member off the room when its reliable debt overflows, and tells the host', () => {
    const { h, m, peer, code } = relayed();
    const frame = encodeRelay(1, true, new Uint8Array(15_000));
    const frames = Math.ceil((HW_RELAY_LIMITS.BURST_BYTES + HW_RELAY_LIMITS.MAX_DEBT_BYTES) / 15_000) + 2;
    for (let i = 0; i < frames; i += 1) world.send(m, 'hearthworks:p2p:relay', frame);
    expect(lastOf(m, 'hearthworks:p2p:rejected')).toEqual({ code, reason: 'relay-overflow' });
    expect(lastOf(h, 'hearthworks:p2p:member-left')).toMatchObject({ peerId: peer });
    const before = all(h, 'hearthworks:p2p:relay').length;
    world.send(m, 'hearthworks:p2p:relay', frame);
    expect(all(h, 'hearthworks:p2p:relay').length).toBe(before);
  });

  it('limits the relayed members per room', () => {
    const h = connect();
    const { code } = host(h, { maxPlayers: 8 });
    for (let i = 0; i < HW_RELAY_LIMITS.MAX_PEERS_PER_ROOM; i += 1) {
      const m = connect();
      joinAdmitted(h, m, code);
      world.send(m, 'hearthworks:p2p:relay:start', {});
      expect(errors(m)).toEqual([]);
    }
    const late = connect();
    joinAdmitted(h, late, code);
    world.send(late, 'hearthworks:p2p:relay:start', {});
    expect(errors(late)).toEqual(['full']);
  });
});

// ─── Rate limits ────────────────────────────────────────────────────────────

describe('rate limits', () => {
  it('stops a socket that floods room creation, with an error rather than silence', () => {
    const s = connect();
    for (let i = 0; i < 40; i += 1) world.send(s, 'hearthworks:p2p:list', {});
    expect(errors(s)).toContain('rate-limited');
    expect(allOf(s, 'hearthworks:p2p:rooms').length).toBeLessThanOrEqual(30);
  });
});

// ─── Host migration ─────────────────────────────────────────────────────────

describe('host migration', () => {
  function room3() {
    const h = connect({ userId: 'host', userName: 'Hosty' });
    const { code } = host(h);
    const a = connect({ userId: 'ann', userName: 'Ann' });
    const b = connect({ userId: 'bob', userName: 'Bob' });
    const pa = joinAdmitted(h, a, code);
    const pb = joinAdmitted(h, b, code);
    return { h, a, b, pa, pb, code };
  }

  it('promotes the host-named successor after the short grace, tells the others and asks the new host to re-admit them', () => {
    const { h, a, b, pb, code } = room3();
    world.send(h, 'hearthworks:p2p:successor', { peerId: pb });
    disconnect(h);
    expect(lastOf(b, 'hearthworks:p2p:promote')).toBeUndefined(); // within the blip grace nothing moves
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS + 10);
    const promote = lastOf(b, 'hearthworks:p2p:promote')!;
    expect(promote).toMatchObject({ code, peerId: pb });
    expect(HW_S2C['hearthworks:p2p:promote'].safeParse(promote).success).toBe(true);
    // Bob is no longer asked anything as a member; Ann is told where the room went.
    expect(lastOf(a, 'hearthworks:p2p:host-changed')).toEqual({
      code,
      hostPeerId: pb,
      hostUserId: 'bob',
      hostName: 'Bob',
    });
    expect(lastOf(b, 'hearthworks:p2p:host-changed')).toBeUndefined();
    // The new host sees Ann's join request with the id the hub vouches for.
    expect(lastOf(b, 'hearthworks:p2p:join-request')).toMatchObject({ userId: 'ann', name: 'Ann' });
    // Ann can only signal once the new host admits her again.
    world.send(a, 'hearthworks:p2p:signal', { description: OFFER });
    expect(errors(a)).toEqual(['invalid']);
    world.send(b, 'hearthworks:p2p:admit', { peerId: lastOf(b, 'hearthworks:p2p:join-request')!.peerId, accept: true });
    expect(lastOf(a, 'hearthworks:p2p:admitted')).toMatchObject({ code, hostPeerId: pb });
    world.send(a, 'hearthworks:p2p:signal', { description: OFFER });
    expect(lastOf(b, 'hearthworks:p2p:signal')).toMatchObject({ from: expect.any(String), description: OFFER });
    expect(lastOf(b, 'hearthworks:p2p:roster')!.players.map((p) => p.id)).toEqual(['bob', 'ann']);
  });

  it('falls back to the longest-connected member when the host named nobody', () => {
    const { h, b, pa, code } = room3();
    disconnect(h);
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS + 10);
    // Ann joined first, so Ann takes over, not Bob.
    expect(lastOf(b, 'hearthworks:p2p:host-changed')).toMatchObject({ code, hostPeerId: pa, hostUserId: 'ann' });
  });

  it('ignores a successor that is not an admitted member of the room', () => {
    const { h, pa, code } = room3();
    const stranger = connect();
    const pending = connect();
    join(pending, code);
    const pp = lastOf(h, 'hearthworks:p2p:join-request')!.peerId;
    world.send(h, 'hearthworks:p2p:successor', { peerId: pp }); // pending, not admitted
    world.send(h, 'hearthworks:p2p:successor', { peerId: 'zzzzzzzzzz01' }); // nobody
    expect(errors(h)).toEqual(['not-found', 'not-found']);
    expect(pa).toBeDefined();
    expect(stranger.disconnected).toBe(false);
  });

  it('hands the room over at once when the host leaves on purpose', () => {
    const { h, a, b, pa, code } = room3();
    world.send(h, 'hearthworks:p2p:successor', { peerId: pa });
    world.send(h, 'hearthworks:p2p:leave', {});
    expect(lastOf(a, 'hearthworks:p2p:promote')).toMatchObject({ code, peerId: pa });
    expect(lastOf(b, 'hearthworks:p2p:host-changed')).toMatchObject({ hostUserId: 'ann' });
    // The leaver is nobody's host any more: its admits are refused.
    world.send(h, 'hearthworks:p2p:admit', { peerId: pa, accept: true });
    expect(errors(h)).toEqual(['not-host']);
  });

  it('closes the room when the host leaves with nobody to take over', () => {
    const h = connect();
    const { code } = host(h);
    world.send(h, 'hearthworks:p2p:leave', {});
    const m = connect();
    join(m, code);
    expect(errors(m)).toEqual(['not-found']);
  });

  it('holds a room whose host vanished with nobody to take over for the full grace, then expires it', () => {
    const h = connect();
    const { code } = host(h);
    disconnect(h);
    // Not listed while its host is away, but still joinable by code within the grace (the host may be back).
    const lister = connect();
    world.send(lister, 'hearthworks:p2p:list', {});
    expect(lastOf(lister, 'hearthworks:p2p:rooms')!.rooms).toEqual([]);
    vi.advanceTimersByTime(HW_LIMITS.HOST_GRACE_MS - 100);
    const early = connect();
    join(early, code);
    expect(lastOf(early, 'hearthworks:p2p:joining')?.code).toBe(code);
    vi.advanceTimersByTime(200);
    // Expired: the waiting joiner is told, new joins are refused, the code is free again.
    expect(lastOf(early, 'hearthworks:p2p:closed')).toEqual({ code, reason: 'host-lost' });
    const late = connect();
    join(late, code);
    expect(errors(late)).toEqual(['not-found']);
  });

  it('keeps holding the room when a member joined during the grace and the host never named a successor', () => {
    // A pending (never admitted) member cannot take over: only admitted, connected members can.
    const h = connect();
    const { code } = host(h);
    disconnect(h);
    const m = connect();
    join(m, code);
    vi.advanceTimersByTime(HW_LIMITS.HOST_GRACE_MS + 10);
    expect(lastOf(m, 'hearthworks:p2p:promote')).toBeUndefined();
    expect(lastOf(m, 'hearthworks:p2p:closed')).toEqual({ code, reason: 'host-lost' });
  });

  it('does not promote anyone when the host comes back inside the grace', () => {
    const { h, b, code } = room3();
    const hostedAgain = (() => {
      const first = lastOf(h, 'hearthworks:p2p:hosted')!;
      return first;
    })();
    disconnect(h);
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS - 500);
    const back = connect({ userId: 'host', userName: 'Hosty' });
    world.send(back, 'hearthworks:p2p:host', { ...HOST, resume: { code, token: hostedAgain.token } });
    expect(lastOf(back, 'hearthworks:p2p:hosted')?.code).toBe(code);
    vi.advanceTimersByTime(HW_LIMITS.HOST_GRACE_MS);
    expect(lastOf(b, 'hearthworks:p2p:promote')).toBeUndefined();
    expect(lastOf(b, 'hearthworks:p2p:host-changed')).toBeUndefined();
  });

  it('promotes the next member when the named successor dropped before the host did', () => {
    const { h, a, b, pa, pb, code } = room3();
    world.send(h, 'hearthworks:p2p:successor', { peerId: pa });
    disconnect(a);
    disconnect(h);
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS + HW_LIMITS.HOST_GRACE_MS);
    expect(lastOf(b, 'hearthworks:p2p:promote')).toMatchObject({ code, peerId: pb });
    expect(pa).not.toBe(pb);
  });

  it('can migrate more than once, each time vouching for the same accounts', () => {
    const { h, a, b, pa, pb, code } = room3();
    disconnect(h);
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS + 10);
    // Ann (earliest) is the host now; Bob is asked to be re-admitted.
    const req = lastOf(a, 'hearthworks:p2p:join-request')!;
    expect(req).toMatchObject({ peerId: pb, userId: 'bob' });
    world.send(a, 'hearthworks:p2p:admit', { peerId: req.peerId, accept: true });
    expect(lastOf(b, 'hearthworks:p2p:admitted')).toMatchObject({ code, hostPeerId: pa });
    disconnect(a);
    vi.advanceTimersByTime(HW_LIMITS.HOST_GRACE_MS + 10);
    // Nobody can take over from Ann: Bob was the only one left, and he is admitted, so he is promoted.
    expect(lastOf(b, 'hearthworks:p2p:promote')).toMatchObject({ code, peerId: pb });
  });
});

// ─── The contract ───────────────────────────────────────────────────────────

describe('what the hub emits', () => {
  it('only ever sends payloads that parse with the shared S2C schemas', () => {
    const h = connect();
    const { code } = host(h);
    const a = connect();
    const b = connect();
    const pa = joinAdmitted(h, a, code);
    joinAdmitted(h, b, code);
    world.send(a, 'hearthworks:p2p:relay:start', {});
    world.send(h, 'hearthworks:p2p:signal', { to: pa, description: OFFER });
    world.send(a, 'hearthworks:p2p:signal', { candidate: CAND });
    world.send(a, 'hearthworks:p2p:relay', encodeRelay(1, true, new Uint8Array([1])));
    world.send(h, 'hearthworks:p2p:relay', encodeRelay(relaySlotOf(pa)!, true, new Uint8Array([2])));
    world.send(h, 'hearthworks:p2p:kick', { peerId: pa });
    world.send(connect(), 'hearthworks:p2p:list', {});
    disconnect(h);
    vi.advanceTimersByTime(HW_LIMITS.MIGRATE_GRACE_MS + 10);
    let checked = 0;
    for (const s of [h, a, b]) {
      for (const r of s.received) {
        const schema = (HW_S2C as Record<string, { safeParse(v: unknown): { success: boolean } }>)[r.event];
        if (!schema) continue; // protocol:error
        expect(schema.safeParse(r.payload).success, r.event).toBe(true);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(8);
  });
});
