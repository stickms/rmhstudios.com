/**
 * TF2 multiplayer needs an account — every inbound `tf2:*` event, enforced on
 * the hub (handlers/tf2-game.ts and handlers/tf2-p2p.ts).
 *
 * Offline play never touches the hub, and browsing is public, so the open set
 * is small and named below. Everything else a signed-out socket sends is
 * refused with `auth-required` (or, on the binary hot paths, dropped without
 * an answer). The list of events comes from `TF2_C2S` itself, so an event
 * added later is covered the day it is added: it either refuses visitors or
 * gets a line in OPEN with its reason.
 *
 * This sits in the main suite (not `pnpm test:tf2`) because it is an auth
 * boundary: a regression lets anonymous sockets host, join, signal and use
 * the peer-to-peer relay.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerTf2GameHandlers } from '../tf2-game';
import { registerTf2P2pHandlers, resetTf2P2pForTests } from '../tf2-p2p';
import { TF2_C2S, TF2_S2C, type ErrorPayload } from '@/lib/tf2-game/net/events';
import { encodeRelay } from '@/lib/tf2-game/net/p2p/signal';
import { all, makeWorld } from '../../tf2/helpers';

/** Public on purpose: the server browser, its details pane, and the ping column. */
const OPEN = new Set<string>([TF2_C2S.LIST_ROOMS, TF2_C2S.ROOM_DETAILS, TF2_C2S.PING]);
/** Binary hot path: refused silently (an error per packet would double a flood). */
const SILENT = new Set<string>([TF2_C2S.P2P_RELAY]);

/** A payload that would pass each event's schema, so only the account can refuse it. */
const VALID: Record<string, unknown> = {
  [TF2_C2S.P2P_HOST]: { map: 'ctf_2fort', maxPlayers: 4, botCount: 1, botDifficulty: 'normal', name: 'x' },
  [TF2_C2S.P2P_UPDATE]: { state: 'running', players: [], teamScores: [0, 0], round: null },
  [TF2_C2S.P2P_CLOSE]: {},
  [TF2_C2S.P2P_JOIN]: { code: 'ABCDEF' },
  [TF2_C2S.P2P_LEAVE]: {},
  [TF2_C2S.P2P_ADMIT]: { peerId: 'aaaaaaaaaaaa', accept: true },
  [TF2_C2S.P2P_KICK]: { peerId: 'aaaaaaaaaaaa' },
  [TF2_C2S.P2P_SIGNAL]: { candidate: null },
  [TF2_C2S.P2P_RELAY_START]: {},
  [TF2_C2S.P2P_SUCCESSOR]: { peerId: null },
  [TF2_C2S.ROOM_ADMIN]: { action: 'lock', locked: true },
  [TF2_C2S.P2P_RELAY]: encodeRelay(1, false, new Uint8Array([1])),
};

let world: ReturnType<typeof makeWorld>;

beforeEach(() => {
  world = makeWorld(registerTf2GameHandlers, registerTf2P2pHandlers);
});

afterEach(() => {
  resetTf2P2pForTests(world.io);
});

describe('TF2 multiplayer needs an account', () => {
  const events = Object.values(TF2_C2S).filter((e) => !OPEN.has(e));

  it('names a valid payload for every guarded event (so the test reaches the account check)', () => {
    for (const e of events) expect(VALID[e], e).toBeDefined();
  });

  it.each(events)('refuses %s from a signed-out socket', (event) => {
    const anon = world.connect(`anon-${event}`, {});
    world.send(anon, event, VALID[event]);
    const errors = all<ErrorPayload>(anon, TF2_S2C.ERROR);
    if (SILENT.has(event)) expect(errors).toEqual([]);
    else expect(errors).toEqual([{ code: 'auth-required', event }]);
    // Nothing else came back: no room, no hosting, no relay, no signal.
    expect(anon.received.filter((r) => r.event !== TF2_S2C.ERROR)).toEqual([]);
  });

  it('lets a signed-out socket browse, and a signed-in one in', () => {
    const anon = world.connect('anon', {});
    world.send(anon, TF2_C2S.LIST_ROOMS, {});
    world.send(anon, TF2_C2S.ROOM_DETAILS, { code: 'ABCDEF' });
    world.send(anon, TF2_C2S.PING, { t: 1 });
    expect(all(anon, TF2_S2C.ERROR)).toEqual([]);
    expect(anon.received.map((r) => r.event)).toEqual([TF2_S2C.ROOMS, TF2_S2C.ROOM_DETAILS, TF2_S2C.PONG]);

    const member = world.connect('member', { userId: 'user-1', userName: 'Spy' });
    world.send(member, TF2_C2S.P2P_HOST, VALID[TF2_C2S.P2P_HOST]);
    expect(all(member, TF2_S2C.ERROR)).toEqual([]);
    expect(all(member, TF2_S2C.P2P_HOSTED)).toHaveLength(1);
  });
});
