/**
 * WS13 end to end at the TS level, with the real session runtime on FakeNet
 * channels and the real hub handler (the WS5 world), Lua replaced by the
 * validating fake: every player's log reaches every peer through the host,
 * each peer stores the whole match (with every player's chk) in My Replays,
 * a stored replay is listed, opened and fed for a POV, and a spectator who
 * joins mid-match gets every log so far plus the live tail and can switch POV.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayEvent } from '../../types';
import { attach } from '../../replay/attach';
import { verifyChk } from '../../replay/canonical-hash';
import type { ReplayService } from '../../replay/service';
import { memoryReplayStore, type ReplayStore } from '../../replay/store';
import { World, code, lobbyWith, startMatch, type Peer } from '../session/world.test-support';

let w: World;
const stores = new Map<string, ReplayStore & { size(): number }>();

function withReplays(p: Peer): ReplayService {
  const s = memoryReplayStore();
  stores.set(p.id, s);
  attach(p.runtime, s);
  return p.runtime.replayTap as ReplayService;
}

/** Lua's own log: `n` events starting at `from` (manifest + lobby info first). */
function luaLog(p: Peer, from: number, n: number, extra: (i: number) => Partial<ReplayEvent> = () => ({})): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  for (let i = from; i < from + n; i++) {
    const op: ReplayEvent['op'] = i === 0 ? 'match_manifest' : i === 1 ? 'lobby_info' : 'play';
    events.push({ i, t: i * 5, op, d: { cards: [{ id: i, i: 1, k: 'c_base|Hearts:Ace' }], who: p.id }, ...extra(i) });
  }
  for (let k = 0; k < events.length; k += 50) p.lua.emit('log', { batch: events.slice(k, k + 50) });
  return events;
}

function endLog(p: Peer, i: number, result: string): void {
  p.lua.emit('log', { batch: [{ i, t: i * 5, op: 'end', d: { result } }] });
}

function fedEvents(p: Peer, pov: string): ReplayEvent[] {
  const out: ReplayEvent[] = [];
  let start = 0;
  // Only what was fed after the last `playing` for this POV.
  p.lua.sent.forEach((m, k) => {
    if (m.t === 'replay_view' && (m.d as { playing?: { pov: string } }).playing?.pov === pov) start = k;
  });
  for (const m of p.lua.sent.slice(start)) {
    if (m.t === 'replay_feed' && (m.d as { pov: string }).pov === pov) out.push(...(m.d as { events: ReplayEvent[] }).events);
  }
  return out;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
  vi.setSystemTime(1_762_000_000_000);
  w = new World();
  stores.clear();
});

afterEach(() => {
  for (const p of w.peers) expect(p.lua.invalid, `${p.id} sent Lua an invalid message`).toEqual([]);
  w.stop();
  vi.useRealTimers();
});

