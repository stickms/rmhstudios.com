/**
 * WS13 replay logs, the chk hash and My Replays storage: assembly by index
 * (duplicates, gaps, malformed events), the D-34 caps, wire/bridge chunking,
 * canonical JSON + SHA-256 verification, and the IndexedDB store with its
 * newest-30 retention (on a minimal in-memory IndexedDB).
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ReplayEvent } from '../../types';
import { canonicalJson, chkPayload, makeChk, sha256Hex, verifyChk } from '../../replay/canonical-hash';
import { chunkEvents, eventSize, isReplayEvent, PlayerLog, REPLAY_LIMITS, resultOf } from '../../replay/log';
import { feedChunks, FEED_LIMITS } from '../../replay/player-feed';
import {
  idbReplayStore,
  isReplayRecord,
  memoryReplayStore,
  overRetention,
  REPLAY_DB,
  REPLAY_STORE,
  type ReplayRecord,
} from '../../replay/store';
import { fakeIndexedDb } from './fake-idb.test-support';

const ev = (i: number, op: ReplayEvent['op'] = 'play', d: Record<string, unknown> = {}): ReplayEvent => ({ i, t: i * 10, op, d });
const range = (from: number, to: number, op?: ReplayEvent['op']) => Array.from({ length: to - from }, (_, k) => ev(from + k, op));

describe('PlayerLog', () => {
  it('files events by index: out of order, duplicates ignored, contiguous prefix only', () => {
    const log = new PlayerLog('a');
    expect(log.add([ev(2), ev(0)])).toEqual({ added: 2, duplicate: 0, dropped: 0 });
    expect(log.contiguous).toBe(1);
    expect(log.events().map((e) => e.i)).toEqual([0]);
    expect(log.add([ev(1), ev(2), ev(0)])).toEqual({ added: 1, duplicate: 2, dropped: 0 });
    expect(log.contiguous).toBe(3);
    expect(log.events(1).map((e) => e.i)).toEqual([1, 2]);
    expect(log.count).toBe(3);
  });

  it('drops malformed events without throwing', () => {
    const log = new PlayerLog('a');
    const bad = [null, 1, 'x', { i: -1, t: 0, op: 'play', d: {} }, { i: 0.5, t: 0, op: 'play', d: {} }, { i: 0, t: 0, op: 'nope', d: {} },
      { i: 0, t: -1, op: 'play', d: {} }, { i: 0, t: 0, op: 'play', d: [] }, { i: 0, t: Infinity, op: 'play', d: {} }];
    expect(log.add(bad).dropped).toBe(bad.length);
    expect(log.contiguous).toBe(0);
    expect(isReplayEvent(ev(0, 'net_in', { k: 'outcome' }))).toBe(true);
  });

  it('caps a player at 20 000 events (D-34)', () => {
    const log = new PlayerLog('a');
    const r = log.add(range(0, REPLAY_LIMITS.MAX_EVENTS + 5, 'money_delta'));
    expect(r.added).toBe(REPLAY_LIMITS.MAX_EVENTS);
    expect(r.dropped).toBe(5);
    expect(log.truncated).toBe(true);
    expect(log.contiguous).toBe(REPLAY_LIMITS.MAX_EVENTS);
  });

  it('caps a player at 1 MB of encoded events (D-34)', () => {
    const log = new PlayerLog('a');
    const pad = 'x'.repeat(10_000);
    const r = log.add(Array.from({ length: 200 }, (_, i) => ev(i, 'money_delta', { pad })));
    expect(log.bytes).toBeLessThanOrEqual(REPLAY_LIMITS.MAX_BYTES);
    expect(r.added).toBeLessThan(200);
    expect(r.added).toBeGreaterThan(90);
    expect(log.truncated).toBe(true);
  });

  it('finds the end event and the chk after it', () => {
    const log = new PlayerLog('a');
    log.add([...range(0, 3), ev(3, 'end', { result: 'eliminated' })]);
    expect(log.ended()?.i).toBe(3);
    expect(resultOf(log.ended())).toBe('lose');
    log.add([makeChk(log.events())]);
    expect(log.chk()?.op).toBe('chk');
    expect(log.ended()?.i).toBe(3);
    expect(resultOf(ev(0, 'end', { result: 'cap' }))).toBeNull();
    expect(resultOf(ev(0, 'end', { result: 'draw' }))).toBe('draw');
  });
});

describe('PlayerLog across a reload rejoin (§11)', () => {
  const mount = (i: number, t = 9_000) => ({ i, t, op: 'manifest' as const, d: { rejoin: true, v: 2, mount: true, seg: i } });

  it('the rejoined segment continues after the old events: one contiguous log', () => {
    const log = new PlayerLog('b');
    log.add(range(0, 30));
    expect(log.add([mount(30), ...range(31, 40)])).toEqual({ added: 10, duplicate: 0, dropped: 0 });
    expect(log.contiguous).toBe(40);
    expect(log.get(30)?.d.mount).toBe(true);
  });

  it('a re-sent marker is a duplicate, never a rewind', () => {
    const log = new PlayerLog('b');
    log.add([...range(0, 30), mount(30), ...range(31, 40)]);
    const r = log.add([mount(30), ...range(31, 33)]);
    expect(r).toEqual({ added: 0, duplicate: 3, dropped: 0 });
    expect(r.rewound).toBeUndefined();
    expect(log.contiguous).toBe(40);
  });

  it('a marker over events this peer held past the host drops them (bytes and counts follow)', () => {
    const log = new PlayerLog('b');
    log.add(range(0, 35)); // this peer got 35; the host had 30 when the player rejoined
    log.add([ev(50)]); // and a stray event past a gap
    const before = log.bytes;
    const r = log.add([mount(30), ev(31, 'run_info')]);
    expect(r.rewound).toBe(30);
    expect(r.added).toBe(2);
    expect(log.contiguous).toBe(32);
    expect(log.count).toBe(32);
    expect(log.get(31)?.op).toBe('run_info');
    expect(log.get(50)).toBeUndefined();
    expect(log.bytes).toBeLessThan(before);
    expect(log.bytes).toBe(log.events().reduce((n, e) => n + eventSize(e), 0));
    // Later events of the old life (a slow relay) are now duplicates of the new segment.
    expect(log.add([ev(32), ev(31)]).duplicate).toBe(1);
  });

  it('only a rejoin marker may replace a held event', () => {
    const log = new PlayerLog('b');
    log.add(range(0, 5));
    expect(log.add([ev(3, 'manifest', { rejoin: false })]).duplicate).toBe(1);
    expect(log.add([ev(3, 'discard')]).duplicate).toBe(1);
    expect(log.contiguous).toBe(5);
    expect(log.get(3)?.op).toBe('play');
  });
});

describe('chunking', () => {
  it('wire batches hold at most 50 events and about 12 KB', () => {
    const events = Array.from({ length: 333 }, (_, i) => ev(i, 'money_delta', { pad: 'y'.repeat(i % 7 === 0 ? 900 : 50) }));
    const chunks = chunkEvents(events);
    expect(chunks.flat().map((e) => e.i)).toEqual(events.map((e) => e.i));
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(REPLAY_LIMITS.BATCH_EVENTS);
      expect(c.reduce((n, e) => n + eventSize(e), 0)).toBeLessThanOrEqual(REPLAY_LIMITS.BATCH_BYTES);
    }
  });

  it('one oversized event travels alone', () => {
    const big = ev(1, 'lobby_info', { pad: 'z'.repeat(20_000) });
    const chunks = chunkEvents([ev(0), big, ev(2)]);
    expect(chunks.map((c) => c.map((e) => e.i))).toEqual([[0], [1], [2]]);
  });

  it('bridge feed chunks stay under the mailbox line limit', () => {
    const events = Array.from({ length: 3000 }, (_, i) => ev(i, 'play', { cards: [{ id: i, i: 1, k: 'c_base|Hearts:Ace' }] }));
    const chunks = feedChunks(events);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(FEED_LIMITS.EVENTS);
      expect(JSON.stringify({ s: 1, t: 'replay_feed', d: { pov: 'alice', events: c } }).length).toBeLessThan(64 * 1024);
    }
    expect(chunks.flat().length).toBe(3000);
  });
});

describe('chk (REP-05)', () => {
  it('canonical JSON sorts keys at every depth and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null }, u: undefined })).toBe(
      '{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}',
    );
    expect(canonicalJson([undefined, 'é'])).toBe('[null,"é"]');
    expect(chkPayload([{ op: 'play', t: 1, i: 0, d: { z: 1, a: 2 } }])).toBe('[{"d":{"a":2,"z":1},"i":0,"op":"play","t":1}]');
  });

  it('SHA-256 is the standard digest (one block, many blocks, UTF-8, block edges)', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    for (const s of ['x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'é☃𝄞'.repeat(300), JSON.stringify(range(0, 500))]) {
      expect(sha256Hex(s)).toBe(createHash('sha256').update(s, 'utf8').digest('hex'));
    }
  });

  it('verifies ok, flags a tampered log and reports a missing chk', () => {
    const events = [...range(0, 5), ev(5, 'end', { result: 'win' })];
    const chk = makeChk(events);
    expect(chk).toMatchObject({ i: 6, op: 'chk', d: { n: 6 } });
    expect(verifyChk([...events, chk])).toBe('ok');
    // The same events with keys in another order still verify (canonical).
    const reordered = events.map((e) => ({ d: e.d, op: e.op, t: e.t, i: e.i }));
    expect(verifyChk([...reordered, chk])).toBe('ok');
    const tampered = events.map((e) => (e.i === 2 ? { ...e, d: { cards: [] } } : e));
    expect(verifyChk([...tampered, chk])).toBe('mismatch');
    expect(verifyChk(events)).toBe('missing');
    expect(verifyChk([...events.slice(1), chk])).toBe('mismatch');
  });
});

function record(id: string, at: number, extra: Partial<ReplayRecord> = {}): ReplayRecord {
  return {
    id,
    at,
    savedAt: at + 1,
    kind: 'match',
    me: 'alice',
    queueMode: 'pvp_nemesis',
    ruleset: 'ruleset_mp_balanced',
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    result: 'win',
    logs: { alice: range(0, 3), bob: range(0, 2) },
    ...extra,
  };
}

describe('replay store (D-34: IndexedDB, newest 30)', () => {
  it('retention keeps the newest by start time', () => {
    const all = Array.from({ length: 35 }, (_, i) => record(`r${i}`, 1000 + i));
    expect(overRetention(all).map((r) => r.id)).toEqual(['r4', 'r3', 'r2', 'r1', 'r0']);
    expect(overRetention(all.slice(0, 30))).toEqual([]);
  });

  it('validates stored values', () => {
    expect(isReplayRecord(record('a', 1))).toBe(true);
    expect(isReplayRecord({ ...record('a', 1), logs: { alice: [{ i: 'x' }] } })).toBe(false);
    expect(isReplayRecord({ id: 'a' })).toBe(false);
    expect(isReplayRecord(null)).toBe(false);
  });

  it('the memory store keeps 30, lists newest first and returns copies', async () => {
    const s = memoryReplayStore();
    for (let i = 0; i < 33; i++) await s.put(record(`r${i}`, 1000 + i));
    expect(s.size()).toBe(30);
    const list = await s.list();
    expect(list[0]).toEqual({ id: 'r32', at: 1032, queueMode: 'pvp_nemesis', ruleset: 'ruleset_mp_balanced', players: ['Alice', 'Bob'], result: 'win' });
    expect(list.map((e) => e.id)).not.toContain('r2');
    const got = await s.get('r10');
    got?.logs.alice?.pop();
    expect((await s.get('r10'))?.logs.alice).toHaveLength(3);
    await s.delete('r10');
    expect(await s.get('r10')).toBeNull();
  });

  it('the IndexedDB store round-trips, replaces, applies retention and skips damaged rows', async () => {
    const idb = fakeIndexedDb();
    const s = idbReplayStore(idb, 3);
    expect(s).not.toBeNull();
    const store = s as NonNullable<typeof s>;
    for (let i = 0; i < 5; i++) await store.put(record(`r${i}`, 1000 + i));
    expect((await store.list()).map((e) => e.id)).toEqual(['r4', 'r3', 'r2']);
    expect(await store.get('r0')).toBeNull();
    await store.put(record('r4', 1004, { result: 'lose' }));
    expect((await store.get('r4'))?.result).toBe('lose');
    // A damaged row (an older build, a manual edit) is ignored and removed on the next write.
    idb.dbs.get(REPLAY_DB)?.stores.get(REPLAY_STORE)?.rows.set('junk', { id: 'junk', at: 'never' });
    expect((await store.list()).map((e) => e.id)).toEqual(['r4', 'r3', 'r2']);
    expect(await store.get('junk')).toBeNull();
    await store.put(record('r5', 1005));
    expect(idb.dbs.get(REPLAY_DB)?.stores.get(REPLAY_STORE)?.rows.has('junk')).toBe(false);
    await store.delete('r5');
    expect((await store.list()).map((e) => e.id)).toEqual(['r4', 'r3']);
  });

  it('no IndexedDB → no store; a failing IndexedDB degrades to "no replays"', async () => {
    expect(idbReplayStore(undefined)).toBeNull();
    const broken = {
      open() {
        const r: { onerror?: () => void; error: Error } = { error: new Error('blocked') };
        queueMicrotask(() => r.onerror?.());
        return r;
      },
    } as unknown as IDBFactory;
    const s = idbReplayStore(broken) as NonNullable<ReturnType<typeof idbReplayStore>>;
    await expect(s.put(record('a', 1))).resolves.toBeUndefined();
    await expect(s.list()).resolves.toEqual([]);
    await expect(s.get('a')).resolves.toBeNull();
  });
});
