/**
 * Replays across a reload rejoin (docs/balatro-mp.md §11), at the TS level
 * with the real session runtime on FakeNet and the validating fake Lua: the
 * host tells the rejoiner where its log continues (`welcome.logNext` →
 * `match_start.logNext`), the rejoiner's recorder continues there, every peer
 * (the rejoiner too, through the host's catch-up) assembles one contiguous log
 * per player with the rejoin markers in it, spectators follow it live, and a
 * host migration during the rejoin hands the count over to the successor.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReplayEvent, StartedMatch } from '../../types';
import { SpectateFeed } from '../../spectate';
import { attach } from '../../replay/attach';
import { verifyChk } from '../../replay/canonical-hash';
import type { ReplayService } from '../../replay/service';
import { memoryReplayStore, type ReplayStore } from '../../replay/store';
import { World, code, lobbyWith, startMatch, type Peer } from '../session/world.test-support';

let w: World;
const stores = new Map<string, ReplayStore>();

function withReplays(p: Peer): ReplayService {
  const s = memoryReplayStore();
  stores.set(p.id, s);
  attach(p.runtime, s);
  return p.runtime.replayTap as ReplayService;
}

function send(p: Peer, events: ReplayEvent[]): void {
  for (let k = 0; k < events.length; k += 50) p.lua.emit('log', { batch: events.slice(k, k + 50) });
}

/** A first life: manifest, lobby info, then plays (`n` events from `from`). */
function oldLog(p: Peer, from: number, n: number): ReplayEvent[] {
  const events: ReplayEvent[] = [];
  for (let i = from; i < from + n; i++) {
    const op: ReplayEvent['op'] = i === 0 ? 'match_manifest' : i === 1 ? 'lobby_info' : 'play';
    events.push({ i, t: i * 5, op, d: { life: 1, who: p.id } });
  }
  send(p, events);
  return events;
}

/** What the reloaded Lua records from `base` (recorder.lua): mount, run, restore + snapshot, plays. */
function newSegment(base: number, plays: number, opts: { snapshotAt?: number } = {}): ReplayEvent[] {
  let i = base;
  const ev = (op: ReplayEvent['op'], d: Record<string, unknown>): ReplayEvent => ({ i: i++, t: 100_000 + i, op, d });
  const out = [
    ev('manifest', { rejoin: true, v: 2, mount: true, seg: base }),
    ev('run_info', { seed: 'S' }),
    ev('manifest', { rejoin: true, v: 2, restore: true, from: opts.snapshotAt ?? base - 4, seg: base, parts: 2, z: 'raw', len: 6 }),
    ev('manifest', { snap: 1, data: '3:{}r' }),
    ev('manifest', { snap: 2, data: 'un' }),
  ];
  for (let k = 0; k < plays; k++) out.push(ev('play', { life: 2 }));
  return out;
}

function endAt(p: Peer, i: number, result: string): void {
  p.lua.emit('log', { batch: [{ i, t: 200_000 + i, op: 'end', d: { result } }] });
}

function svcLog(p: Peer, id: string): number {
  const rec = (p.runtime.replayTap as unknown as { rec: { logs: Map<string, { contiguous: number }> } | null } | null)?.rec;
  return rec?.logs.get(id)?.contiguous ?? 0;
}

function fedEvents(p: Peer, pov: string): ReplayEvent[] {
  let start = 0;
  p.lua.sent.forEach((m, k) => {
    if (m.t === 'replay_view' && (m.d as { playing?: { pov: string } }).playing?.pov === pov) start = k;
  });
  const out: ReplayEvent[] = [];
  for (const m of p.lua.sent.slice(start)) {
    if (m.t === 'replay_feed' && (m.d as { pov: string }).pov === pov) out.push(...(m.d as { events: ReplayEvent[] }).events);
  }
  return out;
}

