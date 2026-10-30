/**
 * Balatro multiplayer needs an account — every inbound `balatro:*` event,
 * enforced on the hub (handlers/balatro-p2p.ts and the matchmaking handler,
 * ../balatro-queue.ts).
 *
 * Single-player Balatro never touches the hub, so nothing is open: every event
 * a signed-out socket sends is refused with `auth-required` (the binary relay
 * hot path is dropped without an answer — an error per packet would double a
 * flood). The list comes from `BALATRO_C2S` itself, so an event added later is
 * covered the day it is added.
 *
 * Main suite (not `pnpm test:balatro`): it is an auth boundary — a regression
 * lets anonymous sockets into lobbies, seats and the relay (docs/testing.md).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerBalatroP2pHandlers, resetBalatroP2pForTests } from '../balatro-p2p';
import { registerBalatroQueueHandlers, resetBalatroQueueForTests } from '../balatro-queue';
import { BALATRO_C2S, BALATRO_C2S_EVENTS, BALATRO_S2C_EVENTS } from '@/lib/balatro/net/events';
import { encodeRelay } from '@/lib/shared/p2p/relay';
import { all, makeWorld } from '../../test-support/fake-world';

const HASH = `${'a'.repeat(24)}-v1`;
/** Binary hot path: refused silently. */
const SILENT = new Set<string>([BALATRO_C2S_EVENTS['balatro:p2p:relay']]);

/** A payload that passes each event's schema, so only the account can refuse it. */
const VALID: Record<keyof typeof BALATRO_C2S, unknown> = {
  'balatro:p2p:host': { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 2, contentHash: HASH, spectatable: false },
  'balatro:p2p:join': { code: 'ABCDEF', contentHash: HASH },
  'balatro:p2p:admit': { peerId: 'aaaaaaaaaa01', accept: true },
  'balatro:p2p:signal': { description: { type: 'offer', sdp: 'v=0' } },
  'balatro:p2p:relay:start': {},
  'balatro:p2p:relay': encodeRelay(1, false, new Uint8Array([1])),
  'balatro:p2p:state': {
    open: true,
    started: false,
    runId: null,
    members: [],
    successor: null,
    spectatable: false,
    summary: { players: 1, ante: null },
  },
  'balatro:p2p:kick': { peerId: 'aaaaaaaaaa01' },
  'balatro:p2p:forfeit-seat': { userId: 'u', runId: 'r' },
  'balatro:p2p:leave': {},
  'balatro:p2p:close': {},
  'balatro:seat:query': {},
  'balatro:queue:join': { queueMode: 'pvp_nemesis', contentHash: HASH },
  'balatro:queue:leave': {},
  'balatro:party:queue': { code: 'ABCDEF', queueMode: 'pvp_nemesis' },
  'balatro:invite': { code: 'ABCDEF', toUserId: 'u' },
  'balatro:spectate:list': {},
};

let world: ReturnType<typeof makeWorld>;

beforeEach(() => {
  world = makeWorld(registerBalatroP2pHandlers, registerBalatroQueueHandlers);
});

afterEach(() => {
  resetBalatroP2pForTests();
  resetBalatroQueueForTests();
});

describe('Balatro multiplayer needs an account', () => {
  const events = Object.values(BALATRO_C2S_EVENTS);

  it('names a schema-valid payload for every event (so the test reaches the account check)', () => {
    for (const e of events) {
      expect(VALID[e], e).toBeDefined();
      expect(BALATRO_C2S[e].safeParse(VALID[e]).success, e).toBe(true);
    }
  });

  it.each(events)('refuses %s from a signed-out socket', async (event) => {
    const anon = world.connect(`anon-${event}`, {});
    world.send(anon, event, VALID[event]);
    await Promise.resolve();
    const errors = all(anon, BALATRO_S2C_EVENTS['balatro:p2p:error']);
    if (SILENT.has(event)) expect(errors).toEqual([]);
    else expect(errors).toEqual([{ event, code: 'auth-required' }]);
    // Nothing else came back: no room, no seat, no relay, no signal, no listing.
    expect(anon.received.filter((r) => r.event !== BALATRO_S2C_EVENTS['balatro:p2p:error'])).toEqual([]);
    expect(anon.disconnected).toBe(false);
  });

  it('lets a signed-in account host, and refuses an anonymous join to that real room', () => {
    const host = world.connect('host', { userId: 'user-1', userName: 'Jimbo' });
    world.send(host, 'balatro:p2p:host', VALID['balatro:p2p:host']);
    const hosted = all<{ code: string }>(host, BALATRO_S2C_EVENTS['balatro:p2p:hosted']);
    expect(hosted).toHaveLength(1);
    const anon = world.connect('anon', {});
    world.send(anon, 'balatro:p2p:join', { code: hosted[0].code, contentHash: HASH });
    expect(all(anon, BALATRO_S2C_EVENTS['balatro:p2p:error'])).toEqual([{ event: 'balatro:p2p:join', code: 'auth-required' }]);
    expect(all(host, BALATRO_S2C_EVENTS['balatro:p2p:join-request'])).toEqual([]);
  });
});
