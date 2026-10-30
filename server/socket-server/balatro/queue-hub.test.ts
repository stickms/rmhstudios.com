/**
 * WS12 — casual matchmaking, party queueing, invites and the spectate list on
 * the games hub, over the fake socket.io world (I-01: queue/party/invite).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBalatroP2pDisconnect, registerBalatroP2pHandlers, resetBalatroP2pForTests } from '../handlers/balatro-p2p';
import {
  balatroQueueSnapshotForTests,
  handleBalatroQueueDisconnect,
  registerBalatroQueueHandlers,
  resetBalatroQueueForTests,
  setBalatroSocialStoreForTests,
  type BalatroSocialStore,
} from '../handlers/balatro-queue';
import { balatroHub, seatOf } from './directory';
import { InviteBudget, NotifyDedupe, QUEUE_TIMING, QueueBook, queueModeMax } from './queue';
import { all, last, makeWorld, type FakeSocket } from '../test-support/fake-world';
import { BALATRO_S2C, type BalatroS2CPayload } from '@/lib/balatro/net/events';
import { BALATRO_LIMITS } from '@/lib/balatro/net/limits';
import { maxPlayersFor } from '@/lib/balatro/mp/rulesets/options';

process.env.LOG_LEVEL = 'silent';

const HASH = `${'a'.repeat(24)}-v1`;
const OTHER = `${'b'.repeat(24)}-v1`;

type S2C = { [K in keyof typeof BALATRO_S2C]: BalatroS2CPayload<K> };
type Status = S2C['balatro:queue:status'];

let world: ReturnType<typeof makeWorld>;
let n = 0;

function connect(userId?: string): FakeSocket {
  n += 1;
  const id = userId ?? `user-${n}`;
  return world.connect(`qsock-${n}`, { userId: id, userName: `P ${id}`, avatarUrl: null });
}

function drop(s: FakeSocket): void {
  handleBalatroP2pDisconnect(world.io, s as never);
  handleBalatroQueueDisconnect(world.io, s as never);
  world.disconnect(s);
}

const statuses = (s: FakeSocket) => all<Status>(s, 'balatro:queue:status');
const lastStatus = (s: FakeSocket) => last<Status>(s, 'balatro:queue:status');
const errors = (s: FakeSocket) => all<S2C['balatro:p2p:error']>(s, 'balatro:p2p:error').map((e) => e.code);

function queue(s: FakeSocket, queueMode = 'pvp_nemesis', contentHash = HASH) {
  world.send(s, 'balatro:queue:join', { queueMode, contentHash });
}

/** The elected host creates the casual room the way the client does. */
function hostCasual(s: FakeSocket, queueMode = 'pvp_nemesis', contentHash = HASH): string {
  world.send(s, 'balatro:p2p:host', { kind: 'casual', queueMode, maxPlayers: queueModeMax(queueMode as never), contentHash, spectatable: true });
  const hosted = last<S2C['balatro:p2p:hosted']>(s, 'balatro:p2p:hosted');
  if (!hosted) throw new Error(`not hosted: ${errors(s).join(',')}`);
  return hosted.code;
}

