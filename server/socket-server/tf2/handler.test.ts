/**
 * The TF2 room manager against a fake socket.io world and a real match pool
 * (in-process runner + `EchoMatchHost`), so these run the shipped ordering —
 * rate limit → schema → allowlist → membership → pool — end to end.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  handleTf2GameDisconnect,
  listPublicTf2Rooms,
  registerTf2GameHandlers,
  resetTf2GameForTests,
} from '../handlers/tf2-game';
import { TF2_C2S, TF2_LIMITS, TF2_S2C, TF2_ROOM_CODE_RE } from '@/lib/tf2-game/net/events';
import type {
  ChatMessage,
  ErrorPayload,
  JoinedPayload,
  KickedPayload,
  PongPayload,
  RoomDetailsPayload,
  RoomsPayload,
} from '@/lib/tf2-game/net/events';
import { MatchPool, setMatchPool } from '@/lib/tf2-game/server/pool.server';
import { EchoMatchHost, ECHO_TAG_INPUT, ECHO_TAG_SNAPSHOT } from '@/lib/tf2-game/server/echo-host';
import type { MatchFactory } from '@/lib/tf2-game/server/match-host';
import { all, last, makeWorld, sleep, until, type FakeSocket } from './helpers';

process.env.LOG_LEVEL = 'silent';

const VALID = {
  map: 'ctf_2fort',
  maxPlayers: 4,
  botCount: 2,
  botDifficulty: 'normal',
  name: 'Test server',
};

/** Fails `cp_badlands` the way a missing map package would. */
const factory: MatchFactory = async (opts) => {
  if (opts.map === 'cp_badlands') throw new Error('map package not found');
  return new EchoMatchHost(opts);
};

let world: ReturnType<typeof makeWorld>;
let pool: MatchPool;
let nextId = 0;

/** A signed-in socket (multiplayer needs an account); pass `{}` for a signed-out visitor. */
function connect(data?: Record<string, unknown>): FakeSocket {
  nextId += 1;
  return world.connect(`sock-${nextId}`, data ?? { userId: `user-${nextId}`, userName: `Player ${nextId}` });
}

const errors = (s: FakeSocket) => all<ErrorPayload>(s, TF2_S2C.ERROR).map((e) => e.code);

async function createRoom(owner: FakeSocket, overrides: Record<string, unknown> = {}): Promise<JoinedPayload> {
  world.send(owner, TF2_C2S.CREATE_ROOM, { ...VALID, ...overrides });
  await until(() => last(owner, TF2_S2C.JOINED) !== undefined, 2_000, 'joined');
  return last<JoinedPayload>(owner, TF2_S2C.JOINED)!;
}

async function joinRoom(s: FakeSocket, code: string): Promise<JoinedPayload> {
  world.send(s, TF2_C2S.JOIN_ROOM, { code });
  await until(() => last(s, TF2_S2C.JOINED) !== undefined, 2_000, 'joined');
  return last<JoinedPayload>(s, TF2_S2C.JOINED)!;
}

beforeEach(() => {
  world = makeWorld(registerTf2GameHandlers);
  pool = new MatchPool({ workerPath: null, allowInProcess: true, factory, maxMatches: 3 });
  setMatchPool(pool);
});

afterEach(() => {
  resetTf2GameForTests(world.io);
  pool.shutdown();
  setMatchPool(null);
});