/** The tab reloads: session and socket gone, storage kept. */
async function reload(p: Peer, host: Peer): Promise<void> {
  p.runtime.stop();
  p.hub.drop();
  p.connector.kill();
  await w.until(
    () => host.lua.all('presence').some((x) => x.id === p.id && x.status === 'away'),
    10_000,
    `${p.id} away`,
  );
}

async function rejoin(old: Peer): Promise<Peer> {
  const p = w.peer(old.id, { intent: 'rejoin', kv: old.kv, snapshots: old.snapshots });
  withReplays(p);
  await w.until(() => p.lua.errors().includes('seat-held'), 5_000, 'seat prompt');
  p.lua.emit('ui_seat', { op: 'rejoin' });
  await w.until(() => !!p.lua.last('match_start'), 10_000, 'match_start after rejoin');
  return p;
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

describe('SpectateFeed across a rejoin marker that rewinds (§11)', () => {
  it('feeds Lua again from the marker when it replaced events already fed', () => {
    const sent: { t: string; d: { events?: ReplayEvent[] } }[] = [];
    const bridge = { send: (t: string, d: unknown) => void sent.push({ t, d: d as { events?: ReplayEvent[] } }), on: () => () => {} };
    const feed = new SpectateFeed(bridge as never);
    feed.start({ runId: 'r1', roster: [{ id: 'bob' }] } as unknown as StartedMatch);
    const life1 = Array.from({ length: 12 }, (_, i) => ({ i, t: i, op: 'play' as const, d: {} }));
    feed.add('bob', 'r1', life1);
    const seg = newSegment(10, 3);
    feed.add('bob', 'r1', seg);
    const fed = sent.filter((m) => m.t === 'replay_feed').flatMap((m) => m.d.events ?? []);
    expect(fed.map((e) => e.i)).toEqual([...Array.from({ length: 12 }, (_, i) => i), ...seg.map((e) => e.i)]);
    expect(fed[12]?.d).toMatchObject({ rejoin: true, mount: true, seg: 10 });
    expect(feed.logs.get('bob')?.contiguous).toBe(10 + seg.length);
  });
});

describe('a reload rejoin continues the replay log (§11)', () => {
  it('logNext is the host count; every peer, the rejoiner included, stores one contiguous log', async () => {
    const { host: alice, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    withReplays(alice);
    withReplays(bob);
    await startMatch(w, alice, members, { seatGraceMs: 60_000 });
    // A normal start carries no logNext (a log without rejoins is unchanged).
    expect(bob.lua.last('match_start')).not.toHaveProperty('logNext');
    const runId = alice.lua.last('match_start')?.runId as string;
    oldLog(alice, 0, 40);
    oldLog(bob, 0, 30);
    await w.until(() => svcLog(alice, 'bob') === 30 && svcLog(bob, 'alice') === 40, 10_000, 'first life relayed');

    await reload(bob, alice);
    oldLog(alice, 40, 20); // alice plays on while bob is away
    const bob2 = await rejoin(bob);
    expect(bob2.lua.last('match_start')).toMatchObject({ runId, logNext: 30 });

    // The reloaded recorder continues at 30; the host's catch-up hands bob2 every log so far.
    const seg = newSegment(30, 15);
    send(bob2, seg);
    endAt(bob2, 30 + seg.length, 'lose');
    endAt(alice, 60, 'win');
    const bobLen = 30 + seg.length + 2; // + end + chk
    await w.until(
      () => [alice, bob2].every((p) => svcLog(p, 'bob') >= bobLen && svcLog(p, 'alice') >= 62),
      10_000,
      'both logs complete everywhere',
    );
    await w.step(3_000);
    for (const p of [alice, bob2]) {
      const rec = await stores.get(p.id)?.get(runId);
      const log = rec?.logs.bob ?? [];
      expect(log.map((e) => e.i)).toEqual(Array.from({ length: bobLen }, (_, i) => i));
      expect(log[29]?.d.life).toBe(1);
      expect(log[30]?.d).toMatchObject({ rejoin: true, mount: true, seg: 30 });
      expect(log[32]?.d).toMatchObject({ restore: true, parts: 2 });
      expect(verifyChk(log)).toBe('ok');
      expect(verifyChk(rec?.logs.alice ?? [])).toBe('ok');
      expect(rec?.logs.alice?.length).toBe(62);
    }
    expect((await stores.get('bob')?.get(runId))?.me).toBe('bob');
  });

  it('a spectator watching the rejoiner follows the log across the rejoin, and a late one gets it whole', async () => {
    const { host: alice, members } = await lobbyWith(w, 2);
    const [bob] = members as [Peer];
    withReplays(alice);
    withReplays(bob);
    const sam = w.peer('sam');
    withReplays(sam);
    await w.step(20);
    sam.lua.emit('ui_spectate', { code: code(alice) as string });
    await w.until(() => alice.lua.last('lobby_view')?.state.players.some((p) => p.id === 'sam') === true, 10_000, 'sam in');
    await startMatch(w, alice, members, { seatGraceMs: 60_000 });
    await w.until(() => !!sam.lua.last('replay_view')?.playing, 10_000, 'live playback');
    sam.lua.emit('ui_replay', { op: 'pov', value: 'bob' });
    oldLog(bob, 0, 25);
    await w.until(() => fedEvents(sam, 'bob').length >= 25, 10_000, 'first life fed');

    await reload(bob, alice);
    const bob2 = await rejoin(bob);
    expect(bob2.lua.last('match_start')?.logNext).toBe(25);
    const seg = newSegment(25, 10);
    send(bob2, seg);
    await w.until(() => fedEvents(sam, 'bob').length >= 25 + seg.length, 10_000, 'segment fed');
    const fed = fedEvents(sam, 'bob').map((e) => e.i);
    expect(fed).toEqual(Array.from({ length: 25 + seg.length }, (_, i) => i));

    const tom = w.peer('tom');
    withReplays(tom);
    await w.step(20);
    tom.lua.emit('ui_spectate', { code: code(alice) as string });
    await w.until(() => !!tom.lua.last('replay_view')?.playing, 10_000, 'late spectator');
    tom.lua.emit('ui_replay', { op: 'pov', value: 'bob' });
    await w.until(() => fedEvents(tom, 'bob').length >= 25 + seg.length, 10_000, 'late catch-up');
    expect(fedEvents(tom, 'bob').map((e) => e.i)).toEqual(fed);
    expect(fedEvents(tom, 'bob')[25]?.d).toMatchObject({ rejoin: true, mount: true });
  });

  it('a host migration during the rejoin: the successor counts the log and catches the rejoiner up', async () => {
    const { host: alice, members } = await lobbyWith(w, 3);
    const [bob, carol] = members as [Peer, Peer];
    for (const p of [alice, bob, carol]) withReplays(p);
    await startMatch(w, alice, members, { seatGraceMs: 60_000, startingLives: 3, timer: false });
    const runId = alice.lua.last('match_start')?.runId as string;
    oldLog(alice, 0, 12);
    oldLog(bob, 0, 20);
    oldLog(carol, 0, 16);
    await w.until(() => svcLog(carol, 'bob') === 20 && svcLog(bob, 'carol') === 16, 10_000, 'relayed');

    await reload(bob, alice);
    // The host's tab dies before bob is back: carol (the successor) takes over.
    alice.runtime.stop();
    alice.hub.drop();
    alice.connector.kill();
    await w.until(() => carol.runtime.role?.kind === 'host', 15_000, 'carol promoted');

    const bob2 = await rejoin(bob);
    expect(bob2.lua.last('match_start')).toMatchObject({ runId, logNext: 20 });
    const seg = newSegment(20, 5);
    send(bob2, seg);
    await w.until(
      () => svcLog(carol, 'bob') === 20 + seg.length && svcLog(bob2, 'bob') === 20 + seg.length && svcLog(bob2, 'alice') === 12,
      10_000,
      'assembled on the successor and the rejoiner',
    );
    expect(svcLog(bob2, 'carol')).toBe(16);
  });
});
