/**
 * Every match shape end to end at the TS level (PLAN §6.2 I-03): Royale 4,
 * Manhunt 1+2, Teams 2v2, a 16-player Nemesis lobby, and a 1v1 over a lossy,
 * reordering network. Each peer's view of the referee must be the same
 * ordered outcome stream (everything addressed to `'*'`).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, ev, lobbyWith, startMatch, type Peer } from './world.test-support';
import type { RefMsg } from '../../types';

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

/** Outcomes every peer must agree on (broadcasts; per-player resyncs and speedruns excluded). */
const shared = (p: Peer) =>
  p.lua
    .outcomes()
    .filter((x) => x.o.t !== 'speedrun')
    .map((x) => `${x.hs}:${JSON.stringify(x.o)}`);

async function playRound(all: Peer[], scores: Record<string, string>, t: RefMsg['t'] = 'end_pvp') {
  const before = all.map((p) => p.lua.outcomesOf('start_blind').length);
  for (const p of all) ev(p, { t: 'ready_blind', starting_hands: 1 });
  await w.until(() => all.every((p, i) => p.lua.outcomesOf('start_blind').length > (before[i] as number)), 10_000, 'start_blind');
  const endsBefore = all.map((p) => p.lua.outcomesOf(t).length);
  for (const p of all) ev(p, { t: 'play_hand', score: scores[p.id] ?? '0', hands_left: 0, skips: 0 });
  await w.until(() => all.every((p, i) => p.lua.outcomesOf(t).length > (endsBefore[i] as number)), 10_000, t);
  await w.step(500);
}

describe('match shapes over the star', () => {
  it('Royale 4: rank-and-cut costs the lowest a life; every peer sees the same stream', async () => {
    const { host, members, all } = await lobbyWith(w, 4, { queueMode: 'pvp_royale' });
    await startMatch(w, host, members, { startingLives: 2, timer: false });
    for (const p of all) ev(p, { t: 'set_ante', ante: 1 });
    await playRound(all, { alice: '400', bob: '300', carol: '200', dave: '100' });
    expect(host.lua.outcomesOf('player_lives').some((o) => o.player_id === 'dave' && o.lost === 1)).toBe(true);
    for (const p of members) expect(shared(p)).toEqual(shared(host));
    // Live targets: everyone has one.
    for (const p of all) expect(p.runtime.client?.routing.target).toBeTruthy();
  });

  it('Manhunt 1+2: the Runner is the claimant; a better Hunter catches it', async () => {
    const { host, members, all } = await lobbyWith(w, 3, { queueMode: 'pvp_manhunt' });
    const [bob, carol] = members as [Peer, Peer];
    carol.lua.emit('ui_set_team', { team: 'RUNNER' });
    await w.until(() => host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'carol')?.team === 'RUNNER', 5_000, 'runner');
    await startMatch(w, host, members, { timer: false, manhuntHunterLives: 7 });
    await w.until(() => all.every((p) => p.lua.outcomesOf('team_roster').length > 0), 5_000, 'roster');
    expect(bob.lua.outcomesOf('team_roster')[0]?.roster.carol).toBe('RUNNER');
    for (const p of all) ev(p, { t: 'set_ante', ante: 1 });
    await playRound(all, { alice: '300', bob: '900', carol: '500' }, 'win');
    expect(host.lua.outcomesOf('win')[0]?.winner_team_id).toBe('HUNTER');
    expect(carol.runtime.client?.result).toBe('lose');
    expect(bob.runtime.client?.result).toBe('win');
    for (const p of members) expect(shared(p)).toEqual(shared(host));
  });

  it('Teams 2v2: team sums decide, one shared life, mirrored to each member', async () => {
    const { host, members, all } = await lobbyWith(w, 4, { queueMode: 'pvp_teams' });
    const [bob, carol, dave] = members as [Peer, Peer, Peer];
    host.lua.emit('ui_set_team', { team: 'A' });
    bob.lua.emit('ui_set_team', { team: 'A' });
    carol.lua.emit('ui_set_team', { team: 'B' });
    dave.lua.emit('ui_set_team', { team: 'B' });
    await w.until(() => host.lua.last('lobby_view')?.state.players.every((p) => !!p.team) === true, 5_000, 'teams');
    await startMatch(w, host, members, { startingLives: 3, timer: false });
    for (const p of all) ev(p, { t: 'set_ante', ante: 1 });
    await playRound(all, { alice: '100', bob: '100', carol: '150', dave: '100' });
    expect(host.lua.outcomesOf('team_lives').some((o) => o.team_id === 'A' && o.lives === 2)).toBe(true);
    expect(dave.lua.outcomesOf('team_score_board').length).toBeGreaterThan(0);
    for (const p of members) expect(shared(p)).toEqual(shared(host));
  });

  it('a 16-player Nemesis lobby starts and pairs everyone (no bye at 16)', async () => {
    const { host, members, all } = await lobbyWith(w, 16);
    expect(host.lua.last('lobby_view')?.state.players).toHaveLength(16);
    await startMatch(w, host, members, { timer: false });
    await w.until(() => all.every((p) => p.lua.outcomesOf('nemesis_pairing').length > 0), 10_000, 'pairing');
    const pairing = host.lua.outcomesOf('nemesis_pairing')[0]?.pairing ?? {};
    expect(Object.values(pairing).filter((v) => v === '')).toHaveLength(0);
    for (const p of all) expect(pairing[pairing[p.id] as string]).toBe(p.id);
    for (const p of members) expect(shared(p)).toEqual(shared(host));
  });

  it('a 1v1 completes over a lossy, jittery, reordering network', async () => {
    const { host, members, all } = await lobbyWith(w, 2, { path: { latencyMs: 40, jitterMs: 30, loss: 0.2, reorder: true } });
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { startingLives: 1, timer: false });
    for (const p of all) ev(p, { t: 'set_ante', ante: 1 });
    await playRound(all, { alice: '10', bob: '20' }, 'win');
    expect(bob.runtime.client?.result).toBe('win');
    expect(shared(bob)).toEqual(shared(host));
  });
});
