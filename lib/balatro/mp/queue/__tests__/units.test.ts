/**
 * WS12 client units: the setup host driver (I-04: votes and draft with
 * timeouts and disconnects mid-vote), the queue client, the inviter, the
 * casual host controller and party checks — on a hand-cranked clock.
 */

import { describe, expect, it } from 'vitest';
import { SetupHostDriver, type SetupResult } from '../../setup/host-driver';
import { VOTE_TIMING } from '../../setup/votes';
import { DRAFT_TIMING } from '../../setup/draft';
import { QueueClient, type QueueMatched, type QueueView } from '../queue-client';
import { CASUAL_TIMING, CasualHost, autoReady, type CasualLobbyHost } from '../casual';
import { partyQueueBlock, rememberParty } from '../party';
import { INVITE_SETTLE_MS, Inviter, inviteFriend, setActiveInviter, INBOX_MAX } from '../../invites';
import type { BalatroS2CEvent, BalatroS2CPayload } from '../../../net/events';
import type { HubLike, HubStatus } from '../../transport/types';
import type { HostIntent } from '../../lobby/context';
import type { LobbyState, SetupView } from '../../types';
import { zSetupView } from '../../types';
import { createLobby, addPlayer, setReady } from '../../lobby/lobby-reducer';

/* ─── A hand-cranked clock ───────────────────────────────────────────────── */

class Clock {
  t = 1_000_000;
  private timers: { at: number; fn: () => void; live: boolean; every?: number }[] = [];
  now = () => this.t;
  after = (ms: number, fn: () => void) => {
    const e = { at: this.t + ms, fn, live: true };
    this.timers.push(e);
    return () => void (e.live = false);
  };
  every = (ms: number, fn: () => void) => {
    const e = { at: this.t + ms, fn, live: true, every: ms };
    this.timers.push(e);
    return () => void (e.live = false);
  };
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.live && x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.t = due.at;
      if (due.every) due.at += due.every;
      else due.live = false;
      due.fn();
    }
    this.t = end;
    this.timers = this.timers.filter((x) => x.live);
  }
}

let seed = 1;
const randomInt = () => (seed = (seed * 48271) % 0x7fffffff);

/* ─── Setup host driver ──────────────────────────────────────────────────── */

function driver(o: Partial<ConstructorParameters<typeof SetupHostDriver>[1]> = {}) {
  const clock = new Clock();
  const views: SetupView[] = [];
  let result: SetupResult | null = null;
  const d = new SetupHostDriver(
    {
      now: clock.now,
      after: clock.after,
      randomInt,
      publish: (v) => {
        expect(zSetupView.safeParse(v).success, JSON.stringify(v)).toBe(true);
        views.push(v);
      },
      done: (r) => (result = r),
    },
    { kind: 'casual', queueMode: 'pvp_nemesis', players: ['a', 'b'], ...o },
  );
  return { d, clock, views, result: () => result, last: () => views[views.length - 1] };
}

/** Play the current draft step to the end with each actor choosing the first open tile. */
function playDraft(x: ReturnType<typeof driver>) {
  for (let i = 0; i < 20 && !x.result(); i += 1) {
    const v = x.last();
    if (v.kind !== 'draft' || !v.draft?.actor) break;
    const tile = v.draft.tiles.find((t) => t.state === 'open')!;
    x.d.input({ from: v.draft.actor, kind: 'draft', stepId: v.stepId, value: tile.deck });
  }
}

