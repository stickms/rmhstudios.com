/**
 * WS13 service units: the host's spectator catch-up pacing (inside the
 * receiver's `log` limit: 1024 burst, 20/s), the spectate directory (hub list,
 * offline, timeout, malformed rows), late peer events re-saving a finished
 * match, and logs of other runs or unknown players being ignored.
 */

import { describe, expect, it } from 'vitest';
import type { BalatroS2CEvent, BalatroS2CPayload } from '../../../net/events';
import type { ReplayEvent, StartedMatch } from '../../types';
import { CATCHUP_BURST, CATCHUP_PER_SEC, RESAVE_MS, ReplayService } from '../../replay/service';
import { memoryReplayStore } from '../../replay/store';
import type { HubLike, HubStatus, Scheduler } from '../../transport/types';
import { SPECTATE_LIST_TIMEOUT_MS } from '../../spectate';
import { FakeLua } from '../session/world.test-support';

class Clock implements Scheduler {
  t = 0;
  private q: { at: number; fn: () => void; live: boolean }[] = [];
  now = () => 1_762_000_000_000 + this.t;
  mono = () => this.t;
  after(ms: number, fn: () => void) {
    const e = { at: this.t + ms, fn, live: true };
    this.q.push(e);
    return () => void (e.live = false);
  }
  every(ms: number, fn: () => void) {
    let stop = false;
    const tick = () => {
      if (stop) return;
      fn();
      if (!stop) this.after(ms, tick);
    };
    this.after(ms, tick);
    return () => void (stop = true);
  }
  advance(ms: number) {
    const end = this.t + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const next = this.q.find((e) => e.live && e.at <= end);
      if (!next) break;
      this.q = this.q.filter((e) => e !== next);
      this.t = next.at;
      next.fn();
    }
    this.t = end;
  }
}

class Hub implements HubLike {
  status: HubStatus = 'connected';
  emitted: { event: string; data: unknown }[] = [];
  private handlers = new Map<string, (d: unknown) => void>();
  emit(event: string, data: unknown) {
    this.emitted.push({ event, data });
  }
  on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void) {
    this.handlers.set(event, fn as (d: unknown) => void);
    return () => void this.handlers.delete(event);
  }
  fire(event: string, d: unknown) {
    this.handlers.get(event)?.(d);
  }
  onStatus() {
    return () => undefined;
  }
  account() {
    return Promise.resolve(null);
  }
  destroy() {}
}

const match = (runId = 'run1'): StartedMatch =>
  ({
    runId,
    seed: 'SEEDABCD',
    stake: 1,
    mpStake: null,
    deck: 'b_red',
    challenge: null,
    queueMode: 'pvp_nemesis',
    ruleset: 'ruleset_mp_balanced',
    roster: [
      { id: 'alice', name: 'Alice', blindCol: 1, avatarJoker: 'j_joker' },
      { id: 'bob', name: 'Bob', blindCol: 2, avatarJoker: 'j_joker' },
      { id: 'carol', name: 'Carol', blindCol: 3, avatarJoker: 'j_joker' },
    ],
    startedAt: 1_762_000_000_000,
    hostId: 'alice',
  }) as unknown as StartedMatch;

const events = (from: number, n: number, op: ReplayEvent['op'] = 'play'): ReplayEvent[] =>
  Array.from({ length: n }, (_, k) => ({ i: from + k, t: from + k, op, d: { k } }));

function setup(current: StartedMatch | null = match()) {
  const lua = new FakeLua();
  const hub = new Hub();
  const sched = new Clock();
  const store = memoryReplayStore();
  const own: unknown[] = [];
  let cur = current;
  const svc = new ReplayService({
    bridge: lua,
    hub,
    sched,
    store,
    me: () => 'alice',
    current: () => (cur ? { match: cur, practice: false } : null),
    sendOwn: (d) => own.push(d),
    log: () => undefined,
  });
  return { lua, hub, sched, store, svc, own, setCurrent: (m: StartedMatch | null) => (cur = m) };
}