describe('replay logs across the star (REP-02)', () => {
  it('every peer assembles every player log, adds the chk at the end and stores the match', async () => {
    const { host, members } = await lobbyWith(w, 3);
    const svc = new Map(w.peers.map((p) => [p.id, withReplays(p)] as const));
    await startMatch(w, host, members, {});
    const runId = host.lua.last('match_start')?.runId as string;
    for (const p of w.peers) luaLog(p, 0, 120);
    await w.until(
      () => w.peers.every((p) => w.peers.every((q) => !!stores.get(p.id) && svcLog(svc.get(p.id), q.id) >= 120)),
      10_000,
      'logs everywhere',
    );
    for (const p of w.peers) endLog(p, 120, p === host ? 'win' : 'lose');
    await w.until(
      () => w.peers.every((p) => w.peers.every((q) => svcLog(svc.get(p.id), q.id) >= 122)),
      10_000,
      'end + chk everywhere',
    );
    await w.step(3_000);
    for (const p of w.peers) {
      const rec = await stores.get(p.id)?.get(runId);
      expect(rec?.me).toBe(p.id);
      expect(rec?.result).toBe(p === host ? 'win' : 'lose');
      expect(Object.keys(rec?.logs ?? {}).sort()).toEqual(w.peers.map((q) => q.id).sort());
      for (const q of w.peers) {
        const log = rec?.logs[q.id] ?? [];
        expect(log.map((e) => e.i)).toEqual(Array.from({ length: 122 }, (_, i) => i));
        expect(log.every((e) => e.op !== 'play' || e.d.who === q.id)).toBe(true);
        expect(verifyChk(log)).toBe('ok');
      }
      const list = await stores.get(p.id)?.list();
      expect(list?.[0]).toMatchObject({ id: runId, queueMode: 'pvp_nemesis', players: ['ALICE', 'BOB', 'CAROL'] });
    }
  });

  it('a stored match is listed, opened for a POV, switched to another POV and flagged when tampered', async () => {
    const { host, members } = await lobbyWith(w, 2);
    withReplays(host);
    withReplays(members[0] as Peer);
    await startMatch(w, host, members, {});
    const runId = host.lua.last('match_start')?.runId as string;
    const bob = members[0] as Peer;
    luaLog(host, 0, 30);
    luaLog(bob, 0, 40);
    endLog(host, 30, 'win');
    endLog(bob, 40, 'lose');
    await w.until(() => true, 10, 'tick');
    await w.step(3_000);

    host.lua.emit('ui_replay', { op: 'list' });
    await w.step(20);
    expect(host.lua.last('replay_view')?.list?.[0]).toMatchObject({ id: runId, result: 'win', players: ['ALICE', 'BOB'] });

    host.lua.emit('ui_replay', { op: 'open', id: runId });
    await w.step(20);
    expect(host.lua.last('replay_view')?.playing).toEqual({ id: runId, pov: 'alice', pos: 0, len: 32 });
    expect(fedEvents(host, 'alice').map((e) => e.i)).toEqual(Array.from({ length: 32 }, (_, i) => i));
    expect(host.lua.all('toast').map((t) => t.key)).not.toContain('rmh_mp_replay_inaccurate');

    host.lua.emit('ui_replay', { op: 'pov', value: 'bob' });
    await w.step(20);
    expect(host.lua.last('replay_view')?.playing).toMatchObject({ pov: 'bob', len: 42 });
    expect(fedEvents(host, 'bob').length).toBe(42);

    // Tamper with the stored copy: the chk no longer matches.
    const store = stores.get('alice') as ReplayStore;
    const rec = await store.get(runId);
    if (!rec?.logs.bob?.[5]) throw new Error('no record');
    rec.logs.bob[5].d = { cards: [] };
    await store.put(rec);
    host.lua.emit('ui_replay', { op: 'open', id: runId });
    await w.step(20);
    expect(host.lua.all('toast').map((t) => t.key)).toContain('rmh_mp_replay_inaccurate');

    host.lua.emit('ui_replay', { op: 'open', id: 'nope' });
    await w.step(20);
    expect(host.lua.last('toast')?.key).toBe('rmh_mp_replay_missing');
  });

  it('practice sessions are recorded locally (nothing is sent)', async () => {
    const solo = w.peer('alice');
    withReplays(solo);
    await w.step(20);
    solo.lua.emit('ui_practice', { ruleset: 'ruleset_mp_balanced', deck: 'b_red', stake: 1, seed: 'PRACTICE' });
    await w.until(() => !!solo.lua.last('practice_start'), 5_000, 'practice');
    luaLog(solo, 0, 10);
    endLog(solo, 10, 'left');
    await w.step(3_000);
    const list = await stores.get('alice')?.list();
    expect(list).toHaveLength(1);
    const rec = await stores.get('alice')?.get(list?.[0]?.id as string);
    expect(rec?.kind).toBe('practice');
    expect(verifyChk(rec?.logs.alice ?? [])).toBe('ok');
  });
});