function hostParty(s: FakeSocket, members: FakeSocket[]): string {
  world.send(s, 'balatro:p2p:host', { kind: 'party', queueMode: 'pvp_royale', maxPlayers: 16, contentHash: HASH, spectatable: false });
  const code = last<S2C['balatro:p2p:hosted']>(s, 'balatro:p2p:hosted')!.code;
  for (const m of members) {
    world.send(m, 'balatro:p2p:join', { code, contentHash: HASH });
    const req = last<S2C['balatro:p2p:join-request']>(s, 'balatro:p2p:join-request')!;
    world.send(s, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
  }
  return code;
}

class FakeSocial implements BalatroSocialStore {
  follows = new Set<string>();
  notes: { toUserId: string; fromUserId: string; code: string }[] = [];
  follow(a: string, b: string) {
    this.follows.add(`${a}>${b}`);
  }
  mutual(a: string, b: string) {
    this.follow(a, b);
    this.follow(b, a);
  }
  async isMutual(a: string, b: string) {
    return this.follows.has(`${a}>${b}`) && this.follows.has(`${b}>${a}`);
  }
  async notifyInvite(x: { toUserId: string; fromUserId: string; fromName: string; code: string }) {
    this.notes.push({ toUserId: x.toUserId, fromUserId: x.fromUserId, code: x.code });
  }
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

beforeEach(() => {
  vi.useFakeTimers({ now: 1_000_000 });
  world = makeWorld(registerBalatroP2pHandlers, registerBalatroQueueHandlers);
});

afterEach(() => {
  // Every payload the hub sent parses with the frozen S2C contract.
  for (const s of world.sockets.values()) {
    for (const r of s.received) {
      const schema = (BALATRO_S2C as Record<string, { safeParse(v: unknown): { success: boolean } }>)[r.event];
      if (schema) expect(schema.safeParse(r.payload).success, `${r.event} ${JSON.stringify(r.payload)}`).toBe(true);
    }
  }
  resetBalatroQueueForTests();
  resetBalatroP2pForTests();
  vi.useRealTimers();
});

/* ─── The book ───────────────────────────────────────────────────────────── */

describe('QueueBook', () => {
  const solo = (book: QueueBook, id: string, at: number, mode: 'pvp_nemesis' | 'pvp_royale' = 'pvp_royale', hash = HASH) =>
    book.add({ queueMode: mode, contentHash: hash, enqueuedAt: at, players: [{ userId: id, socketId: `s-${id}` }], partyCode: null });

  it('agrees with the lobby on each mode’s maximum', () => {
    for (const m of ['pvp_nemesis', 'pvp_royale', 'pvp_manhunt', 'pvp_teams', 'pvp_smallworld'] as const) {
      expect(queueModeMax(m)).toBe(maxPlayersFor(m, 'casual'));
    }
  });

  it('matches Nemesis at once at 2 and keeps buckets apart by mode and hash', () => {
    const book = new QueueBook();
    solo(book, 'a', 0, 'pvp_nemesis');
    solo(book, 'b', 1, 'pvp_nemesis', OTHER);
    solo(book, 'c', 2, 'pvp_royale');
    expect(book.takeMatches(3)).toEqual([]);
    solo(book, 'd', 3, 'pvp_nemesis');
    const [m] = book.takeMatches(3);
    expect(m.players.map((p) => p.userId)).toEqual(['a', 'd']);
    expect(m.host.userId).toBe('a');
    expect(book.ticketOf('a')).toBeNull();
    expect(book.ticketOf('b')).not.toBeNull();
  });

  it('holds a short group for the gather window, then matches the oldest first', () => {
    const book = new QueueBook();
    solo(book, 'a', 100);
    solo(book, 'b', 200);
    solo(book, 'c', 300);
    expect(book.takeMatches(100 + QUEUE_TIMING.GATHER_MS - 1)).toEqual([]);
    expect(book.nextWake(500)).toBe(100 + QUEUE_TIMING.GATHER_MS);
    const [m] = book.takeMatches(100 + QUEUE_TIMING.GATHER_MS);
    expect(m.players.map((p) => p.userId)).toEqual(['a', 'b', 'c']);
    expect(book.size()).toBe(0);
    expect(book.nextWake(0)).toBeNull();
  });

  it('places a party atomically, never alone, and skips tickets that do not fit', () => {
    const book = new QueueBook();
    const party = (ids: string[], at: number) =>
      book.add({
        queueMode: 'pvp_royale',
        contentHash: HASH,
        enqueuedAt: at,
        players: ids.map((id) => ({ userId: id, socketId: `s-${id}` })),
        partyCode: 'PARTY2',
      });
    party(['h', 'x', 'y'], 0);
    expect(book.takeMatches(QUEUE_TIMING.GATHER_MS * 5)).toEqual([]); // a party never plays only itself
    const big: string[] = [];
    for (let i = 0; i < 14; i += 1) big.push(`p${i}`);
    party(big, 1); // 3 + 14 > 16: skipped
    solo(book, 'z', 2);
    const [m] = book.takeMatches(QUEUE_TIMING.GATHER_MS * 5);
    expect(m.players.map((p) => p.userId)).toEqual(['h', 'x', 'y', 'z']);
    expect(m.host.userId).toBe('h');
    expect(book.ticketOf('p0')).not.toBeNull();
  });

  it('fills to the maximum at once', () => {
    const book = new QueueBook();
    for (let i = 0; i < 16; i += 1) solo(book, `u${i}`, i);
    const [m] = book.takeMatches(20);
    expect(m.players).toHaveLength(16);
  });

  it('re-queues at the old place', () => {
    const book = new QueueBook();
    solo(book, 'late', 50);
    solo(book, 'early', 10);
    expect(book.all().map((t) => t.players[0].userId)).toEqual(['early', 'late']);
  });

  it('budgets invites per account and de-duplicates notifications', () => {
    const b = new InviteBudget(3);
    expect([1, 2, 3, 4].map(() => b.take('a', 0))).toEqual([true, true, true, false]);
    expect(b.take('b', 0)).toBe(true);
    expect(b.take('a', 60_000)).toBe(true);
    const d = new NotifyDedupe();
    expect(d.take('x', 'ABCDEF', 0)).toBe(true);
    expect(d.take('x', 'ABCDEF', 1000)).toBe(false);
    expect(d.take('x', 'BCDEFG', 1000)).toBe(true);
    expect(d.take('x', 'ABCDEF', QUEUE_TIMING.NOTIFY_DEDUPE_MS)).toBe(true);
  });
});

/* ─── Solo queue over the hub ────────────────────────────────────────────── */

describe('casual queue', () => {
  it('matches two Nemesis players: the earliest hosts, the other gets the code once the room exists', () => {
    const a = connect();
    const b = connect();
    queue(a);
    expect(lastStatus(a)).toEqual({ state: 'searching', queueMode: 'pvp_nemesis', waiting: 1 });
    queue(b);
    expect(lastStatus(a)).toEqual({ state: 'matched', queueMode: 'pvp_nemesis', role: 'host', waiting: 2 });
    expect(lastStatus(b)).toEqual({ state: 'matched', queueMode: 'pvp_nemesis', role: 'member', waiting: 2 });
    expect(balatroQueueSnapshotForTests()).toEqual({ tickets: [], pending: 1 });
    const code = hostCasual(a);
    vi.advanceTimersByTime(QUEUE_TIMING.HOST_POLL_MS);
    expect(lastStatus(b)).toEqual({ state: 'matched', queueMode: 'pvp_nemesis', role: 'member', code, waiting: 2 });
    expect(balatroQueueSnapshotForTests().pending).toBe(0);
    // The member joins as a normal player.
    world.send(b, 'balatro:p2p:join', { code, contentHash: HASH });
    expect(last(a, 'balatro:p2p:join-request')).toMatchObject({ userId: b.data.userId, rejoin: false });
  });

  it('a private room of the elected host does not count as its casual room', () => {
    const a = connect();
    const b = connect();
    queue(a);
    queue(b);
    world.send(a, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 2, contentHash: HASH, spectatable: false });
    vi.advanceTimersByTime(QUEUE_TIMING.HOST_POLL_MS * 3);
    expect(lastStatus(b)?.code).toBeUndefined();
  });

  it('never matches different builds or modes', () => {
    const a = connect();
    const b = connect();
    const c = connect();
    queue(a, 'pvp_nemesis', HASH);
    queue(b, 'pvp_nemesis', OTHER);
    queue(c, 'pvp_royale', HASH);
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS * 2);
    for (const s of [a, b, c]) expect(lastStatus(s)).toMatchObject({ state: 'searching', waiting: 1 });
  });

  it('gathers a Royale for 10 s, telling everyone the head count, then matches', () => {
    const ps = [connect(), connect(), connect()];
    for (const p of ps) {
      queue(p, 'pvp_royale');
      vi.advanceTimersByTime(1_000);
    }
    expect(ps.map((p) => lastStatus(p))).toEqual(ps.map(() => ({ state: 'searching', queueMode: 'pvp_royale', waiting: 3 })));
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS - 3_000 - 1);
    expect(lastStatus(ps[0])?.state).toBe('searching');
    vi.advanceTimersByTime(1);
    expect(lastStatus(ps[0])).toMatchObject({ state: 'matched', role: 'host', waiting: 3 });
    expect(lastStatus(ps[2])).toMatchObject({ state: 'matched', role: 'member', waiting: 3 });
  });

  it('a lone Royale player keeps waiting past the window', () => {
    const a = connect();
    queue(a, 'pvp_royale');
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS * 3);
    expect(lastStatus(a)?.state).toBe('searching');
  });

  it('cancels on leave and on disconnect, and re-counts the bucket', () => {
    const a = connect();
    const b = connect();
    const c = connect();
    queue(a, 'pvp_royale');
    queue(b, 'pvp_royale');
    queue(c, 'pvp_royale');
    world.send(a, 'balatro:queue:leave', {});
    expect(lastStatus(a)).toEqual({ state: 'cancelled', queueMode: 'pvp_royale' });
    expect(lastStatus(b)).toMatchObject({ state: 'searching', waiting: 2 });
    drop(b);
    expect(lastStatus(c)).toMatchObject({ state: 'searching', waiting: 1 });
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS * 2);
    expect(lastStatus(c)?.state).toBe('searching');
  });

  it('is idempotent for the same search and switches modes cleanly', () => {
    const a = connect();
    queue(a, 'pvp_royale');
    queue(a, 'pvp_royale');
    expect(balatroQueueSnapshotForTests().tickets).toHaveLength(1);
    queue(a, 'pvp_teams');
    expect(statuses(a).map((s) => `${s.state}:${s.queueMode}`)).toEqual([
      'searching:pvp_royale',
      'searching:pvp_royale',
      'cancelled:pvp_royale',
      'searching:pvp_teams',
    ]);
  });

  it('refuses a player who holds a seat, or is in a room on this socket', () => {
    const h = connect();
    world.send(h, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 2, contentHash: HASH, spectatable: false });
    queue(h);
    expect(all<S2C['balatro:p2p:error']>(h, 'balatro:p2p:error')).toEqual([
      { event: 'balatro:queue:join', code: 'seat-held', heldCode: seatOf(String(h.data.userId))!.code },
    ]);
    expect(balatroQueueSnapshotForTests().tickets).toEqual([]);
  });

  it('drops a player who sat down elsewhere while queued; the other keeps searching', () => {
    const a = connect();
    const b = connect();
    const c = connect();
    queue(a, 'pvp_royale');
    // a hosts a private lobby from another tab (another socket of the same account)
    const a2 = world.connect('a-tab-2', { userId: a.data.userId, userName: 'A' });
    world.send(a2, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_royale', maxPlayers: 4, contentHash: HASH, spectatable: false });
    queue(b, 'pvp_royale');
    queue(c, 'pvp_royale');
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS);
    expect(lastStatus(a)?.state).toBe('cancelled');
    // b and c already waited the window: they match without a.
    expect(lastStatus(b)).toMatchObject({ state: 'matched', role: 'host', waiting: 2 });
    expect(lastStatus(c)).toMatchObject({ state: 'matched', role: 'member', waiting: 2 });
  });

  it('falls through when the host never hosts: the member queues again at its old place', () => {
    const a = connect();
    const b = connect();
    queue(a);
    queue(b);
    vi.advanceTimersByTime(QUEUE_TIMING.HOST_CLAIM_MS);
    expect(lastStatus(a)).toEqual({ state: 'cancelled', queueMode: 'pvp_nemesis' });
    expect(lastStatus(b)).toEqual({ state: 'searching', queueMode: 'pvp_nemesis', waiting: 1 });
    const c = connect();
    queue(c);
    expect(lastStatus(b)).toMatchObject({ state: 'matched', role: 'host' });
  });

  it('falls through at once when the elected host disconnects', () => {
    const a = connect();
    const b = connect();
    queue(a);
    queue(b);
    drop(a);
    expect(lastStatus(b)).toMatchObject({ state: 'searching', waiting: 1 });
    expect(balatroQueueSnapshotForTests().pending).toBe(0);
  });

  it('a pending member that cancels is simply left out', () => {
    const ps = [connect(), connect(), connect()];
    for (const p of ps) queue(p, 'pvp_royale');
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS);
    world.send(ps[2], 'balatro:queue:leave', {});
    expect(lastStatus(ps[2])?.state).toBe('cancelled');
    const code = hostCasual(ps[0], 'pvp_royale');
    vi.advanceTimersByTime(QUEUE_TIMING.HOST_POLL_MS);
    expect(lastStatus(ps[1])?.code).toBe(code);
    expect(lastStatus(ps[2])?.state).toBe('cancelled');
  });
});

