/**
 * Trust, limits and the local paths (I-05, D-35, D-36, NET-10, PR-02, TIM-02):
 * host-only kinds and forged `f` from members, rate-limit floods, chat
 * sanitising/limits/mute, the content-hash gate at the hub and in `hello`,
 * the practice session's degenerate referee, and the ante timer press
 * travelling to the opponent.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OTHER_HASH, World, code, ev, lobbyWith, startMatch, type Peer } from './world.test-support';
import type { WireLink } from '../../transport/wire-link';

let w: World;

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

/** The member's raw link to its host (to misbehave on purpose). */
const rawLink = (p: Peer) => (p.runtime.role as unknown as { link: { link: WireLink } }).link.link;

describe('spoofing and floods (I-05)', () => {
  it('drops host-only kinds from members and ignores a forged `f`', async () => {
    const { host, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    await startMatch(w, host, members, { startingLives: 4 });
    await w.step(500);
    const before = carol.lua.outcomes().length;
    rawLink(bob).send('outcome', { o: { t: 'player_lives', player_id: 'carol', lives: 0 }, hs: 999_999 });
    rawLink(bob).send('lobby', { version: 999_999, state: host.lua.last('lobby_view')!.state });
    rawLink(bob).send('nemesis_info', { score: '5', hands_left: 3, skips: 0, lives: 4 }, { f: 'carol' });
    rawLink(bob).send('chat', { text: 'hi', system: true }, { f: 'alice' });
    await w.step(500);
    expect(carol.lua.outcomes().length).toBe(before);
    expect(host.lua.outcomes().length).toBe(before);
    expect(carol.lua.last('lobby_view')?.state.version).toBeLessThan(999_999);
    // Relayed, but as bob's: the host stamps the real sender.
    const info = carol.lua.all('peer').filter((p) => p.k === 'nemesis_info');
    expect(info.map((p) => p.from)).toEqual(['bob']);
    const lines = carol.lua.all('chat_line');
    expect(lines.map((l) => [l.from, l.kind])).toEqual([['bob', 'in']]);
  });

  it('rate-limits a flooding member (40/s, burst 100) and drops garbage frames', async () => {
    const { host, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    await startMatch(w, host, members, {});
    await w.step(200);
    for (let i = 0; i < 300; i++) rawLink(bob).send('location', { loc: `loc_${i}` });
    await w.step(500);
    const got = carol.lua.all('peer').filter((p) => p.k === 'location' && p.from === 'bob').length;
    expect(got).toBeGreaterThanOrEqual(90); // the burst, less what the hello and game traffic used
    expect(got).toBeLessThan(150);
    // A malformed envelope (bad `d`) is dropped and counted, never thrown.
    rawLink(bob).send('ready', { ready: 'yes' } as never);
    await w.step(100);
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')).toBeDefined();
  });
});

describe('chat (D-35)', () => {
  it('relays through the host, sanitises, limits to a burst of 5 then 1/s, and honours mute', async () => {
    const { host, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    bob.lua.emit('ui_chat', { text: '  hello\u0007‮   world  ' });
    await w.until(() => carol.lua.all('chat_line').length === 1, 2_000, 'first line');
    expect(carol.lua.last('chat_line')).toEqual({ from: 'bob', name: 'BOB', text: 'hello world', kind: 'in' });
    expect(bob.lua.last('chat_line')?.kind).toBe('own');
    expect(host.lua.last('chat_line')?.text).toBe('hello world');
    // Undrawable code points become '?' (no glyph table mounted: ASCII only).
    bob.lua.emit('ui_chat', { text: 'gg 😀' });
    await w.until(() => carol.lua.all('chat_line').length === 2, 2_000, 'emoji line');
    expect(carol.lua.last('chat_line')?.text).toBe('gg ?');
    for (let i = 0; i < 10; i++) bob.lua.emit('ui_chat', { text: `spam ${i}` });
    await w.step(300);
    expect(carol.lua.all('chat_line').length).toBe(5); // 2 + the 3 tokens left in the burst
    carol.lua.emit('ui_mute', { userId: 'bob', on: true });
    await w.step(3_000);
    bob.lua.emit('ui_chat', { text: 'muted?' });
    await w.step(300);
    expect(carol.lua.all('chat_line').some((l) => l.text === 'muted?')).toBe(false);
    expect(host.lua.all('chat_line').some((l) => l.text === 'muted?')).toBe(true);
    expect(JSON.parse(carol.kv.getItem('rmh-balatro-mp-settings') ?? '{}').muted).toEqual(['bob']);
  });
});

describe('chat mutes seeded from the site block list', () => {
  it('a blocked sender is muted from the start, and not saved with the player\'s own mutes', async () => {
    const host = w.peer('alice');
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_royale', kind: 'private' });
    await w.until(() => !!code(host), 5_000, 'hosted');
    const carol = w.peer('carol', { blockedIds: async () => ['bob', 7 as never, '', 'x'.repeat(65)] });
    const bob = w.peer('bob');
    await w.step(20);
    carol.lua.emit('ui_join', { code: code(host) as string });
    bob.lua.emit('ui_join', { code: code(host) as string });
    await w.until(() => host.lua.last('lobby_view')?.state.players.length === 3, 30_000, 'everyone in');
    expect([...carol.runtime.chat.muted]).toEqual(['bob']);
    bob.lua.emit('ui_chat', { text: 'blocked?' });
    host.lua.emit('ui_chat', { text: 'hi all' });
    await w.until(() => carol.lua.all('chat_line').some((l) => l.text === 'hi all'), 2_000, 'host line');
    expect(carol.lua.all('chat_line').some((l) => l.text === 'blocked?')).toBe(false);
    carol.lua.emit('ui_mute', { userId: 'alice', on: true });
    expect(JSON.parse(carol.kv.getItem('rmh-balatro-mp-settings') ?? '{}').muted).toEqual(['alice']);
  });

  it('a failing block list request leaves chat as it was', async () => {
    const dave = w.peer('dave', { blockedIds: async () => { throw new Error('401'); } });
    await w.step(50);
    expect(dave.runtime.chat.muted.size).toBe(0);
    expect(dave.logs.some((l) => l.includes('block list unavailable'))).toBe(true);
  });
});

describe('version gate (D-36)', () => {
  it('the hub refuses a member built from different packs', async () => {
    const host = w.peer('alice');
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!host.runtime.role?.code && !!code(host), 5_000, 'hosted');
    const bob = w.peer('bob', { contentHash: OTHER_HASH });
    await w.step(20);
    bob.lua.emit('ui_join', { code: code(host) as string });
    await w.until(() => bob.lua.errors().includes('version-mismatch'), 5_000, 'refused');
  });

  it('the host refuses a `hello` with another content hash', async () => {
    const host = w.peer('alice');
    await w.step(20);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!host.runtime.role?.code && !!code(host), 5_000, 'hosted');
    const bob = w.peer('bob');
    await w.step(20);
    bob.lua.emit('ui_join', { code: code(host) as string });
    await w.step(4);
    (bob.runtime.deps as { contentHash: string }).contentHash = OTHER_HASH; // the hub saw the right one
    await w.until(() => bob.lua.errors().includes('version-mismatch'), 5_000, 'bye');
    expect(host.lua.last('lobby_view')?.state.players.map((p) => p.id)).toEqual(['alice']);
  });
});

describe('practice (PR-02, REF-24)', () => {
  it('runs a local session: start_blind on ready, end_pvp after the last hand, no network', async () => {
    const p = w.peer('solo');
    await w.step(20);
    p.lua.emit('ui_practice', { ruleset: 'ruleset_mp_balanced', deck: 'b_red', stake: 1, seed: null });
    await w.until(() => !!p.lua.last('practice_start'), 2_000, 'practice_start');
    expect(p.lua.last('practice_start')?.resolved.key).toBe('ruleset_mp_balanced');
    ev(p, { t: 'set_ante', ante: 2 });
    ev(p, { t: 'ready_blind', starting_hands: 2 });
    await w.until(() => p.lua.outcomesOf('start_blind').length === 1, 2_000, 'start_blind');
    ev(p, { t: 'play_hand', score: '100', hands_left: 1, skips: 0 });
    ev(p, { t: 'play_hand', score: '300', hands_left: 0, skips: 0 });
    await w.until(() => p.lua.outcomesOf('end_pvp').length === 1, 2_000, 'end_pvp');
    expect(p.lua.outcomesOf('end_pvp')[0]).toEqual({ t: 'end_pvp', loser_id: '', pvp_timer_lost: false });
    expect(p.lua.outcomesOf('player_lives').every((o) => o.lives > 0)).toBe(true);
    expect(p.hub.emitted.filter((e) => e.event !== 'balatro:seat:query')).toEqual([]);
    p.lua.emit('match_left', { how: 'leave' });
    expect(p.lua.last('history')).toMatchObject({ games: 1, pvpGames: 0 });
  });

  it('refuses an unknown ruleset', async () => {
    const p = w.peer('solo');
    await w.step(20);
    p.lua.emit('ui_practice', { ruleset: 'ruleset_mp_nope', deck: 'b_red', stake: 1, seed: null });
    await w.until(() => p.lua.errors().includes('invalid'), 2_000, 'refused');
  });
});

describe('timers (TIM-02 driver)', () => {
  it('a ready player presses the ante timer; the opponent adopts the value and ticks; at 0 it fails', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { timerBaseSeconds: 30, timerForgiveness: 0, startingLives: 3 });
    const flags = (ready: boolean) => ({
      state: 'BLIND_SELECT', onPvp: false, ready, countdown: false, animBusy: false,
      paused: false, inShop: false, roundEval: false, handsLeft: 4, ante: 1,
    });
    host.lua.emit('flags', flags(true));
    bob.lua.emit('flags', flags(false));
    await w.until(() => host.lua.last('timer_state')?.pressable === true, 2_000, 'pressable');
    host.lua.emit('timer_input', { op: 'press' });
    await w.until(() => bob.lua.last('timer_state')?.beingTimered === true, 2_000, 'opponent timered');
    expect(bob.lua.all('timer_cue').length).toBe(1);
    const v0 = bob.lua.last('timer_state')?.value as number;
    await w.step(5_000, 50);
    expect(bob.lua.last('timer_state')?.value as number).toBeLessThan(v0 - 4);
    await w.until(() => (bob.runtime.client?.routing.lives.bob ?? 3) < 3, 60_000, 'fail_timer cost a life');
    expect(host.lua.outcomesOf('player_lives').some((o) => o.player_id === 'bob' && o.lost === 1)).toBe(true);
  });
});
