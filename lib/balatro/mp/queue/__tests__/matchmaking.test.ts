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
import { attach, isQueued, lastParty } from '../attach';
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

  it('CANCEL ends the search; Practice while queued ends it too (PR-05)', async () => {
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
    expect(isQueued(a.runtime)).toBe(false);
    expect(view(a)?.state).toBe('cancelled');
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