describe('spectator catch-up pacing (host)', () => {
  it('sends a burst under the receiver limit, then a steady rate, in order per player', () => {
    const { svc, sched } = setup();
    const bare = (n: number) => Array.from({ length: n }, (_, i): ReplayEvent => ({ i, t: 0, op: 'play', d: {} }));
    svc.ownBatch(bare(20_000));
    svc.peerLog('bob', { runId: 'run1', batch: bare(20_000) });
    svc.peerLog('carol', { runId: 'run1', batch: bare(2_000) });
    const sent: { from: string; first: number }[] = [];
    svc.catchUp('run1', (from, d) => {
      sent.push({ from, first: d.batch[0]?.i ?? -1 });
      expect(d.batch.length).toBeLessThanOrEqual(50);
      return true;
    });
    expect(sent.length).toBe(CATCHUP_BURST);
    sched.advance(1_000);
    expect(sent.length).toBeLessThanOrEqual(CATCHUP_BURST + CATCHUP_PER_SEC + 1);
    expect(sent.length).toBeGreaterThan(CATCHUP_BURST);
    sched.advance(60_000);
    expect(sent.length).toBe(400 + 400 + 40);
    const alice = sent.filter((s) => s.from === 'alice').map((s) => s.first);
    expect(alice).toEqual([...alice].sort((a, b) => a - b));
    expect(sent.filter((s) => s.from === 'bob').length).toBe(400);
    expect(sent.filter((s) => s.from === 'carol').length).toBe(40);
  });

  it('stops when the link refuses a frame, and ignores other runs', () => {
    const { svc } = setup();
    svc.ownBatch(events(0, 500));
    let n = 0;
    svc.catchUp('run1', () => ++n < 3);
    expect(n).toBe(3);
    let m = 0;
    svc.catchUp('other', () => ++m > 0);
    expect(m).toBe(0);
  });
});

describe('recording edge cases', () => {
  it('ignores logs of other runs and of players outside the roster; re-saves after late events', async () => {
    const { svc, store, sched, own } = setup();
    svc.ownBatch([...events(0, 5), { i: 5, t: 5, op: 'end', d: { result: 'win' } }]);
    expect(own).toHaveLength(1); // the chk went to the peers
    sched.advance(10);
    await Promise.resolve();
    expect((await store.get('run1'))?.logs.alice).toHaveLength(7);
    svc.peerLog('mallory', { runId: 'run1', batch: events(0, 3) });
    svc.peerLog('bob', { runId: 'other', batch: events(0, 3) });
    svc.peerLog('bob', { runId: 'run1', batch: events(0, 4) });
    expect((await store.get('run1'))?.logs.bob).toBeUndefined();
    sched.advance(RESAVE_MS);
    await Promise.resolve();
    const rec = await store.get('run1');
    expect(rec?.logs.bob).toHaveLength(4);
    expect(rec?.logs.mallory).toBeUndefined();
    expect(rec?.result).toBe('win');
  });

  it('a new match saves the previous one even without an end', async () => {
    const { svc, store, setCurrent } = setup();
    svc.ownBatch(events(0, 3));
    setCurrent(match('run2'));
    svc.ownBatch(events(0, 2));
    await Promise.resolve();
    expect((await store.get('run1'))?.result).toBeNull();
    svc.stop();
    await Promise.resolve();
    expect((await store.get('run2'))?.logs.alice).toHaveLength(2);
  });

  it('outside a match nothing is recorded', async () => {
    const { svc, store } = setup(null);
    svc.ownBatch(events(0, 3));
    expect(await store.list()).toEqual([]);
  });
});

describe('spectate directory (MM-07)', () => {
  it('asks the hub and mirrors the answer to Lua', () => {
    const { lua, hub } = setup();
    lua.emit('ui_spectate_list', {});
    expect(hub.emitted.at(-1)).toEqual({ event: 'balatro:spectate:list', data: {} });
    hub.fire('balatro:spectate:lobbies', {
      lobbies: [
        { code: 'ABC234', queueMode: 'pvp_nemesis', players: 2, ante: 3 },
        { code: 'XYZ789', queueMode: 'pvp_royale', players: -1, ante: null },
      ],
    });
    expect(lua.last('spectate_view')).toEqual({ lobbies: [{ code: 'ABC234', queueMode: 'pvp_nemesis', players: 2, ante: 3 }] });
  });

  it('answers offline at once and times out an unanswered request', () => {
    const { lua, hub, sched } = setup();
    hub.status = 'offline';
    lua.emit('ui_spectate_list', {});
    expect(lua.last('spectate_view')).toEqual({ lobbies: [], error: 'offline' });
    expect(hub.emitted).toHaveLength(0);
    hub.status = 'connected';
    lua.emit('ui_spectate_list', {});
    sched.advance(SPECTATE_LIST_TIMEOUT_MS + 1);
    expect(lua.last('spectate_view')).toEqual({ lobbies: [], error: 'timeout' });
  });
});