describe('creating a room', () => {
  it('refuses a map that is not on the allowlist', () => {
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, { ...VALID, map: 'de_dust2' });
    expect(errors(s)).toEqual(['unknown-map']);
    expect(pool.matchCount).toBe(0);
  });

  it('refuses a mode the map is not', () => {
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, { ...VALID, mode: 'koth' });
    expect(errors(s)).toEqual(['bad-mode']);
  });

  it.each([
    ['too many players', { maxPlayers: TF2_LIMITS.MAX_PLAYERS + 1 }],
    ['one player', { maxPlayers: 1 }],
    ['fractional bots', { botCount: 1.5 }],
    ['an unknown difficulty', { botDifficulty: 'insane' }],
    ['a non-string map', { map: 42 }],
  ])('refuses %s', (_label, overrides) => {
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, { ...VALID, ...overrides });
    expect(errors(s)).toEqual(['bad-payload']);
    expect(pool.matchCount).toBe(0);
  });

  it('refuses a non-object payload', () => {
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, 'ctf_2fort');
    expect(errors(s)).toEqual(['bad-payload']);
  });

  it('creates the match and sends `joined` once the map is in', async () => {
    const s = connect();
    const joined = await createRoom(s);
    expect(joined.code).toMatch(TF2_ROOM_CODE_RE);
    expect(joined).toMatchObject({ playerId: 1, map: 'ctf_2fort', mode: 'ctf', maxPlayers: 4, tickInterval: 0.015 });
    expect(pool.matchCount).toBe(1);
  });

  it('sanitises the room name', async () => {
    const s = connect();
    const joined = await createRoom(s, { name: '<b>Pub</b>', playerName: '<img src=x>' });
    expect(joined.name).toBe('bPub/b');
    const list = listPublicTf2Rooms().rooms;
    expect(list[0].name).toBe('bPub/b');
  });

  it('clamps bots below the player cap', async () => {
    const s = connect();
    await createRoom(s, { maxPlayers: 2, botCount: 23 });
    expect(listPublicTf2Rooms().rooms[0].bots).toBeLessThanOrEqual(1);
  });

  it('caps matches at the pool size', async () => {
    for (let i = 0; i < 3; i += 1) await createRoom(connect());
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, VALID);
    expect(errors(s)).toEqual(['capacity']);
  });

  it('kicks everyone with map-failed when the map does not load', async () => {
    const s = connect();
    world.send(s, TF2_C2S.CREATE_ROOM, { ...VALID, map: 'cp_badlands' });
    await until(() => last(s, TF2_S2C.KICKED) !== undefined, 2_000, 'kicked');
    expect(last<KickedPayload>(s, TF2_S2C.KICKED)?.reason).toBe('map-failed');
    expect(last(s, TF2_S2C.JOINED)).toBeUndefined();
    expect(listPublicTf2Rooms().rooms).toEqual([]);
    expect(pool.matchCount).toBe(0);
  });

  it('rate-limits room creation', () => {
    const s = connect();
    for (let i = 0; i < 7; i += 1) world.send(s, TF2_C2S.CREATE_ROOM, { ...VALID, map: 'nope' });
    expect(errors(s).slice(-1)).toEqual(['rate-limited']);
  });
});

