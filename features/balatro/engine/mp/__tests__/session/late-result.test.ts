/**
 * HUD-24 end to end at the TS level: a player who left a match (Leave, a closed tab) hears how it
 * ended. The host's referee finishes → the host (or its successor) reports the run to the real
 * hub handler → the hub sends each departed roster player their own line → that player's runtime
 * (still on /balatro, or a new page within the TTL) hands Lua `late_result`. Players still in the
 * match and spectators get nothing from this path.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, code, lobbyWith, startMatch, type Peer } from './world.test-support';

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

const runIdOf = (p: Peer) => p.lua.last('match_start')?.runId as string;
const over = (p: Peer) => p.lua.outcomesOf('win').length + p.lua.outcomesOf('player_won').length > 0;

describe('late result (HUD-24)', () => {
  it('leave → the match ends → the departed player gets their result; the winner gets none', async () => {
    const { host: alice, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, alice, members, { startingLives: 2 });
    const runId = runIdOf(bob);
    bob.lua.emit('match_left', { how: 'leave' });
    await w.until(() => over(alice), 10_000, 'alice wins by forfeit');
    await w.until(() => bob.lua.all('late_result').length > 0, 5_000, 'bob told');
    expect(bob.lua.all('late_result')).toEqual([{ runId, r: 'lost' }]);
    await w.step(10_000, 50); // the referee's win re-sends add nothing
    expect(bob.lua.all('late_result')).toHaveLength(1);
    expect(alice.lua.all('late_result')).toEqual([]);
  });

  it('host migration: the successor finishes the run and tells the departed host and player', async () => {
    const { host: alice, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    await startMatch(w, alice, members, { startingLives: 2 });
    const runId = runIdOf(bob);
    alice.lua.emit('match_left', { how: 'leave' });
    await w.until(() => bob.runtime.role?.kind === 'host', 5_000, 'bob promoted');
    await w.until(() => carol.lua.last('lobby_view')?.state.hostId === 'bob', 10_000, "carol in bob's lobby");
    carol.lua.emit('match_left', { how: 'leave' });
    await w.until(() => over(bob), 15_000, 'bob wins');
    await w.until(() => alice.lua.all('late_result').length > 0 && carol.lua.all('late_result').length > 0, 5_000, 'both told');
    expect(alice.lua.all('late_result')).toEqual([expect.objectContaining({ runId, r: 'lost' })]);
    expect(carol.lua.all('late_result')).toEqual([expect.objectContaining({ runId, r: 'lost' })]);
    expect(bob.lua.all('late_result')).toEqual([]);
  });

  it('a closed tab hears it from a new page opened within the TTL', async () => {
    const { host: alice, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, alice, members, { startingLives: 2 });
    const runId = runIdOf(bob);
    bob.lua.emit('match_left', { how: 'leave' });
    bob.runtime.stop();
    bob.hub.drop();
    await w.until(() => over(alice), 10_000, 'alice wins');
    await w.step(60_000, 500);
    const again = w.peer('bob');
    await w.until(() => again.lua.all('late_result').length > 0, 5_000, 'the new page is told');
    expect(again.lua.all('late_result')).toEqual([{ runId, r: 'lost' }]);
    // Handed over once: another page later hears nothing.
    const third = w.peer('bob');
    await w.step(1_000);
    expect(third.lua.all('late_result')).toEqual([]);
  });

  it('spectators never get it', async () => {
    const { host: alice, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, alice, members, { startingLives: 2 });
    const sam = w.peer('sam');
    await w.step(20);
    sam.lua.emit('ui_spectate', { code: code(alice) as string });
    await w.until(() => !!sam.lua.last('lobby_view'), 10_000, 'sam watching');
    sam.lua.emit('ui_leave', {});
    bob.lua.emit('match_left', { how: 'leave' });
    await w.until(() => over(alice) && bob.lua.all('late_result').length > 0, 10_000, 'match over');
    await w.step(1_000);
    expect(sam.lua.all('late_result')).toEqual([]);
  });
});