describe('SetupHostDriver', () => {
  it('runs the ruleset vote, closes early once everyone voted, rolls, reveals, then the trap vote and the draft', () => {
    const x = driver();
    x.d.start();
    const rv = x.last();
    expect(rv).toMatchObject({ kind: 'ruleset_vote', phase: 'voting', voters: 2, voted: 0, result: null });
    expect(rv.options.map((o) => o.id)).toEqual(['ruleset_mp_vanilla', 'ruleset_mp_majorleague', 'ruleset_mp_balanced', 'ruleset_mp_expanded']);
    // Hidden until close: no counts in the view.
    x.d.input({ from: 'a', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_balanced' });
    expect(x.last().options.every((o) => o.count === undefined)).toBe(true);
    expect(x.last().voted).toBe(1);
    x.d.input({ from: 'b', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_balanced' });
    expect(x.last()).toMatchObject({ phase: 'rolling', result: 'ruleset_mp_balanced' });
    x.clock.advance(VOTE_TIMING.ROLL_MS);
    expect(x.last()).toMatchObject({ phase: 'reveal' });
    expect(x.last().options.find((o) => o.id === 'ruleset_mp_balanced')).toMatchObject({ count: 2, chance: 1 });
    x.clock.advance(VOTE_TIMING.REVEAL_MS);
    const tv = x.last();
    expect(tv).toMatchObject({ kind: 'trap_vote', phase: 'voting' });
    expect(tv.options.map((o) => o.id)).toEqual(['traps_on', 'traps_off']);
    x.d.input({ from: 'a', kind: 'vote', stepId: tv.stepId, value: 'traps_on' });
    x.d.input({ from: 'b', kind: 'vote', stepId: tv.stepId, value: 'traps_on' });
    x.clock.advance(VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    expect(x.last()).toMatchObject({ kind: 'draft', phase: 'voting' });
    expect(x.last().draft?.tiles).toHaveLength(DRAFT_TIMING.POOL_SIZE);
    playDraft(x);
    expect(x.last()).toMatchObject({ kind: 'draft', phase: 'done' });
    const r = x.result()!;
    expect(r.ruleset).toBe('ruleset_mp_balanced');
    expect(r.trapCards).toBe(true);
    expect(x.last().result).toBe(r.deck);
    expect(r.stake).toBeGreaterThanOrEqual(1);
    expect(x.d.done).toBe(true);
  });

  it('skips the trap vote after Vanilla or Major League', () => {
    const x = driver();
    x.d.start();
    const rv = x.last();
    for (const p of ['a', 'b']) x.d.input({ from: p, kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_vanilla' });
    x.clock.advance(VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    expect(x.last().kind).toBe('draft');
    playDraft(x);
    expect(x.result()).toMatchObject({ ruleset: 'ruleset_mp_vanilla', trapCards: null });
  });

  it('closes at the deadline with nobody voting (uniform roll) and draft turns time out at random', () => {
    const x = driver({ players: ['a', 'b', 'c'], queueMode: 'pvp_royale' });
    x.d.start();
    x.clock.advance(VOTE_TIMING.DEFAULT_WINDOW_MS + VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    // maybe a trap vote; let everything time out
    x.clock.advance(VOTE_TIMING.DEFAULT_WINDOW_MS + VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    expect(x.last().kind).toBe('draft');
    x.clock.advance(DRAFT_TIMING.TURN_MS * 9);
    expect(x.result()).not.toBeNull();
    expect(x.last()).toMatchObject({ kind: 'draft', phase: 'done' });
    expect(x.last().draft?.tiles.filter((t) => t.state === 'picked')).toHaveLength(1);
  });

  it('closes a vote early when the only one still to vote disconnects (D-11)', () => {
    const x = driver();
    x.d.start();
    const rv = x.last();
    x.d.input({ from: 'a', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_expanded' });
    x.d.presence(['a']);
    expect(x.last()).toMatchObject({ phase: 'rolling', result: 'ruleset_mp_expanded', voters: 1 });
  });

  it('ignores stale step ids, strangers, double casts and draft picks out of turn', () => {
    const x = driver();
    x.d.start();
    const rv = x.last();
    x.d.input({ from: 'a', kind: 'vote', stepId: 'old-step', value: 'ruleset_mp_vanilla' });
    x.d.input({ from: 'zed', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_vanilla' });
    x.d.input({ from: 'a', kind: 'draft', stepId: rv.stepId, value: 'b_red' });
    expect(x.last().voted).toBe(0);
    x.d.input({ from: 'a', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_vanilla' });
    x.d.input({ from: 'a', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_expanded' });
    expect(x.last().voted).toBe(1);
    x.d.input({ from: 'b', kind: 'vote', stepId: rv.stepId, value: 'random' });
    x.clock.advance(VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    if (x.last().kind === 'trap_vote') {
      const tv = x.last();
      x.d.input({ from: 'a', kind: 'vote', stepId: rv.stepId, value: 'traps_on' }); // the old step id
      expect(x.last().voted).toBe(0);
      x.clock.advance(VOTE_TIMING.DEFAULT_WINDOW_MS + VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
      expect(tv.stepId).not.toBe(rv.stepId);
    }
    const dv = x.last();
    expect(dv.kind).toBe('draft');
    const notActor = dv.draft!.actor === 'a' ? 'b' : 'a';
    const open = dv.draft!.tiles.filter((t) => t.state === 'open').length;
    x.d.input({ from: notActor, kind: 'draft', stepId: dv.stepId, value: dv.draft!.tiles[0].deck });
    expect(x.last().draft!.tiles.filter((t) => t.state === 'open')).toHaveLength(open);
  });

  it('Small World skips the votes and drafts on its own ruleset; a private lobby runs nothing', () => {
    const sw = driver({ queueMode: 'pvp_smallworld', defaultRuleset: 'ruleset_mp_smallworld' });
    sw.d.start();
    expect(sw.last().kind).toBe('draft');
    playDraft(sw);
    expect(sw.result()).toMatchObject({ ruleset: 'ruleset_mp_smallworld', trapCards: null });
    const priv = driver({ kind: 'private' });
    priv.d.start();
    expect(priv.views).toEqual([]);
    expect(priv.result()).not.toBeNull();
  });

  it('stop() silences every timer', () => {
    const x = driver();
    x.d.start();
    const n = x.views.length;
    x.d.stop();
    x.clock.advance(120_000);
    expect(x.views.length).toBe(n);
    expect(x.result()).toBeNull();
  });
});

/* ─── Fake hub ───────────────────────────────────────────────────────────── */

class Hub implements HubLike {
  status: HubStatus = 'connected';
  emitted: { event: string; data: unknown }[] = [];
  private ls = new Map<string, Set<(d: unknown) => void>>();
  private ss = new Set<(s: HubStatus, i: { reconnect: boolean }) => void>();
  emit(event: string, data: unknown) {
    this.emitted.push({ event, data });
  }
  on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void) {
    const set = this.ls.get(event) ?? new Set();
    this.ls.set(event, set);
    set.add(fn as (d: unknown) => void);
    return () => void set.delete(fn as (d: unknown) => void);
  }
  onStatus(fn: (s: HubStatus, i: { reconnect: boolean }) => void) {
    this.ss.add(fn);
    return () => void this.ss.delete(fn);
  }
  fire<K extends BalatroS2CEvent>(event: K, d: BalatroS2CPayload<K>) {
    for (const fn of [...(this.ls.get(event) ?? [])]) fn(d);
  }
  setStatus(s: HubStatus) {
    this.status = s;
    for (const fn of [...this.ss]) fn(s, { reconnect: false });
  }
  listeners() {
    let n = 0;
    for (const s of this.ls.values()) n += s.size;
    return n + this.ss.size;
  }
  async account() {
    return null;
  }
  destroy() {}
}

const HASH = `${'a'.repeat(24)}-v1`;

describe('QueueClient', () => {
  function client() {
    const hub = new Hub();
    const views: QueueView[] = [];
    const matched: QueueMatched[] = [];
    const errors: string[] = [];
    const q = new QueueClient({ hub, contentHash: HASH, onView: (v) => views.push(v), onMatched: (m) => matched.push(m), onError: (c) => errors.push(c) });
    return { hub, q, views, matched, errors };
  }

  it('searches, counts, matches as host or member (code later)', () => {
    const { hub, q, views, matched } = client();
    expect(q.find('pvp_royale')).toBe(true);
    expect(hub.emitted).toEqual([{ event: 'balatro:queue:join', data: { queueMode: 'pvp_royale', contentHash: HASH } }]);
    expect(q.isQueued()).toBe(true);
    hub.fire('balatro:queue:status', { state: 'searching', queueMode: 'pvp_royale', waiting: 3 });
    hub.fire('balatro:queue:status', { state: 'searching', queueMode: 'pvp_royale', waiting: 3 });
    expect(views).toEqual([
      { state: 'searching', queueMode: 'pvp_royale' },
      { state: 'searching', queueMode: 'pvp_royale', waiting: 3 },
    ]);
    hub.fire('balatro:queue:status', { state: 'matched', queueMode: 'pvp_royale', role: 'member', waiting: 3 });
    hub.fire('balatro:queue:status', { state: 'matched', queueMode: 'pvp_royale', role: 'member', code: 'ABCDEF', waiting: 3 });
    expect(matched).toEqual([
      { queueMode: 'pvp_royale', role: 'member', waiting: 3 },
      { queueMode: 'pvp_royale', role: 'member', waiting: 3, code: 'ABCDEF' },
    ]);
    expect(q.isQueued()).toBe(false);
    q.reset();
    expect(q.view.state).toBe('idle');
  });

  it('a refusal or the hub going offline ends the search with an error', () => {
    const { hub, q, errors } = client();
    q.find('pvp_nemesis');
    hub.fire('balatro:p2p:error', { event: 'balatro:queue:join', code: 'seat-held', heldCode: 'ABCDEF' });
    expect(q.view.state).toBe('cancelled');
    hub.fire('balatro:p2p:error', { event: 'balatro:p2p:join', code: 'full' }); // not ours
    q.find('pvp_nemesis');
    hub.setStatus('offline');
    expect(q.view.state).toBe('cancelled');
    expect(errors).toEqual(['seat-held', 'offline']);
    expect(q.find('pvp_nemesis')).toBe(false);
    expect(errors).toEqual(['seat-held', 'offline', 'offline']);
  });

  it('party queue, cancel and stop', () => {
    const { hub, q } = client();
    q.findParty('PARTY2', 'pvp_teams');
    expect(hub.emitted[0]).toEqual({ event: 'balatro:party:queue', data: { code: 'PARTY2', queueMode: 'pvp_teams' } });
    q.cancel();
    expect(q.view.state).toBe('cancelled');
    q.find('pvp_teams');
    q.stop();
    expect(hub.emitted.map((e) => e.event)).toEqual(['balatro:party:queue', 'balatro:queue:leave', 'balatro:queue:join', 'balatro:queue:leave']);
    expect(hub.listeners()).toBe(0);
  });
});

/* ─── Inviter ────────────────────────────────────────────────────────────── */

describe('Inviter', () => {
  it('sends one at a time and pins each refusal on the right friend', async () => {
    const hub = new Hub();
    const clock = new Clock();
    const inv = new Inviter(hub, clock);
    const p1 = inv.invite('ABCDEF', 'f1');
    const p2 = inv.invite('ABCDEF', 'f2');
    expect(hub.emitted).toEqual([{ event: 'balatro:invite', data: { code: 'ABCDEF', toUserId: 'f1' } }]);
    expect(inv.getState().sent).toEqual({ f1: 'sending', f2: 'sending' });
    hub.fire('balatro:p2p:error', { event: 'balatro:invite', code: 'invalid' });
    expect(await p1).toBe('not-friends');
    expect(hub.emitted).toHaveLength(2);
    clock.advance(INVITE_SETTLE_MS);
    expect(await p2).toBe('sent');
    expect(inv.getState().sent).toEqual({ f1: 'not-friends', f2: 'sent' });
    hub.status = 'offline';
    expect(await inv.invite('ABCDEF', 'f3')).toBe('offline');
  });

  it('keeps an inbox of received invites, newest first, one per code', () => {
    const hub = new Hub();
    const clock = new Clock();
    const inv = new Inviter(hub, clock);
    let changes = 0;
    inv.subscribe(() => (changes += 1));
    hub.fire('balatro:invited', { code: 'AAAAAA', fromUserId: 'x', fromName: 'X' });
    hub.fire('balatro:invited', { code: 'BBBBBB', fromUserId: 'y', fromName: 'Y' });
    hub.fire('balatro:invited', { code: 'AAAAAA', fromUserId: 'z', fromName: 'Z' });
    expect(inv.getState().inbox.map((i) => `${i.code}:${i.fromName}`)).toEqual(['AAAAAA:Z', 'BBBBBB:Y']);
    for (let i = 0; i < INBOX_MAX + 3; i += 1) hub.fire('balatro:invited', { code: `C${String(i).padStart(5, '2')}`.slice(0, 6), fromUserId: 'q', fromName: 'Q' });
    expect(inv.getState().inbox.length).toBeLessThanOrEqual(INBOX_MAX);
    inv.dismiss(inv.getState().inbox[0].code);
    expect(changes).toBeGreaterThan(3);
  });

  it('the page registry routes through the live session and fails cleanly without one', async () => {
    const hub = new Hub();
    const clock = new Clock();
    expect(await inviteFriend('ABCDEF', 'f')).toBe('offline');
    const inv = new Inviter(hub, clock);
    setActiveInviter(inv);
    const p = inviteFriend('ABCDEF', 'f');
    hub.fire('balatro:p2p:error', { event: 'balatro:invite', code: 'rate-limited' });
    expect(await p).toBe('rate-limited');
    const pending = inv.invite('ABCDEF', 'g');
    inv.stop();
    expect(await pending).toBe('failed');
    setActiveInviter(null);
    expect(hub.listeners()).toBe(0);
  });
});

/* ─── Casual host ────────────────────────────────────────────────────────── */

function fakeHost(initial: LobbyState) {
  let state: LobbyState | null = initial;
  const intents: HostIntent[] = [];
  const h: CasualLobbyHost & { intents: HostIntent[]; set(s: LobbyState | null): void } = {
    intents,
    onSetupInput: null,
    lobby: () => state,
    set: (s) => (state = s),
    publishSetup: (view) => {
      if (state) state = { ...state, setup: view };
    },
    hostIntent: (i) => {
      intents.push(i);
      if (i.t === 'start' && state && (!state.setup || state.setup.phase === 'done')) {
        state = { ...state, started: {} as never };
      }
    },
  };
  return h;
}

const seed0 = (id: string, joinedAt: number) => ({ id, name: id, avatarUrl: null, avatarJoker: 'j_joker', blindCol: 1, role: 'player' as const, joinedAt });

describe('CasualHost', () => {
  it('waits for the matched players to ready, runs setup and auto-starts with the results', () => {
    const clock = new Clock();
    let s = createLobby({ code: 'ABCDEF', kind: 'casual', queueMode: 'pvp_nemesis', host: seed0('h', 1) });
    const host = fakeHost(s);
    const ends: string[] = [];
    const c = new CasualHost(host, { sched: clock, randomInt, onEnd: (w) => ends.push(w) }, 2);
    clock.advance(CASUAL_TIMING.POLL_MS * 4);
    expect(c.phase).toBe('gather');
    s = addPlayer(s, seed0('m', 2));
    host.set(s);
    clock.advance(CASUAL_TIMING.POLL_MS);
    expect(c.phase).toBe('gather'); // not ready yet
    s = setReady(s, 'm', true);
    host.set(s);
    clock.advance(CASUAL_TIMING.POLL_MS);
    expect(c.phase).toBe('setup');
    expect(host.onSetupInput).not.toBeNull();
    const rv = host.lobby()!.setup!;
    host.onSetupInput!({ from: 'h', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_vanilla' });
    host.onSetupInput!({ from: 'm', kind: 'vote', stepId: rv.stepId, value: 'ruleset_mp_vanilla' });
    clock.advance(VOTE_TIMING.ROLL_MS + VOTE_TIMING.REVEAL_MS);
    expect(host.lobby()!.setup!.kind).toBe('draft');
    clock.advance(DRAFT_TIMING.TURN_MS * 5);
    expect(host.intents.map((i) => i.t)).toEqual(['set_option', 'set_deck', 'start']);
    expect(host.intents[0]).toEqual({ t: 'set_option', key: 'ruleset', value: 'ruleset_mp_vanilla' });
    expect(ends).toEqual(['started']);
    expect(host.onSetupInput).toBeNull();
  });

  it('starts with whoever is ready after the gather window; gives up a lobby that stays alone', () => {
    const clock = new Clock();
    let s = createLobby({ code: 'ABCDEF', kind: 'casual', queueMode: 'pvp_royale', host: seed0('h', 1) });
    s = setReady(addPlayer(s, seed0('m', 2)), 'm', true);
    const host = fakeHost(s);
    const c = new CasualHost(host, { sched: clock, randomInt, onEnd: () => undefined }, 4);
    clock.advance(CASUAL_TIMING.GATHER_MS - CASUAL_TIMING.POLL_MS);
    expect(c.phase).toBe('gather');
    clock.advance(CASUAL_TIMING.POLL_MS);
    expect(c.phase).toBe('setup');
    c.stop();

    const lone = fakeHost(createLobby({ code: 'BCDEFG', kind: 'casual', queueMode: 'pvp_royale', host: seed0('h', 1) }));
    const ends: string[] = [];
    const c2 = new CasualHost(lone, { sched: clock, randomInt, onEnd: (w) => ends.push(w) }, 3);
    clock.advance(CASUAL_TIMING.ABANDON_MS);
    expect(c2.phase).toBe('ended');
    expect(ends).toEqual(['no-players']);
  });

  it('ends when the host role goes away', () => {
    const clock = new Clock();
    const host = fakeHost(createLobby({ code: 'ABCDEF', kind: 'casual', queueMode: 'pvp_nemesis', host: seed0('h', 1) }));
    const ends: string[] = [];
    new CasualHost(host, { sched: clock, randomInt, onEnd: (w) => ends.push(w) }, 2);
    host.set(null);
    clock.advance(CASUAL_TIMING.POLL_MS);
    expect(ends).toEqual(['gone']);
  });
});

describe('autoReady and party checks', () => {
  it('re-sends READY 6× at 1.2 s, and stops when the role is gone', () => {
    const clock = new Clock();
    let n = 0;
    autoReady(clock, () => (n += 1) > 0);
    clock.advance(60_000);
    expect(n).toBe(CASUAL_TIMING.AUTO_READY_TIMES);
    let m = 0;
    autoReady(clock, () => ++m < 3);
    clock.advance(60_000);
    expect(m).toBe(3);
    let k = 0;
    const cancel = autoReady(clock, () => (k += 1) > 0);
    cancel();
    clock.advance(60_000);
    expect(k).toBe(1);
  });

  it('a party queues only from its host, with everyone ready and connected', () => {
    let s = createLobby({ code: 'ABCDEF', kind: 'party', queueMode: 'pvp_royale', host: seed0('h', 1) });
    expect(partyQueueBlock(s, 'h')).toBeNull(); // a party of one may queue
    s = addPlayer(s, seed0('m', 2));
    expect(partyQueueBlock(s, 'h')).toBe('not-ready');
    expect(partyQueueBlock(s, 'm')).toBe('not-host');
    s = setReady(s, 'm', true);
    expect(partyQueueBlock(s, 'h')).toBeNull();
    expect(partyQueueBlock({ ...s, players: s.players.map((p) => (p.id === 'm' ? { ...p, away: true } : p)) }, 'h')).toBe('disconnected');
    expect(partyQueueBlock({ ...s, kind: 'private' }, 'h')).toBe('not-party');
    expect(partyQueueBlock(null, 'h')).toBe('not-party');
    expect(rememberParty(s, 5)).toEqual({ code: 'ABCDEF', hostId: 'h', members: ['h', 'm'], queueMode: 'pvp_royale', at: 5 });
  });
});
