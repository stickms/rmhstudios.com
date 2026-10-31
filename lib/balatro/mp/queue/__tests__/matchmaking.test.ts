/**
 * WS12 end to end at the TS level (I-01, I-04; E2E-17/18 without browsers):
 * real session runtimes (WS5) with `attach` on FakeNet links, the real hub
 * handlers (balatro-p2p + balatro-queue) on the fake socket.io world, Lua
 * replaced by the validating fake. FIND GAME → matched → casual lobby →
 * ruleset vote → trap vote → draft → match start; a party placed with a
 * solo player; an invite between mutual follows.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World, code, type Peer } from '../../__tests__/session/world.test-support';
import {
  handleBalatroQueueDisconnect,
  registerBalatroQueueHandlers,
  resetBalatroQueueForTests,
  setBalatroSocialStoreForTests,
} from '../../../../../server/socket-server/handlers/balatro-queue';
import { attach, isQueued, lastParty, RETURN_RETRY_MAX } from '../attach';
import { activeInviter, Inviter, INVITE_SETTLE_MS } from '../../invites';
import type { QueueMode } from '../../../net/events';

let w: World;
const detach: (() => void)[] = [];

function qpeer(id: string): Peer {
  const p = w.peer(id);
  registerBalatroQueueHandlers(w.hub.io, p.hub.socket as never);
  detach.push(attach(p.runtime));
  return p;
}

function drop(p: Peer): void {
  handleBalatroQueueDisconnect(w.hub.io, p.hub.socket as never);
  p.hub.drop();
}

const view = (p: Peer) => p.lua.last('queue_view');

/** Every connected voter votes `option` in the step on screen (ids from the setup view). */
function voteAll(ps: Peer[], option: string) {
  for (const p of ps) {
    const v = p.lua.last('setup_view');
    if (v && v.phase === 'voting' && v.kind !== 'draft') p.lua.emit('ui_vote', { stepId: v.stepId, option });
  }
}

/** Each draft actor picks the first open tile until the draft is done. */
async function draftAll(ps: Peer[]) {
  for (let i = 0; i < 12; i += 1) {
    const v = ps[0].lua.last('setup_view');
    if (!v || v.kind !== 'draft' || v.phase === 'done') return;
    const actor = ps.find((p) => p.id === v.draft?.actor);
    const tile = v.draft?.tiles.find((t) => t.state === 'open');
    if (actor && tile) actor.lua.emit('ui_draft', { stepId: v.stepId, key: tile.deck });
    await w.step(100);
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_762_000_000_000);
  w = new World();
});

afterEach(() => {
  for (const p of w.peers) expect(p.lua.invalid, `${p.id} sent Lua an invalid message`).toEqual([]);
  for (const d of detach.splice(0)) d();
  w.stop();
  resetBalatroQueueForTests();
  vi.useRealTimers();
});