describe('the server browser and joining', () => {
  it('lists public rooms and hides private ones', async () => {
    const a = connect();
    const b = connect();
    const pub = await createRoom(a);
    await createRoom(b, { private: true, map: 'koth_viaduct' });
    const c = connect();
    world.send(c, TF2_C2S.LIST_ROOMS, {});
    const page = last<RoomsPayload>(c, TF2_S2C.ROOMS)!;
    expect(page.total).toBe(1);
    expect(page.rooms.map((r) => r.code)).toEqual([pub.code]);
    expect(page.rooms[0]).toMatchObject({ map: 'ctf_2fort', players: 1, maxPlayers: 4, state: 'running', kind: 'dedicated' });
  });

  it('answers the details pane, for anyone, and pages the list', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    const visitor = connect({});
    world.send(visitor, TF2_C2S.ROOM_DETAILS, { code });
    world.send(visitor, TF2_C2S.ROOM_DETAILS, { code: 'ZZZZZZ' });
    world.send(visitor, TF2_C2S.ROOM_DETAILS, { code: 'nope' });
    const details = all<RoomDetailsPayload>(visitor, TF2_S2C.ROOM_DETAILS);
    expect(details[0].room).toMatchObject({ code, kind: 'dedicated', map: 'ctf_2fort' });
    expect(Array.isArray(details[0].room?.roster)).toBe(true);
    expect(details[1]).toEqual({ code: 'ZZZZZZ', room: null });
    expect(errors(visitor)).toEqual(['bad-payload']);
    world.send(visitor, TF2_C2S.LIST_ROOMS, { offset: 1 });
    expect(last<RoomsPayload>(visitor, TF2_S2C.ROOMS)).toEqual({ rooms: [], total: 1, offset: 1 });
  });

  it('joins by code with the next player id', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    const b = connect();
    const joined = await joinRoom(b, code);
    expect(joined).toMatchObject({ code, playerId: 2 });
    expect(joined.serverTick).toBeGreaterThanOrEqual(0);
  });

  it('refuses a malformed code and an unknown one', () => {
    const s = connect();
    world.send(s, TF2_C2S.JOIN_ROOM, { code: 'abc' });
    world.send(s, TF2_C2S.JOIN_ROOM, { code: 'ZZZZZZ' });
    expect(errors(s)).toEqual(['bad-payload', 'no-such-room']);
  });

  it('refuses a full room', async () => {
    const a = connect();
    const { code } = await createRoom(a, { maxPlayers: 2, botCount: 0 });
    await joinRoom(connect(), code);
    const c = connect();
    world.send(c, TF2_C2S.JOIN_ROOM, { code });
    expect(errors(c)).toEqual(['room-full']);
  });

  it('names players by their account, never by what they send', async () => {
    const a = connect({ userId: 'user-1', userName: 'Heavy Weapons Guy' });
    const { code } = await createRoom(a, { playerName: 'Impostor' });
    const b = connect({ userId: 'user-2', userName: 'Scout' });
    world.send(b, TF2_C2S.JOIN_ROOM, { code, playerName: 'Also an impostor' });
    await until(() => last(b, TF2_S2C.JOINED) !== undefined, 2_000, 'joined');
    world.send(b, TF2_C2S.CHAT, { text: 'hi' });
    world.send(a, TF2_C2S.CHAT, { text: 'hello' });
    const lines = all<ChatMessage>(b, TF2_S2C.CHAT);
    expect(lines.map((l) => l.name)).toEqual(['Scout', 'Heavy Weapons Guy']);
  });
});

describe('multiplayer needs an account', () => {
  it('refuses every room action from a signed-out socket, but lets it browse', async () => {
    const owner = connect();
    const { code } = await createRoom(owner);
    const anon = connect({});
    world.send(anon, TF2_C2S.CREATE_ROOM, VALID);
    world.send(anon, TF2_C2S.JOIN_ROOM, { code });
    world.send(anon, TF2_C2S.CHAT, { text: 'hi' });
    world.send(anon, TF2_C2S.TEAM, { team: 'red' });
    world.send(anon, TF2_C2S.CLASS, { cls: 'scout' });
    world.send(anon, TF2_C2S.VOICE, { menu: 0, item: 0 });
    world.send(anon, TF2_C2S.EXTRA, { command: 'taunt', args: [] });
    world.send(anon, TF2_C2S.LOADOUT, { cls: 'scout', slots: {} });
    expect(errors(anon)).toEqual(Array(8).fill('auth-required'));
    expect(last(anon, TF2_S2C.JOINED)).toBeUndefined();
    expect(pool.matchCount).toBe(1);
    world.send(anon, TF2_C2S.INPUT, new Uint8Array([1, 2, 3]));
    expect(errors(anon)).toHaveLength(8);
    world.send(anon, TF2_C2S.LIST_ROOMS, {});
    world.send(anon, TF2_C2S.PING, { t: 1 });
    expect(last<RoomsPayload>(anon, TF2_S2C.ROOMS)?.rooms.map((r) => r.code)).toEqual([code]);
    expect(last<PongPayload>(anon, TF2_S2C.PONG)?.tick).toBeNull();
  });
});

