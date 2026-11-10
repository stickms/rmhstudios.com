/**
 * NET-09: a hidden tab is a display-only "away". A player whose tab stays hidden for
 * HIDDEN_AWAY_AFTER_MS is announced `presence away` WITHOUT a grace (no seat-grace timer,
 * no referee presence, no timer suspension on the peers), and `back` when the tab shows
 * again. A link that also goes silent gets the normal graced away on top; the hidden
 * player never sees its own display-only away. Covers a member's tab (the `visibility`
 * wire kind) and the host's own.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, lobbyWith, startMatch, type Peer } from './world.test-support';
import { HIDDEN_AWAY_AFTER_MS, type LobbyHost } from '../../lobby/lobby-host';

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

const frames = (p: Peer, id: string) => p.lua.all('presence').filter((x) => x.id === id);
const statuses = (p: Peer, id: string) => frames(p, id).map((x) => x.status);
const lastStatus = (p: Peer, id: string) => statuses(p, id).at(-1);

/** A running 3-player match (alice hosts; bob and carol are members). */
async function match(seatGraceMs = 10_000) {
  const { host, members } = await lobbyWith(w, 3, { queueMode: 'pvp_royale' });
  const [bob, carol] = members as [Peer, Peer];
  await startMatch(w, host, members, { seatGraceMs });
  return { host, bob, carol };
}

describe('a member tab hidden (NET-09)', () => {
  it('peers see a display-only away after 2 s, with no grace, and back when it shows', async () => {
    const { host, bob, carol } = await match(10_000);
    const driver = (host.runtime.role as LobbyHost).driver;
    const refPresence = vi.spyOn(driver!, 'presence');
    const carolSuspend = vi.spyOn(carol.runtime.client!, 'suspend');

    bob.runtime.setHidden(true);
    await w.until(() => lastStatus(carol, 'bob') === 'away', 5_000, 'carol sees bob away');
    expect(lastStatus(host, 'bob')).toBe('away');
    expect(frames(carol, 'bob').at(-1)?.graceMsLeft).toBeUndefined();
    expect(frames(host, 'bob').at(-1)?.graceMsLeft).toBeUndefined();
    // Bob is never told about his own display-only away (it would read "Connection lost").
    expect(statuses(bob, 'bob')).toEqual([]);

    // Well past the 10 s seat grace: nothing forfeits, the referee never heard of it.
    await w.step(20_000, 50);
    expect(statuses(carol, 'bob')).toEqual(['away']);
    expect(host.lua.outcomesOf('player_won')).toEqual([]);
    expect(host.lua.last('lobby_view')?.state.forfeited.bob).toBeUndefined();
    expect(host.hub.emitted.some((e) => e.event === 'balatro:p2p:forfeit-seat')).toBe(false);
    expect(refPresence).not.toHaveBeenCalled();
    expect(carolSuspend).not.toHaveBeenCalledWith(true);
    // The lobby row is not a link-away either (it would block a start and the successor).
    expect(host.lua.last('lobby_view')?.state.players.find((p) => p.id === 'bob')?.away).toBe(false);

    bob.runtime.setHidden(false);
    await w.until(() => lastStatus(carol, 'bob') === 'back', 2_000, 'carol sees bob back');
    expect(lastStatus(host, 'bob')).toBe('back');
    expect(statuses(bob, 'bob')).toEqual([]);
    expect(refPresence).not.toHaveBeenCalled();
  });

  it('is debounced: hiding for less than 2 s (alt-tab) announces nothing', async () => {
    const { host, bob, carol } = await match();
    for (let i = 0; i < 5; i++) {
      bob.runtime.setHidden(true);
      await w.step(HIDDEN_AWAY_AFTER_MS - 500, 50);
      bob.runtime.setHidden(false);
      await w.step(300, 50);
    }
    await w.step(5_000, 50);
    expect(statuses(host, 'bob')).toEqual([]);
    expect(statuses(carol, 'bob')).toEqual([]);
    // Repeated `hidden` reports do not restart the debounce.
    bob.runtime.setHidden(true);
    await w.step(1_000, 50);
    bob.runtime.setHidden(true);
    await w.until(() => lastStatus(carol, 'bob') === 'away', HIDDEN_AWAY_AFTER_MS, 'away 2 s after the first hide');
    expect(statuses(carol, 'bob')).toEqual(['away']);
  });

  it('a hidden tab whose link also goes silent gets the normal graced away and forfeits', async () => {
    const { host, bob, carol } = await match(10_000);
    bob.runtime.setHidden(true);
    await w.until(() => lastStatus(carol, 'bob') === 'away', 5_000, 'display-only away');
    // The network is gone (no relay through the hub either): the link goes silent for good.
    bob.connector.partition(true);
    bob.hub.drop();
    await w.until(() => frames(host, 'bob').some((f) => f.graceMsLeft !== undefined), 10_000, 'graced away');
    await w.until(() => statuses(host, 'bob').includes('forfeited'), 30_000, 'forfeit');
    await w.until(() => statuses(carol, 'bob').includes('forfeited'), 2_000, 'carol hears the forfeit');
    expect(statuses(host, 'bob')).toContain('forfeited');
    expect(host.lua.last('lobby_view')?.state.forfeited.bob).toBe(host.lua.last('match_start')?.runId);
  });

  it('the link coming back while still hidden shows the display-only away again; showing ends it', async () => {
    const { host, bob, carol } = await match(60_000);
    bob.runtime.setHidden(true);
    await w.until(() => lastStatus(carol, 'bob') === 'away', 5_000, 'display-only away');
    bob.connector.partition(true);
    await w.until(() => frames(host, 'bob').some((f) => f.graceMsLeft !== undefined), 10_000, 'graced away');
    const carolSuspend = vi.spyOn(carol.runtime.client!, 'suspend');
    bob.connector.partition(false);
    await w.until(() => statuses(host, 'bob').includes('back'), 10_000, 'link back');
    await w.step(200, 20);
    // back (the link) then the display-only away (the tab), in that order.
    expect(statuses(host, 'bob').slice(-2)).toEqual(['back', 'away']);
    expect(frames(host, 'bob').at(-1)?.graceMsLeft).toBeUndefined();
    expect(lastStatus(carol, 'bob')).toBe('away');
    expect(carolSuspend).not.toHaveBeenCalledWith(true);
    // Bob's own banner: his link-away was cleared by the back, and he never sees the display one.
    expect(lastStatus(bob, 'bob')).toBe('back');

    bob.runtime.setHidden(false);
    await w.until(() => lastStatus(carol, 'bob') === 'back', 2_000, 'visible');
    expect(lastStatus(host, 'bob')).toBe('back');
    expect(host.lua.outcomesOf('player_won')).toEqual([]);
  });

  it('a tab shown while its link was silent does not stay away once the link returns', async () => {
    const { host, bob, carol } = await match(60_000);
    bob.runtime.setHidden(true);
    await w.until(() => lastStatus(carol, 'bob') === 'away', 5_000, 'display-only away');
    bob.connector.partition(true);
    await w.until(() => frames(host, 'bob').some((f) => f.graceMsLeft !== undefined), 10_000, 'graced away');
    bob.runtime.setHidden(false); // lost in the partition (or never sent)
    bob.connector.partition(false);
    await w.until(() => statuses(host, 'bob').includes('back'), 10_000, 'link back');
    await w.step(1_000, 20);
    expect(lastStatus(host, 'bob')).toBe('back');
    expect(lastStatus(carol, 'bob')).toBe('back');
  });

  it('a spectator hiding its tab is not announced', async () => {
    const { host, bob } = await match();
    expect(bob).toBeTruthy();
    const eve = w.peer('erin');
    await w.step(20);
    eve.lua.emit('ui_spectate', { code: host.runtime.role?.code as string });
    await w.until(() => !!eve.lua.last('lobby_view'), 10_000, 'spectating');
    eve.runtime.setHidden(true);
    await w.step(5_000, 50);
    expect(statuses(host, 'erin')).toEqual([]);
  });
});