describe('casual matchmaking end to end', () => {
  it('two FIND GAMEs meet, vote, draft and start a Nemesis match with the rolled ruleset and drafted deck', async () => {
    const a = qpeer('alice');
    const b = qpeer('bob');
    await w.step(20);
    a.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    await w.step(20);
    expect(view(a)).toEqual({ state: 'searching', queueMode: 'pvp_nemesis', waiting: 1 });
    expect(isQueued(a.runtime)).toBe(true);
    b.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    await w.until(() => a.runtime.role?.kind === 'host' && b.runtime.role?.kind === 'member', 5_000, 'casual roles');
    const lobbyCode = code(a);
    expect(lobbyCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(a.lua.last('lobby_view')?.state.kind).toBe('casual');
    // Auto-ready, then the host opens the ruleset vote on both screens.
    await w.until(() => b.lua.last('setup_view')?.kind === 'ruleset_vote', 10_000, 'ruleset vote on the member');
    expect(a.lua.last('setup_view')?.kind).toBe('ruleset_vote');
    expect(view(a)?.state).toBe('idle');
    voteAll([a, b], 'ruleset_mp_balanced');
    await w.until(() => b.lua.last('setup_view')?.kind === 'trap_vote', 10_000, 'trap vote');
    voteAll([a, b], 'traps_off');
    await w.until(() => b.lua.last('setup_view')?.kind === 'draft', 10_000, 'draft');
    await draftAll([a, b]);
    await w.until(() => !!a.lua.last('match_start') && !!b.lua.last('match_start'), 10_000, 'match start');
    const m = b.lua.last('match_start')!;
    expect(m.options.ruleset).toBe('ruleset_mp_balanced');
    expect(m.options.trapCards).toBe(false);
    const draft = a.lua.last('setup_view')!;
    expect(draft).toMatchObject({ kind: 'draft', phase: 'done' });
    expect(m.roster.map((r) => r.id).sort()).toEqual(['alice', 'bob']);
    expect(b.lua.errors()).toEqual([]);
    expect(a.lua.errors()).toEqual([]);
  });

  it('a 3-player Royale gathers for 10 s; votes time out; the match still starts', async () => {
    const ps = [qpeer('alice'), qpeer('bob'), qpeer('carol')];
    await w.step(20);
    for (const p of ps) p.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_royale' as QueueMode });
    await w.step(100);
    expect(ps.map((p) => view(p)?.waiting)).toEqual([3, 3, 3]);
    await w.until(() => ps[1].lua.last('setup_view')?.kind === 'draft', 60_000, 'votes time out into the draft');
    await draftAll(ps);
    await w.until(() => ps.every((p) => !!p.lua.last('match_start')), 30_000, 'match start');
    expect(ps[0].runtime.role?.kind).toBe('host');
    expect(ps[2].lua.last('match_start')!.roster).toHaveLength(3);
  });

  it('CANCEL ends the search; Practice is refused while queued (PR-05)', async () => {
    const a = qpeer('alice');
    await w.step(20);
    a.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_royale' });
    await w.step(20);
    a.lua.emit('ui_queue', { op: 'leave', queueMode: 'pvp_royale' });
    await w.step(20);
    expect(view(a)?.state).toBe('cancelled');
    a.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_royale' });
    await w.step(20);
    expect(isQueued(a.runtime)).toBe(true);
    a.lua.emit('ui_practice', { ruleset: 'ruleset_mp_balanced', deck: 'b_red', stake: 1 });
    await w.step(20);
    expect(a.lua.errors()).toContain('practice');
    expect(a.lua.last('practice_start')).toBeUndefined();
    expect(isQueued(a.runtime)).toBe(true);
    a.lua.emit('ui_queue', { op: 'leave', queueMode: 'pvp_royale' });
    await w.step(20);
    a.lua.emit('ui_practice', { ruleset: 'ruleset_mp_balanced', deck: 'b_red', stake: 1 });
    await w.step(20);
    expect(a.lua.last('practice_start')).toBeDefined();
  });

  it('a player already in a lobby, or offline, is refused', async () => {
    const a = qpeer('alice');
    await w.step(20);
    a.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.step(50);
    a.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    expect(a.lua.errors()).toContain('in-lobby');
    const b = qpeer('bob');
    await w.step(20);
    b.hub.status = 'offline';
    b.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    expect(b.lua.errors()).toContain('offline');
  });

  it("Find Game's live counts (A12): ui_queue_counts reaches the hub, queue_counts comes back; nothing when offline", async () => {
    const a = qpeer('alice');
    const b = qpeer('bob');
    await w.step(20);
    b.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_teams' });
    await w.step(20);
    a.lua.emit('ui_queue_counts', {});
    await w.step(20);
    const c = a.lua.last('queue_counts');
    expect(c?.counts).toHaveLength(5);
    expect(c?.counts.find((x) => x.queueMode === 'pvp_teams')).toEqual({ queueMode: 'pvp_teams', queued: 1, inGame: 0 });
    expect(b.lua.all('queue_counts')).toHaveLength(0); // only the asker is answered
    a.hub.status = 'offline';
    a.lua.emit('ui_queue_counts', {});
    await w.step(20);
    expect(a.lua.all('queue_counts')).toHaveLength(1);
    expect(a.lua.errors()).toEqual([]);
  });

  it('a party of two and a solo player land in one Royale lobby (MM-06, E2E-18)', async () => {
    const h = qpeer('alice');
    const m = qpeer('bob');
    const solo = qpeer('carol');
    await w.step(20);
    h.lua.emit('ui_create_lobby', { queueMode: 'pvp_royale', kind: 'party' });
    await w.until(() => !!code(h), 5_000, 'party hosted');
    const partyCode = code(h)!;
    m.lua.emit('ui_join', { code: partyCode });
    await w.until(() => h.lua.last('lobby_view')?.state.players.length === 2, 10_000, 'party joined');
    // Not ready yet: refused.
    h.lua.emit('ui_party_queue', { queueMode: 'pvp_royale' });
    expect(h.lua.errors()).toContain('party-not-ready');
    m.lua.emit('ui_ready', { ready: true });
    await w.until(() => h.lua.last('lobby_view')?.state.players.every((p) => p.id === 'alice' || p.ready) === true, 5_000, 'ready');
    h.lua.emit('ui_party_queue', { queueMode: 'pvp_royale' });
    await w.until(() => view(m)?.state === 'searching', 5_000, 'member sees the search');
    solo.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_royale' });
    await w.until(() => solo.lua.last('setup_view')?.kind === 'ruleset_vote', 30_000, 'ruleset vote');
    voteAll([h, m, solo], 'ruleset_mp_vanilla');
    await w.until(() => solo.lua.last('setup_view')?.kind === 'draft', 30_000, 'draft');
    await draftAll([h, m, solo]);
    await w.until(() => [h, m, solo].every((p) => !!p.lua.last('match_start')), 30_000, 'match start');
    const roster = solo.lua.last('match_start')!.roster.map((r) => r.id).sort();
    expect(roster).toEqual(['alice', 'bob', 'carol']);
    expect(lastParty(m.runtime)?.code).toBe(partyCode);
    expect(lastParty(h.runtime)?.members.sort()).toEqual(['alice', 'bob']);
    // The party host hosts the match lobby (it waited the earliest).
    expect(h.runtime.role?.kind).toBe('host');
    expect(h.runtime.role?.code).not.toBe(partyCode);
    expect(lastParty(h.runtime)?.token).toBeTruthy();
    expect(lastParty(m.runtime)?.token).toBeNull();
    // "Return to lobby XXXXXX" (MM-06): the old host re-hosts the same code; the member joins it.
    h.lua.emit('ui_join', { code: partyCode });
    await w.until(() => h.runtime.role?.code === partyCode && h.lua.last('lobby_view')?.state.kind === 'party', 10_000, 'party re-hosted');
    expect(h.runtime.role?.kind).toBe('host');
    m.lua.emit('ui_join', { code: partyCode });
    await w.until(() => h.lua.last('lobby_view')?.state.players.some((p) => p.id === 'bob') === true, 10_000, 'member back');
    expect(m.runtime.role?.kind).toBe('member');
  });

  /**
   * A party of two (`ids[0]` hosts, `ids[1]`) matched with `ids[2]` into a Royale that has
   * started. Fresh names per test: the hub's per-socket rate limits outlive a World.
   */
  async function partyMatchStarted(ids: [string, string, string]) {
    const h = qpeer(ids[0]);
    const m = qpeer(ids[1]);
    const solo = qpeer(ids[2]);
    await w.step(20);
    h.lua.emit('ui_create_lobby', { queueMode: 'pvp_royale', kind: 'party' });
    await w.until(() => !!code(h), 5_000, 'party hosted');
    const partyCode = code(h)!;
    m.lua.emit('ui_join', { code: partyCode });
    await w.until(
      () => h.lua.last('lobby_view')?.state.players.length === 2,
      10_000,
      'party joined',
    );
    m.lua.emit('ui_ready', { ready: true });
    await w.until(
      () =>
        h.lua.last('lobby_view')?.state.players.every((p) => p.id === ids[0] || p.ready) === true,
      5_000,
      'ready',
    );
    h.lua.emit('ui_party_queue', { queueMode: 'pvp_royale' });
    await w.until(() => view(m)?.state === 'searching', 5_000, 'member sees the search');
    solo.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_royale' });
    await w.until(
      () => solo.lua.last('setup_view')?.kind === 'ruleset_vote',
      30_000,
      'ruleset vote',
    );
    voteAll([h, m, solo], 'ruleset_mp_vanilla');
    await w.until(() => solo.lua.last('setup_view')?.kind === 'draft', 30_000, 'draft');
    await draftAll([h, m, solo]);
    await w.until(
      () => [h, m, solo].every((p) => !!p.lua.last('match_start')),
      30_000,
      'match start',
    );
    return { h, m, solo, partyCode };
  }

  it('"Return to lobby" clicked by the member before its host re-hosts: the join retries', async () => {
    const { h, m, partyCode } = await partyMatchStarted(['gina', 'hank', 'ivy']);
    // Both click at once: the member's join reaches the hub while the code is still unclaimed.
    m.lua.emit('ui_join', { code: partyCode });
    h.lua.emit('ui_join', { code: partyCode });
    await w.until(
      () => m.lua.last('lobby_view')?.state.code === partyCode,
      15_000,
      'member back in the party',
    );
    expect(h.runtime.role?.code).toBe(partyCode);
    expect(h.lua.last('lobby_view')?.state.players.some((p) => p.id === 'hank')).toBe(true);
    expect(m.runtime.role?.kind).toBe('member');
    expect(m.runtime.role?.code).toBe(partyCode);
    expect(m.lua.errors()).not.toContain('not-found');
  });

  it('a "Return to lobby" whose host never re-hosts gives up after RETURN_RETRY_MAX joins', async () => {
    const { h, m, partyCode } = await partyMatchStarted(['jack', 'kim', 'liam']);
    drop(h);
    const joins = () =>
      m.hub.emitted.filter(
        (e) => e.event === 'balatro:p2p:join' && (e.data as { code: string }).code === partyCode,
      ).length;
    const before = joins();
    m.lua.emit('ui_join', { code: partyCode });
    await w.until(() => m.lua.errors().includes('not-found'), 20_000, 'gave up');
    expect(joins() - before).toBe(1 + RETURN_RETRY_MAX);
    expect(m.runtime.role).toBeNull();
    // A later Return to lobby starts a fresh, equally bounded retry.
    m.lua.emit('ui_join', { code: partyCode });
    await w.step(20_000);
    expect(joins() - before).toBe(2 * (1 + RETURN_RETRY_MAX));
  });

  it('a party code taken meanwhile: the old host hosts under a fresh code', async () => {
    const h = qpeer('alice');
    await w.step(20);
    h.lua.emit('ui_create_lobby', { queueMode: 'pvp_royale', kind: 'party' });
    await w.until(() => !!code(h), 5_000, 'party hosted');
    const host = h.runtime.role as unknown as { hostToken: string | null; code: string };
    const reclaim = { code: 'ZZZZZZ', token: host.hostToken as string };
    // Someone else holds ZZZZZZ? Reclaiming a live room of another host is refused by the hub.
    const other = qpeer('dave');
    await w.step(20);
    other.lua.emit('ui_create_lobby', { queueMode: 'pvp_royale', kind: 'party' });
    await w.until(() => !!code(other), 5_000, 'other hosted');
    reclaim.code = code(other)!;
    h.lua.emit('ui_leave', {});
    await w.step(800);
    h.runtime.createLobby('pvp_royale', 'party', reclaim);
    await w.until(() => !!h.runtime.role?.code && h.runtime.role.code !== reclaim.code && !!h.lua.last('lobby_view'), 10_000, 'fresh code');
    expect(h.runtime.role?.kind).toBe('host');
    expect(h.lua.last('lobby_view')?.state.code).toBe(h.runtime.role?.code);
  });

  it('the elected host vanishing sends the other player back into the queue', async () => {
    const a = qpeer('alice');
    const b = qpeer('bob');
    await w.step(20);
    a.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    await w.step(10);
    // a drops right away (before it can host): b goes back to searching.
    b.lua.emit('ui_queue', { op: 'join', queueMode: 'pvp_nemesis' });
    await w.step(3);
    drop(a);
    await w.until(() => view(b)?.state === 'searching', 20_000, 'b searching again');
    expect(b.runtime.role).toBeNull();
  });
});

describe('invites end to end', () => {
  it('a lobby host invites a mutual follow: the friend’s game shows the invite and can join', async () => {
    setBalatroSocialStoreForTests({ isMutual: async () => true, notifyInvite: async () => undefined });
    const a = qpeer('alice');
    const f = qpeer('bob');
    await w.step(20);
    a.lua.emit('ui_create_lobby', { queueMode: 'pvp_nemesis', kind: 'private' });
    await w.until(() => !!code(a), 5_000, 'hosted');
    // One process holds both sessions, so the page registry points at the last attached one (bob's);
    // alice's popover would use her own session's Inviter.
    expect(activeInviter()).not.toBeNull();
    const sent = new Inviter(a.hub, w.sched).invite(code(a)!, 'bob');
    await w.until(() => f.lua.all('toast').some((t) => t.key === 'mp_invited'), 5_000, 'invite toast');
    expect(f.lua.all('toast').find((t) => t.key === 'mp_invited')?.vars).toEqual({ name: 'ALICE', code: code(a) });
    await w.step(INVITE_SETTLE_MS);
    expect(await sent).toBe('sent');
    f.lua.emit('ui_join', { code: code(a)! });
    await w.until(() => a.lua.last('lobby_view')?.state.players.length === 2, 10_000, 'friend joined');
  });
});