describe('the binary relay', () => {
  it('forwards input to the match and relays its packets', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    const b = connect();
    await joinRoom(b, code);

    world.send(a, TF2_C2S.INPUT, Buffer.from([1, 2, 3]));
    await until(() => all(a, TF2_S2C.EVENTS).length > 0, 2_000, 'echo');
    const echo = all<Uint8Array>(a, TF2_S2C.EVENTS)[0];
    expect([...echo]).toEqual([ECHO_TAG_INPUT, 1, 2, 3]);
    // Reliable packets addressed to one player reach that player only.
    expect(all(b, TF2_S2C.EVENTS)).toEqual([]);

    // Unreliable packets are volatile broadcasts to the room.
    await until(() => all(b, TF2_S2C.SNAPSHOT).length > 0, 2_000, 'snapshot');
    const snap = b.received.find((r) => r.event === TF2_S2C.SNAPSHOT)!;
    expect(snap.volatile).toBe(true);
    expect((snap.payload as Uint8Array)[0]).toBe(ECHO_TAG_SNAPSHOT);
    expect(a.received.find((r) => r.event === TF2_S2C.EVENTS)!.volatile).toBe(false);
  });

  it('drops oversized, empty and non-binary input silently', async () => {
    const a = connect();
    await createRoom(a);
    world.send(a, TF2_C2S.INPUT, new Uint8Array(TF2_LIMITS.INPUT_MAX_BYTES + 1));
    world.send(a, TF2_C2S.INPUT, new Uint8Array(0));
    world.send(a, TF2_C2S.INPUT, 'AAAA');
    world.send(a, TF2_C2S.INPUT, [1, 2, 3]);
    world.send(a, TF2_C2S.INPUT, { 0: 1, length: 1 });
    await sleep(80);
    expect(all(a, TF2_S2C.EVENTS)).toEqual([]);
    expect(errors(a)).toEqual([]);
    // The largest legal packet goes through.
    world.send(a, TF2_C2S.INPUT, new Uint8Array(TF2_LIMITS.INPUT_MAX_BYTES));
    await until(() => all(a, TF2_S2C.EVENTS).length === 1, 2_000, 'echo');
  });

  it('ignores input from a socket that is not in a room', async () => {
    await createRoom(connect());
    const stranger = connect();
    world.send(stranger, TF2_C2S.INPUT, new Uint8Array([9]));
    await sleep(50);
    expect(stranger.received).toEqual([]);
  });
});