describe("the host's own tab hidden (NET-09)", () => {
  it('members see the host away after 2 s and back on return; the host itself is not told', async () => {
    const { host, bob, carol } = await match(10_000);
    const refPresence = vi.spyOn((host.runtime.role as LobbyHost).driver!, 'presence');
    host.runtime.setHidden(true);
    await w.step(HIDDEN_AWAY_AFTER_MS - 200, 50);
    expect(statuses(bob, 'alice')).toEqual([]);
    await w.until(() => lastStatus(bob, 'alice') === 'away' && lastStatus(carol, 'alice') === 'away', 2_000, 'members see the host away');
    expect(frames(bob, 'alice').at(-1)?.graceMsLeft).toBeUndefined();
    expect(statuses(host, 'alice')).toEqual([]);
    await w.step(15_000, 50);
    expect(host.lua.outcomesOf('player_won')).toEqual([]);
    expect(refPresence).not.toHaveBeenCalled();

    const before = host.lua.all('lobby_view').length;
    host.runtime.setHidden(false);
    await w.until(() => lastStatus(bob, 'alice') === 'back' && lastStatus(carol, 'alice') === 'back', 2_000, 'host back');
    expect(statuses(host, 'alice')).toEqual([]);
    // The existing return refresh still runs (the lobby view is re-sent).
    expect(host.lua.all('lobby_view').length).toBeGreaterThan(before);
  });

  it('a host that becomes host while hidden carries the hidden tab into the role, and a joiner learns it', async () => {
    const host = w.peer('alice');
    await w.step(20);
    host.runtime.setHidden(true);
    host.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!host.runtime.role?.code && host.lua.last('lobby_view')?.state.code === host.runtime.role.code, 5_000, 'hosted');
    await w.step(HIDDEN_AWAY_AFTER_MS + 100, 50); // announced before anyone is there to hear it
    const bob = w.peer('bob');
    await w.step(20);
    bob.lua.emit('ui_join', { code: host.runtime.role?.code as string });
    await w.until(() => bob.lua.last('lobby_view')?.state.players.length === 2, 10_000, 'joined');
    host.runtime.setHidden(false);
    await w.until(() => lastStatus(bob, 'alice') === 'back', 2_000, 'host back');
    expect(statuses(bob, 'alice')).toEqual(['away', 'back']);
  });
});