function svcLog(s: ReplayService | undefined, id: string): number {
  const rec = (s as unknown as { rec: { logs: Map<string, { contiguous: number }> } | null } | undefined)?.rec;
  return rec?.logs.get(id)?.contiguous ?? 0;
}

describe('spectating (REP-04)', () => {
  it('a spectator joining mid-match gets every log so far, then the live tail, and can switch POV', async () => {
    const { host, members } = await lobbyWith(w, 2);
    const bob = members[0] as Peer;
    withReplays(host);
    withReplays(bob);
    await startMatch(w, host, members, {});
    const runId = host.lua.last('match_start')?.runId as string;
    luaLog(host, 0, 900); // 18 wire batches
    luaLog(bob, 0, 260);
    await w.step(500);

    const sam = w.peer('sam');
    withReplays(sam);
    await w.step(20);
    sam.lua.emit('ui_spectate', { code: code(host) as string });
    await w.until(() => !!sam.lua.last('replay_view')?.playing, 10_000, 'spectator playback opened');
    expect(sam.lua.last('replay_view')?.playing).toMatchObject({ id: `live:${runId}`, pov: 'alice' });
    expect(sam.lua.last('match_start')).toBeUndefined();
    await w.until(() => fedEvents(sam, 'alice').length >= 900, 10_000, 'catch-up');

    // Live events after the join.
    luaLog(host, 900, 20);
    await w.until(() => fedEvents(sam, 'alice').length >= 920, 10_000, 'live tail');
    const fed = fedEvents(sam, 'alice').map((e) => e.i);
    expect(new Set(fed).size).toBe(fed.length); // nothing fed twice
    expect(fed).toEqual(Array.from({ length: 920 }, (_, i) => i));

    sam.lua.emit('ui_replay', { op: 'pov', value: 'bob' });
    await w.until(() => fedEvents(sam, 'bob').length >= 260, 10_000, 'bob pov');
    expect(sam.lua.last('replay_view')?.playing).toMatchObject({ id: `live:${runId}`, pov: 'bob' });
    // A POV that is not a player is ignored.
    sam.lua.emit('ui_replay', { op: 'pov', value: 'mallory' });
    await w.step(20);
    expect(sam.lua.last('replay_view')?.playing?.pov).toBe('bob');

    // The spectator never sends logs or game events of its own into the match.
    sam.lua.emit('log', { batch: [{ i: 0, t: 0, op: 'play', d: { evil: true } }] });
    await w.step(200);
    const hostSvc = host.runtime.replayTap as ReplayService;
    expect(svcLog(hostSvc, 'sam')).toBe(0);

    // When every player's log has ended, the spectator keeps the match too.
    endLog(host, 920, 'win');
    endLog(bob, 260, 'lose');
    await w.until(() => fedEvents(sam, 'bob').length >= 261, 10_000, 'bob end');
    await w.step(3_000);
    const rec = await stores.get('sam')?.get(runId);
    expect(rec?.kind).toBe('spectated');
    expect(rec?.logs.alice?.length).toBeGreaterThanOrEqual(921);
  });

  it('a spectator present from the start follows the match live', async () => {
    const { host, members } = await lobbyWith(w, 2);
    withReplays(host);
    withReplays(members[0] as Peer);
    const sam = w.peer('sam');
    withReplays(sam);
    await w.step(20);
    sam.lua.emit('ui_spectate', { code: code(host) as string });
    await w.until(() => host.lua.last('lobby_view')?.state.players.some((p) => p.id === 'sam') === true, 10_000, 'sam in');
    await startMatch(w, host, members, {});
    await w.until(() => !!sam.lua.last('replay_view')?.playing, 10_000, 'playback opened at start');
    luaLog(host, 0, 75);
    await w.until(() => fedEvents(sam, 'alice').length >= 75, 10_000, 'live');
    expect(fedEvents(sam, 'alice').map((e) => e.i)).toEqual(Array.from({ length: 75 }, (_, i) => i));
  });
});
