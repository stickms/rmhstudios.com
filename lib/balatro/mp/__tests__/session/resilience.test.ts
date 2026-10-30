/**
 * Connectivity (NET-04/05/06/07, REF-15/19/20): a member going silent and
 * coming back, a member gone past the seat grace (forfeit win), a reload
 * rejoin through the seat prompt with the IndexedDB snapshot restored, and a
 * host killed mid-PvP with the successor restoring the referee from the
 * checkpoint — whose final outcome must equal the uninterrupted referee's.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, code, ev, lobbyWith, startMatch, type Peer } from './world.test-support';
import { refCreate, refStep } from '../../referee/referee';
import type { RefCheckpoint, StartedMatch } from '../../types';

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

const presences = (p: Peer, id: string) => p.lua.all('presence').filter((x) => x.id === id).map((x) => x.status);

describe('presence and seat grace', () => {
  it('a member silent for 5 s is away, and back once it is heard again', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { seatGraceMs: 60_000 });
    bob.connector.partition(true);
    await w.until(() => presences(host, 'bob').includes('away'), 10_000, 'away');
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')?.away).toBe(true);
    bob.connector.partition(false);
    await w.until(() => presences(host, 'bob').includes('back'), 5_000, 'back');
    expect(host.lua.outcomesOf('player_won')).toEqual([]);
  });

  it('a member gone past the seat grace forfeits: the other player wins (REF-15)', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { seatGraceMs: 10_000 });
    bob.runtime.stop();
    bob.hub.drop();
    bob.connector.kill();
    await w.until(() => host.lua.outcomesOf('player_won').length > 0, 30_000, 'forfeit win');
    expect(host.lua.outcomesOf('player_won')[0]?.player_id).toBe('alice');
    expect(host.runtime.client?.result).toBe('win');
    expect(host.lua.last('lobby_view')?.state.forfeited.bob).toBe(host.lua.last('match_start')?.runId);
    expect(presences(host, 'bob')).toContain('forfeited');
    // The hub knows: bob's seat in this run is forfeited.
    expect(host.hub.emitted.some((e) => e.event === 'balatro:p2p:forfeit-seat')).toBe(true);
  });
});

describe('reload rejoin (NET-06)', () => {
  it('restores the IndexedDB snapshot through the seat prompt, catches up and keeps playing', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { seatGraceMs: 60_000, startingLives: 3 });
    const runId = bob.lua.last('match_start')?.runId as string;
    // Lua's redirected save_run: the files, then `snapshot`.
    bob.fs.writeFile('/rmh/mp/run.jkr', new Uint8Array([1, 2, 3, 4]));
    bob.fs.writeFile('/rmh/mp/state.json', '{"ante":2}');
    bob.lua.emit('snapshot', { runId });
    await w.until(() => bob.snapshots.all().length === 1, 2_000, 'snapshot stored');
    ev(host, { t: 'set_ante', ante: 1 });
    ev(host, { t: 'skip', skips: 1, score: '0', hands_left: 4 });

    // The tab reloads: the old session and socket vanish; storage survives.
    bob.runtime.stop();
    bob.hub.drop();
    bob.connector.kill();
    await w.until(() => presences(host, 'bob').includes('away'), 10_000, 'away');
    const bob2 = w.peer('bob', { intent: 'rejoin', kv: bob.kv, snapshots: bob.snapshots });
    await w.until(() => bob2.lua.errors().includes('seat-held'), 5_000, 'seat prompt');
    bob2.lua.emit('ui_seat', { op: 'rejoin' });
    await w.until(() => !!bob2.lua.last('rejoin_restore'), 10_000, 'rejoin_restore');
    expect(bob2.lua.last('match_start')?.runId).toBe(runId);
    expect(bob2.fs.readFile('/rmh/mp/run.jkr')).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(bob2.fs.readFile('/rmh/mp/state.json', { encoding: 'utf8' })).toBe('{"ante":2}');
    // The host resynced bob (REF-20) and sent the tail of alice's hands (NET-07).
    expect(bob2.lua.outcomesOf('player_lives').some((o) => o.player_id === 'alice' && o.lives === 3)).toBe(true);
    expect(bob2.lua.last('tail')?.id).toBe('alice');
    expect(presences(host, 'bob')).toContain('catching_up');
    // The restored run is live: the first flags past ante 0 → caught up.
    bob2.lua.emit('flags', {
      state: 'BLIND_SELECT', onPvp: false, ready: false, countdown: false, animBusy: false,
      paused: false, inShop: false, roundEval: false, handsLeft: 4, ante: 2,
    });
    await w.until(() => presences(host, 'bob').includes('caught_up'), 5_000, 'caught up');
    // And plays on.
    for (const p of [host, bob2]) ev(p, { t: 'ready_blind', starting_hands: 1 });
    await w.until(() => bob2.lua.outcomesOf('start_blind').length > 0, 5_000, 'start_blind after rejoin');
  });

  it('abandoning the held seat clears the hint and the snapshot', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { seatGraceMs: 60_000 });
    const runId = bob.lua.last('match_start')?.runId as string;
    bob.fs.writeFile('/rmh/mp/run.jkr', new Uint8Array([9]));
    bob.lua.emit('snapshot', { runId });
    await w.until(() => bob.snapshots.all().length === 1, 2_000, 'snapshot stored');
    bob.runtime.stop();
    bob.hub.drop();
    bob.connector.kill();
    const bob2 = w.peer('bob', { intent: 'rejoin', kv: bob.kv, snapshots: bob.snapshots });
    await w.until(() => bob2.lua.errors().includes('seat-held'), 5_000, 'seat prompt');
    bob2.lua.emit('ui_seat', { op: 'abandon' });
    await w.until(() => bob2.snapshots.all().length === 0, 2_000, 'snapshot gone');
    expect(bob2.kv.getItem('rmh-balatro-mp-rejoin')).toBeNull();
    expect(code(host)).not.toBeNull();
  });
});

describe('host migration (NET-05)', () => {
  it('a host killed mid-PvP is replaced; the successor restores the checkpoint and the match ends as it would have', async () => {
    const { host: alice, members } = await lobbyWith(w, 3, { queueMode: 'pvp_royale' });
    const [bob, carol] = members as [Peer, Peer];
    await startMatch(w, alice, members, { startingLives: 1, seatGraceMs: 10_000, timer: false });
    for (const p of [alice, bob, carol]) {
      ev(p, { t: 'set_ante', ante: 1 });
      ev(p, { t: 'ready_blind', starting_hands: 1 });
    }
    await w.until(() => carol.lua.outcomesOf('start_blind').length === 1, 5_000, 'PvP started');
    ev(bob, { t: 'play_hand', score: '100', hands_left: 0, skips: 0 });
    ev(carol, { t: 'play_hand', score: '50', hands_left: 0, skips: 0 });
    // Let the checkpoint with both hands reach everyone (coalesced at 250 ms).
    await w.step(1_000);
    const match = carol.lua.last('match_start') as StartedMatch;
    const held = (carol.runtime as unknown as { checkpoint: RefCheckpoint }).checkpoint;
    expect(held.players.bob?.score).toBe('100');
    const hsBefore = carol.runtime.client?.lastHs ?? -1;

    // The host's tab dies: no leave, no bye.
    alice.runtime.stop();
    alice.hub.drop();
    alice.connector.kill();

    await w.until(() => bob.runtime.role?.kind === 'host', 10_000, 'bob promoted');
    await w.until(() => carol.lua.all('host_changed').some((h) => h.hostId === 'bob'), 10_000, 'carol told');
    await w.until(() => carol.runtime.client?.result != null && bob.runtime.client?.result != null, 30_000, 'match over');
    expect(bob.runtime.client?.result).toBe('win');
    expect(carol.runtime.client?.result).toBe('lose');

    // hs stays monotonic across the migration, and nothing was applied twice.
    const hs = carol.lua.outcomes().map((o) => o.hs);
    expect([...hs].sort((a, b) => a - b)).toEqual(hs);
    expect(new Set(hs).size).toBe(hs.length);
    expect(hs.some((h) => h > hsBefore)).toBe(true);

    // Equivalence: the uninterrupted referee, from the same checkpoint, with alice's seat expiring.
    let s = refStep(refCreate(match), { t: 'restore', at: held.startedAt + 5_000, checkpoint: held, present: ['alice', 'bob', 'carol'] });
    s = refStep(s.state, { t: 'presence', at: held.startedAt + 20_000, id: 'alice', status: 'grace_expired' });
    const expected = s.over;
    const actual = carol.lua.outcomesOf('win').pop() ?? carol.lua.outcomesOf('player_won').pop();
    expect(actual).toEqual(expected);
    // The new host announced itself to the hub directory with carol as successor.
    const state = bob.hub.emitted.filter((e) => e.event === 'balatro:p2p:state').pop()?.data as { members: string[] };
    expect(state.members).toContain('carol');
  });

  it('a host that leaves on purpose forfeits first and hands over at once', async () => {
    const { host: alice, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    await startMatch(w, alice, members, { startingLives: 2 });
    alice.lua.emit('match_left', { how: 'leave' });
    await w.until(() => bob.runtime.role?.kind === 'host', 5_000, 'immediate promotion');
    await w.until(() => (carol.runtime.client?.routing.lives.alice ?? -1) === 0, 10_000, 'alice forfeited');
    await w.until(() => carol.lua.last('lobby_view')?.state.hostId === 'bob', 10_000, 'carol in bob\'s lobby');
    // The successor's referee has alice's forfeit (from the checkpoint she flushed before leaving).
    const hostRef = (bob.runtime.role as unknown as { driver: { state: { cp: RefCheckpoint } } }).driver;
    expect(hostRef.state.cp.players.alice?.forfeited).toBe(1);
  });
});
