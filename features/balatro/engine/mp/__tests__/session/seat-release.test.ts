/**
 * Seats across a deliberate Leave (docs/balatro-mp.md §Seats): a Leave gives
 * the seat up at once, so the very next Create / Join is accepted; a crash
 * keeps it for the rejoin prompt.
 *
 * The bug this pins (the e2e suite's E2E-01 → next create): a host's Leave
 * sends its hub `leave` after LEAVE_DRAIN_MS (the bye and a forfeit drain over
 * P2P first). A Create made inside that window reached the hub BEFORE the
 * leave, so the hub still saw the old room's seat and refused it with
 * `seat-held`. The runtime now holds every later hub emit until that leave
 * has gone out (HubGate), so the hub always sees leave → host.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, code, ev, lobbyWith, startMatch, type Peer } from './world.test-support';
import { LEAVE_DRAIN_MS } from '../../lobby/lobby-host';

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

const hubEvents = (p: Peer) => p.hub.emitted.map((e) => e.event);

/** A 1v1 played to alice's win (the end screen is up on both sides). */
async function playedMatch(): Promise<{ host: Peer; bob: Peer; firstCode: string }> {
  const { host, members } = await lobbyWith(w, 2);
  const [bob] = members as [Peer];
  const firstCode = code(host) as string;
  await startMatch(w, host, members, { startingLives: 1, timer: false });
  for (const p of [host, bob]) {
    ev(p, { t: 'set_ante', ante: 1 });
    ev(p, { t: 'ready_blind', starting_hands: 1 });
  }
  await w.until(() => host.lua.outcomesOf('start_blind').length === 1 && bob.lua.outcomesOf('start_blind').length === 1, 5_000, 'start_blind');
  ev(host, { t: 'play_hand', score: '600', hands_left: 0, skips: 0 });
  ev(bob, { t: 'play_hand', score: '200', hands_left: 0, skips: 0 });
  await w.until(() => host.runtime.client?.result === 'win' && bob.runtime.client?.result === 'lose', 5_000, 'result');
  return { host, bob, firstCode };
}

describe('a deliberate Leave releases the seat at once', () => {
  it('E2E-01 sequence: match end → Return to Lobby → Leave → an immediate Create is accepted', async () => {
    const { host, bob, firstCode } = await playedMatch();
    // Both press Return to Lobby on the end screen (LOB-17).
    host.lua.emit('match_left', { how: 'return_lobby' });
    bob.lua.emit('match_left', { how: 'return_lobby' });
    await w.until(() => host.lua.last('lobby_view')?.state.started === null && bob.lua.last('lobby_view')?.state.started === null, 5_000, 'back in the lobby');
    // The guest leaves, then the host; the host creates again straight away (no clock tick
    // between Leave and Create — the autopilot's next scenario does exactly this).
    bob.lua.emit('ui_leave', {});
    await w.step(50);
    host.lua.emit('ui_leave', {});
    expect(host.runtime.role).toBeNull();
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!host.runtime.role?.code && code(host) === host.runtime.role.code, 5_000, 'hosted again');
    expect(host.lua.errors()).not.toContain('seat-held');
    expect(code(host)).not.toBe(firstCode);
    // On the wire the leave reached the hub before the new room's claim.
    const ev2 = hubEvents(host);
    const leaveAt = ev2.lastIndexOf('balatro:p2p:leave');
    const hostAt = ev2.lastIndexOf('balatro:p2p:host');
    expect(leaveAt).toBeGreaterThan(-1);
    expect(hostAt).toBeGreaterThan(leaveAt);
    // The drained leave closed the old room only (the new one lives on past the drain).
    await w.step(LEAVE_DRAIN_MS * 4);
    expect(host.runtime.role?.code).toBe(code(host));
    expect(host.lua.errors()).toEqual([]);
  });

  it('a host that leaves a lobby with members and joins another lobby at once is admitted', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    const carol = w.peer('carol');
    await w.step(20);
    carol.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!code(carol), 5_000, 'carol hosted');
    host.lua.emit('ui_leave', {});
    host.lua.emit('ui_join', { code: code(carol) as string });
    await w.until(() => carol.lua.last('lobby_view')?.state.players.some((p) => p.id === 'alice') === true, 5_000, 'alice in carol\'s lobby');
    expect(host.lua.errors()).not.toContain('seat-held');
    // The old lobby was handed to bob (the leave still promoted its successor).
    await w.until(() => bob.runtime.role?.kind === 'host', 5_000, 'bob promoted');
  });
});

describe('a crash keeps the seat for the rejoin', () => {
  it('a member whose tab dies mid-match is refused a Create (seat-held) and can still rejoin', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    await startMatch(w, host, members, { seatGraceMs: 60_000 });
    const runId = bob.lua.last('match_start')?.runId as string;
    bob.runtime.stop();
    bob.hub.drop();
    bob.connector.kill();
    // The reloaded page asks the hub for its seat (NET-06) and gets the prompt…
    const bob2 = w.peer('bob', { kv: bob.kv, snapshots: bob.snapshots });
    const held = () => bob2.lua.errors().filter((e) => e === 'seat-held').length;
    await w.until(() => held() === 1, 5_000, 'seat prompt');
    // …and a Create meanwhile is refused: the seat is still held for the rejoin.
    bob2.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => held() === 2, 5_000, 'create refused with seat-held');
    expect(bob2.runtime.role).toBeNull();
    expect(bob2.hub.emitted.some((e) => e.event === 'balatro:p2p:leave')).toBe(false);
    bob2.lua.emit('ui_seat', { op: 'rejoin' });
    await w.until(() => bob2.lua.last('match_start')?.runId === runId, 10_000, 'back in the same run');
  });
});