/* ─── Party ──────────────────────────────────────────────────────────────── */

describe('party queue', () => {
  it('queues the party host with its admitted players, and places them together', () => {
    const h = connect();
    const m1 = connect();
    const m2 = connect();
    const code = hostParty(h, [m1, m2]);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    for (const s of [h, m1, m2]) expect(lastStatus(s)).toEqual({ state: 'searching', queueMode: 'pvp_royale', waiting: 3 });
    const solo = connect();
    queue(solo, 'pvp_royale');
    expect(lastStatus(solo)).toMatchObject({ waiting: 4 });
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS);
    expect(lastStatus(h)).toMatchObject({ state: 'matched', role: 'host', waiting: 4 });
    for (const s of [m1, m2, solo]) expect(lastStatus(s)).toMatchObject({ state: 'matched', role: 'member', waiting: 4 });
    // The party room is gone quietly and its seats are free.
    expect(balatroHub.room(code)).toBeNull();
    for (const s of [h, m1, m2]) expect(seatOf(String(s.data.userId))).toBeNull();
    expect(all(m1, 'balatro:p2p:closed')).toEqual([]);
    // The party host hosts the match; everyone joins it.
    const casual = hostCasual(h, 'pvp_royale');
    vi.advanceTimersByTime(QUEUE_TIMING.HOST_POLL_MS);
    for (const s of [m1, m2, solo]) {
      expect(lastStatus(s)?.code).toBe(casual);
      world.send(s, 'balatro:p2p:join', { code: casual, contentHash: HASH });
      expect(errors(s)).toEqual([]);
    }
  });

  it('accepts the party through queue:join with partyCode (hash checked)', () => {
    const h = connect();
    const m = connect();
    const code = hostParty(h, [m]);
    world.send(h, 'balatro:queue:join', { queueMode: 'pvp_teams', contentHash: OTHER, partyCode: code });
    expect(errors(h)).toEqual(['version-mismatch']);
    world.send(h, 'balatro:queue:join', { queueMode: 'pvp_teams', contentHash: HASH, partyCode: code });
    expect(lastStatus(m)).toMatchObject({ state: 'searching', queueMode: 'pvp_teams', waiting: 2 });
  });

  it('only the party host of a party room may queue it; a full-mode party is refused', () => {
    const h = connect();
    const m = connect();
    const code = hostParty(h, [m]);
    world.send(m, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    expect(errors(m)).toEqual(['not-host']);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_nemesis' }); // 2 players fill a 1v1
    expect(errors(h)).toEqual(['full']);
    const p = connect();
    world.send(p, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_royale', maxPlayers: 4, contentHash: HASH, spectatable: false });
    const priv = last<S2C['balatro:p2p:hosted']>(p, 'balatro:p2p:hosted')!.code;
    world.send(p, 'balatro:party:queue', { code: priv, queueMode: 'pvp_royale' });
    expect(errors(p)).toEqual(['not-host']);
  });

  it('caps a party at PARTY_MAX', () => {
    const h = connect();
    const ms = Array.from({ length: BALATRO_LIMITS.PARTY_MAX }, () => connect());
    const code = hostParty(h, ms);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    expect(errors(h)).toEqual(['full']);
  });

  it('any party member leaving the queue, or dropping, cancels the whole party', () => {
    const h = connect();
    const m1 = connect();
    const m2 = connect();
    const code = hostParty(h, [m1, m2]);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    world.send(m2, 'balatro:queue:leave', {});
    for (const s of [h, m1, m2]) expect(lastStatus(s)?.state).toBe('cancelled');
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    drop(m1);
    for (const s of [h, m2]) expect(lastStatus(s)?.state).toBe('cancelled');
    expect(balatroQueueSnapshotForTests().tickets).toEqual([]);
  });

  it('a party member cannot also queue solo', () => {
    const h = connect();
    const m = connect();
    const code = hostParty(h, [m]);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    queue(m, 'pvp_royale');
    expect(errors(m)).toEqual(['seat-held']);
  });

  it('a party whose host fell through is cancelled, not re-queued (its room is gone)', () => {
    const solo = connect();
    queue(solo, 'pvp_royale');
    const h = connect();
    const m = connect();
    const code = hostParty(h, [m]);
    world.send(h, 'balatro:party:queue', { code, queueMode: 'pvp_royale' });
    vi.advanceTimersByTime(QUEUE_TIMING.GATHER_MS);
    expect(lastStatus(solo)).toMatchObject({ role: 'host' });
    drop(solo);
    expect(lastStatus(h)?.state).toBe('cancelled');
    expect(lastStatus(m)?.state).toBe('cancelled');
  });
});

/* ─── Invites ────────────────────────────────────────────────────────────── */

describe('invites', () => {
  let social: FakeSocial;
  beforeEach(() => {
    social = new FakeSocial();
    setBalatroSocialStoreForTests(social);
  });

  function lobby(): { h: FakeSocket; code: string } {
    const h = connect('inviter');
    world.send(h, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_nemesis', maxPlayers: 2, contentHash: HASH, spectatable: false });
    return { h, code: last<S2C['balatro:p2p:hosted']>(h, 'balatro:p2p:hosted')!.code };
  }

  it('reaches every hub socket of a mutual follow', async () => {
    const { h, code } = lobby();
    social.mutual('inviter', 'friend');
    const f1 = connect('friend');
    const f2 = world.connect('friend-tab', { userId: 'friend', userName: 'F' });
    world.send(h, 'balatro:invite', { code, toUserId: 'friend' });
    await flush();
    const invited = { code, fromUserId: 'inviter', fromName: 'P inviter' };
    expect(all(f1, 'balatro:invited')).toEqual([invited]);
    expect(all(f2, 'balatro:invited')).toEqual([invited]);
    expect(social.notes).toEqual([]);
    expect(errors(h)).toEqual([]);
  });

  it('refuses one-way follows, self-invites, and rooms the inviter is not in', async () => {
    const { h, code } = lobby();
    social.follow('inviter', 'fan');
    const fan = connect('fan');
    world.send(h, 'balatro:invite', { code, toUserId: 'fan' });
    world.send(h, 'balatro:invite', { code, toUserId: 'inviter' });
    await flush();
    expect(all(fan, 'balatro:invited')).toEqual([]);
    const other = connect('other');
    social.mutual('other', 'fan');
    world.send(other, 'balatro:invite', { code, toUserId: 'fan' });
    world.send(other, 'balatro:invite', { code: 'ZZZZZZ', toUserId: 'fan' });
    await flush();
    expect(errors(h)).toEqual(['invalid', 'invalid']);
    expect(errors(other)).toEqual(['not-found', 'not-found']);
    expect(social.notes).toEqual([]);
  });

  it('a member holding a seat may invite too', async () => {
    const { h, code } = lobby();
    const m = connect('member');
    world.send(m, 'balatro:p2p:join', { code, contentHash: HASH });
    const req = last<S2C['balatro:p2p:join-request']>(h, 'balatro:p2p:join-request')!;
    world.send(h, 'balatro:p2p:admit', { peerId: req.peerId, accept: true });
    social.mutual('member', 'pal');
    const pal = connect('pal');
    world.send(m, 'balatro:invite', { code, toUserId: 'pal' });
    await flush();
    expect(all(pal, 'balatro:invited')).toEqual([{ code, fromUserId: 'member', fromName: 'P member' }]);
  });

  it('leaves one notification for an offline friend per lobby', async () => {
    const { h, code } = lobby();
    social.mutual('inviter', 'away');
    world.send(h, 'balatro:invite', { code, toUserId: 'away' });
    world.send(h, 'balatro:invite', { code, toUserId: 'away' });
    await flush();
    expect(social.notes).toEqual([{ toUserId: 'away', fromUserId: 'inviter', code }]);
  });

  it('a failing follow check refuses rather than throws', async () => {
    const { h, code } = lobby();
    setBalatroSocialStoreForTests({
      isMutual: () => Promise.reject(new Error('db down')),
      notifyInvite: () => Promise.resolve(),
    });
    world.send(h, 'balatro:invite', { code, toUserId: 'x' });
    await flush();
    expect(errors(h)).toEqual(['invalid']);
  });

  it(`budgets ${BALATRO_LIMITS.INVITES_PER_MIN} invites a minute per account across sockets`, async () => {
    const { h, code } = lobby();
    const tab = world.connect('inviter-tab', { userId: 'inviter', userName: 'I' });
    for (let i = 0; i < BALATRO_LIMITS.INVITES_PER_MIN; i += 1) {
      social.mutual('inviter', `f${i}`);
      // Alternate sockets so the per-socket rate limit is not what stops it.
      world.send(i % 2 ? tab : h, 'balatro:invite', { code, toUserId: `f${i}` });
    }
    await flush();
    social.mutual('inviter', 'one-more');
    world.send(tab, 'balatro:invite', { code, toUserId: 'one-more' });
    await flush();
    expect(errors(tab)).toEqual(['rate-limited']);
    expect(errors(h)).toEqual([]);
  });
});

describe('spectate list', () => {
  it('answers from the directory', () => {
    const h = connect();
    world.send(h, 'balatro:p2p:host', { kind: 'private', queueMode: 'pvp_royale', maxPlayers: 4, contentHash: HASH, spectatable: true });
    const code = last<S2C['balatro:p2p:hosted']>(h, 'balatro:p2p:hosted')!.code;
    const v = connect();
    world.send(v, 'balatro:spectate:list', {});
    expect(last(v, 'balatro:spectate:lobbies')).toEqual({ lobbies: [{ code, queueMode: 'pvp_royale', players: 1, ante: null }] });
  });
});