describe('commands, chat and clock sync', () => {
  it('validates team, class and voice commands', async () => {
    const a = connect();
    world.send(a, TF2_C2S.TEAM, { team: 'red' });
    expect(errors(a)).toEqual(['not-in-room']);
    await createRoom(a);
    world.send(a, TF2_C2S.TEAM, { team: 'green' });
    world.send(a, TF2_C2S.CLASS, { cls: 'civilian' });
    world.send(a, TF2_C2S.VOICE, { menu: 3, item: 0 });
    world.send(a, TF2_C2S.VOICE, { menu: 0, item: 8 });
    expect(errors(a).slice(1)).toEqual(['bad-payload', 'bad-payload', 'bad-payload', 'bad-payload']);
  });

  it('routes team chat by the team the match reports', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    const b = connect();
    await joinRoom(b, code);
    const c = connect();
    await joinRoom(c, code);
    world.send(a, TF2_C2S.TEAM, { team: 'red' });
    world.send(b, TF2_C2S.TEAM, { team: 'blue' });
    world.send(c, TF2_C2S.TEAM, { team: 'red' });
    // The match's summary carries the teams back (sooner after a command).
    await sleep(450);

    world.send(a, TF2_C2S.CHAT, { text: 'spy sapping my sentry', teamOnly: true });
    expect(all<ChatMessage>(c, TF2_S2C.CHAT).map((m) => m.text)).toEqual(['spy sapping my sentry']);
    expect(all(b, TF2_S2C.CHAT)).toEqual([]);
    expect(all<ChatMessage>(a, TF2_S2C.CHAT)[0]).toMatchObject({ teamOnly: true, team: 2, from: 1 });

    world.send(b, TF2_C2S.CHAT, { text: 'gg' });
    for (const s of [a, b, c]) expect(last<ChatMessage>(s, TF2_S2C.CHAT)?.text).toBe('gg');
  });

  it('strips control characters and caps chat length', async () => {
    const a = connect();
    await createRoom(a);
    world.send(a, TF2_C2S.CHAT, { text: 'a\u0000b\u001bc\n' });
    world.send(a, TF2_C2S.CHAT, { text: 'x'.repeat(200) });
    world.send(a, TF2_C2S.CHAT, { text: 'x'.repeat(400) });
    world.send(a, TF2_C2S.CHAT, { text: '\u0000\u0001' });
    const lines = all<ChatMessage>(a, TF2_S2C.CHAT).map((m) => m.text);
    expect(lines).toEqual(['abc', 'x'.repeat(TF2_LIMITS.CHAT_MAX_LENGTH)]);
    expect(errors(a)).toEqual(['bad-payload']);
  });

  it('answers pings with the match tick', async () => {
    const lonely = connect();
    world.send(lonely, TF2_C2S.PING, { t: 12.5 });
    expect(last<PongPayload>(lonely, TF2_S2C.PONG)).toMatchObject({ t: 12.5, tick: null });

    const a = connect();
    await createRoom(a);
    await sleep(100);
    world.send(a, TF2_C2S.PING, { t: 99 });
    const pong = last<PongPayload>(a, TF2_S2C.PONG)!;
    expect(pong.t).toBe(99);
    expect(pong.tick).toBeGreaterThan(0);
    world.send(a, TF2_C2S.PING, { t: 'now' });
    expect(errors(a)).toEqual(['bad-payload']);
  });
});

describe('leaving', () => {
  it('closes a room when its last player leaves', async () => {
    const a = connect();
    await createRoom(a);
    expect(listPublicTf2Rooms().rooms).toHaveLength(1);
    world.send(a, TF2_C2S.LEAVE, {});
    expect(listPublicTf2Rooms().rooms).toEqual([]);
    expect(pool.matchCount).toBe(0);
  });

  it('holds a room whose last player dropped, and frees the seat', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    handleTf2GameDisconnect(world.io, a as never);
    world.disconnect(a);
    const rooms = listPublicTf2Rooms().rooms;
    expect(rooms).toHaveLength(1);
    expect(rooms[0].players).toBe(0);

    const back = connect();
    const joined = await joinRoom(back, code);
    expect(joined.playerId).toBe(2);
  });

  it('keeps the room for the others when one player disconnects', async () => {
    const a = connect();
    const { code } = await createRoom(a);
    const b = connect();
    await joinRoom(b, code);
    handleTf2GameDisconnect(world.io, b as never);
    world.disconnect(b);
    expect(listPublicTf2Rooms().rooms[0].players).toBe(1);
    world.send(a, TF2_C2S.CHAT, { text: 'still here' });
    expect(last<ChatMessage>(a, TF2_S2C.CHAT)?.text).toBe('still here');
  });

  it('moves a player who creates a room while seated in another', async () => {
    const a = connect();
    const first = await createRoom(a);
    const b = connect();
    await joinRoom(b, first.code);
    a.received.length = 0;
    const second = await createRoom(a, { map: 'pl_badwater' });
    expect(second.code).not.toBe(first.code);
    const rooms = listPublicTf2Rooms().rooms;
    expect(rooms.find((r) => r.code === first.code)?.players).toBe(1);
    expect(rooms.find((r) => r.code === second.code)?.players).toBe(1);
  });
});
