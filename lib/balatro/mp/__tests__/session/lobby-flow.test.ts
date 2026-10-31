/**
 * The session runtime end to end at the TS level (PLAN §4 WS5 tests, §6.2
 * I-01/I-03): host and members on FakeNet channels, signalling through the
 * real Balatro hub handler, Lua replaced by a validating fake. Lobby
 * creation, join by code, ready/start, the referee wiring for 1v1 and
 * N-player matches, spectators, the relay fallback, kicks, return to lobby.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, code, ev, lobbyWith as lobbyIn, startMatch as startIn, type Peer } from './world.test-support';

let w: World;
const lobbyWith = (n: number, o?: Parameters<typeof lobbyIn>[2]) => lobbyIn(w, n, o);
const startMatch = (h: Peer, m: Peer[], o?: Record<string, unknown>) => startIn(w, h, m, o);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_762_000_000_000);
  w = new World();
});

afterEach(() => {
  for (const p of w.peers) expect(p.lua.invalid, `${p.id} sent Lua an invalid message`).toEqual([]);
  w.stop();
  vi.useRealTimers();
});

describe('lobby: create, join, ready, start', () => {
  it('a private lobby forms, mirrors versioned state and starts on the host', async () => {
    const { host, members } = await lobbyWith(2);
    const [bob] = members as [Peer];
    expect(host.lua.last('lobby_view')?.isHost).toBe(true);
    expect(bob.lua.last('lobby_view')?.isHost).toBe(false);
    expect(host.lua.last('lobby_view')?.canStart).toBe(false);
    expect(host.lua.last('lobby_view')?.startBlockReason).toBe('ready');
    // The hub directory knows the lobby (members in join order, successor named).
    const state = host.hub.emitted.filter((e) => e.event === 'balatro:p2p:state').pop()?.data as { members: string[]; successor: string | null };
    expect(state.members).toEqual(['alice', 'bob']);
    expect(state.successor).not.toBeNull();

    await startMatch(host, members, { startingLives: 2 });
    const hm = host.lua.last('match_start');
    const bm = bob.lua.last('match_start');
    expect(hm?.seed).toBe('SEEDABCD');
    expect(bm?.runId).toBe(hm?.runId);
    expect(bm?.me).toBe('bob');
    expect(hm?.options.startingLives).toBe(2);
    expect(hm?.roster.map((r) => r.id)).toEqual(['alice', 'bob']);
    // Reset outcomes arrive everywhere, in the same order, deduplicated by hs.
    await w.until(() => bob.lua.outcomes().length >= 2 && host.lua.outcomes().length >= 2, 5_000, 'reset outcomes');
    expect(bob.lua.outcomes().map((o) => o.hs)).toEqual(host.lua.outcomes().map((o) => o.hs));
    expect(bob.lua.outcomesOf('player_lives')[0]).toMatchObject({ player_id: '*all*', lives: 2 });
    expect(bob.lua.outcomesOf('nemesis_pairing')[0]?.pairing).toEqual({ alice: 'bob', bob: 'alice' });
    expect(bob.runtime.client?.routing.target).toBe('alice');
    // The rejoin hint is set while seated.
    expect(bob.kv.getItem('rmh-balatro-mp-rejoin')).toBe(hm?.runId);
  });

  it('a 1v1 is played to the end: PvP resolution, lives, the win on both sides, history', async () => {
    const { host, members } = await lobbyWith(2);
    const [bob] = members as [Peer];
    await startMatch(host, members, { startingLives: 1, timer: false });
    for (const p of [host, bob]) {
      ev(p, { t: 'set_ante', ante: 1 });
      ev(p, { t: 'ready_blind', starting_hands: 2 });
    }
    await w.until(() => host.lua.outcomesOf('start_blind').length === 1 && bob.lua.outcomesOf('start_blind').length === 1, 5_000, 'start_blind');
    ev(host, { t: 'play_hand', score: '300', hands_left: 1, skips: 0 });
    ev(bob, { t: 'play_hand', score: '120', hands_left: 1, skips: 0 });
    ev(host, { t: 'play_hand', score: '600', hands_left: 0, skips: 0 });
    ev(bob, { t: 'play_hand', score: '200', hands_left: 0, skips: 0 });
    await w.until(() => host.lua.outcomesOf('win').length > 0 && bob.lua.outcomesOf('win').length > 0, 5_000, 'win');
    expect(host.lua.outcomesOf('win')[0]?.winner_id).toBe('alice');
    expect(host.runtime.client?.result).toBe('win');
    expect(bob.runtime.client?.result).toBe('lose');
    expect(host.lua.last('history')).toMatchObject({ wins: 1, games: 1, pvpGames: 1 });
    expect(bob.lua.last('history')).toMatchObject({ losses: 1, wins: 0 });
    expect(bob.kv.getItem('rmh-balatro-mp-rejoin')).toBeNull();
    // Display sync travels peer to peer through the host, stamped with the sender.
    bob.lua.emit('peer', { k: 'nemesis_info', d: { score: '200', hands_left: 0, skips: 0, lives: 0 } });
    await w.until(() => host.lua.all('peer').some((p) => p.k === 'nemesis_info' && p.from === 'bob'), 5_000, 'nemesis_info');
    // The win is re-sent at +3 s and +8 s; members apply it once (deduped by hs, then Lua's own dedupe).
    await w.step(9_000, 50);
    expect(bob.lua.outcomesOf('win').length).toBe(3);
    expect(new Set(bob.lua.outcomes().map((o) => o.hs)).size).toBe(bob.lua.outcomes().length);
    // Return to Lobby (private): ready reset, match cleared.
    host.lua.emit('ui_return_lobby', {});
    await w.until(() => bob.lua.last('lobby_view')?.state.started === null, 5_000, 'back in the lobby');
    expect(bob.lua.last('lobby_view')?.state.players.every((p) => !p.ready)).toBe(true);
  });

  it('three players get a Nemesis rotation with a bye; Ready works for every pairing', async () => {
    const { host, members, all } = await lobbyWith(3);
    await startMatch(host, members, { startingLives: 3 });
    await w.until(() => all.every((p) => p.lua.outcomesOf('nemesis_pairing').length > 0), 5_000, 'pairing');
    const pairing = host.lua.outcomesOf('nemesis_pairing')[0]?.pairing ?? {};
    expect(Object.values(pairing).filter((v) => v === '').length).toBe(1);
    for (const p of all) expect(p.runtime.client?.routing.target ?? '').toBe(pairing[p.id]);
  });

  it('a spectator connects to the host and receives the match outcomes without taking a seat', async () => {
    const { host, members } = await lobbyWith(2);
    await startMatch(host, members, {});
    const spec = w.peer('sam');
    await w.step(20);
    spec.lua.emit('ui_spectate', { code: code(host) as string });
    await w.until(() => !!spec.lua.last('lobby_view'), 10_000, 'spectator welcomed');
    expect(spec.lua.last('match_start')).toBeUndefined();
    ev(host, { t: 'set_ante', ante: 1 });
    ev(host, { t: 'ready_blind', starting_hands: 4 });
    ev(members[0] as Peer, { t: 'ready_blind', starting_hands: 4 });
    await w.until(() => spec.lua.outcomesOf('start_blind').length === 1, 5_000, 'spectator sees start_blind');
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'sam')?.role).toBe('spectator');
  });

  it('falls back to the hub relay when no direct path forms, and the match runs over it', async () => {
    const { host, members } = await lobbyWith(2, { blockDirect: [false, true] });
    const [bob] = members as [Peer];
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')?.conn).toBe('relay');
    await startMatch(host, members, { startingLives: 1 });
    for (const p of [host, bob]) ev(p, { t: 'ready_blind', starting_hands: 1 });
    await w.until(() => bob.lua.outcomesOf('start_blind').length === 1, 5_000, 'start over relay');
    ev(bob, { t: 'play_hand', score: '900', hands_left: 0, skips: 0 });
    ev(host, { t: 'play_hand', score: '10', hands_left: 0, skips: 0 });
    await w.until(() => bob.lua.outcomesOf('win').length > 0, 5_000, 'win over relay');
    expect(bob.lua.outcomesOf('win')[0]?.winner_id).toBe('bob');
  });

  it('keeps the relay link when the member falls back long after the host gave up on the direct path', async () => {
    // E2E-15 on a starved CI runner: the member's 8 s direct timer fired ~30 s late. The hub only
    // relays for a member that asked (relay:start), so a host link opened at its own timeout heard
    // nothing, timed out before the member arrived, and every rejoin repeated it.
    const host = w.peer('alice');
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!host.runtime.role?.code && code(host) === host.runtime.role.code, 5_000, 'hosted');
    host.connector.blockDirect = true;
    const bob = w.peer('bob', { blockDirect: true });
    bob.connector.directTimeoutMs = 30_000;
    await w.step(20);
    bob.lua.emit('ui_join', { code: code(host) as string });
    // Past the host's own direct timeout, before bob's: the host opened no relay link (the hub
    // would drop every frame of it until bob asks for the relay).
    await w.step(20_000, 50);
    expect(host.hub.emitted.filter((e) => e.event === 'balatro:p2p:relay')).toHaveLength(0);
    expect(bob.hub.emitted.filter((e) => e.event === 'balatro:p2p:relay:start')).toHaveLength(0);
    await w.until(() => bob.lua.last('lobby_view')?.state.players.length === 2, 45_000, 'bob welcomed over the relay');
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')?.conn).toBe('relay');
    // And it stays up: no link timeout, no rejoin.
    const joins = bob.hub.emitted.filter((e) => e.event === 'balatro:p2p:join').length;
    await w.step(30_000, 50);
    expect(bob.hub.emitted.filter((e) => e.event === 'balatro:p2p:join').length).toBe(joins);
    expect(bob.runtime.role?.kind).toBe('member');
  });

  it('a relayed member whose page stalls for 20 s loses nothing it sends when it resumes', async () => {
    // E2E-15 on CI: the relayed page stalled past the 10 s link timeout. The host closed its end,
    // but a relay close never reaches the member (a DataChannel's does), so the member's link
    // stayed open for another timeout and its Ready for the PvP blind went into the dead link:
    // the host never started the round.
    const { host, members } = await lobbyWith(2, { blockDirect: [false, true] });
    const [bob] = members as [Peer];
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')?.conn).toBe('relay');
    await startMatch(host, members, {});
    for (const p of [host, bob]) ev(p, { t: 'set_ante', ante: 1 });
    ev(host, { t: 'ready_blind', starting_hands: 4 });
    await w.step(1_000);
    bob.hub.freeze(true);
    await w.step(20_000, 50);
    bob.hub.freeze(false);
    ev(bob, { t: 'ready_blind', starting_hands: 4 });
    await w.until(() => bob.lua.outcomesOf('start_blind').length === 1, 30_000, 'start_blind after the stall');
    expect(host.lua.outcomesOf('start_blind')).toHaveLength(1);
  });

  it('a kicked player is gone and cannot come back', async () => {
    const { host, members } = await lobbyWith(2);
    const [bob] = members as [Peer];
    host.lua.emit('ui_kick', { userId: 'bob' });
    await w.until(() => bob.lua.errors().includes('kicked'), 5_000, 'kicked');
    expect(host.lua.last('lobby_view')?.state.players.map((p) => p.id)).toEqual(['alice']);
    expect(host.lua.last('lobby_view')?.state.kicked).toContain('bob');
    bob.lua.emit('ui_join', { code: code(host) as string });
    await w.until(() => bob.lua.errors().filter((e) => e === 'kicked').length >= 2, 5_000, 'refused');
  });

  it('member options are host-only, and production builds refuse the test-only seat grace', async () => {
    const host = w.peer('alice', { testBuild: false });
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!code(host) && !!host.runtime.role?.code, 5_000, 'hosted');
    host.lua.emit('ui_set_option', { key: 'seatGraceMs', value: 10_000 });
    host.lua.emit('ui_set_option', { key: 'startingLives', value: 7 });
    host.lua.emit('ui_set_option', { key: 'startingLives', value: 'lots' as never });
    const opts = host.lua.last('lobby_view')?.state.options;
    expect(opts?.seatGraceMs).toBe(120_000);
    expect(opts?.startingLives).toBe(7);
  });
});
