/**
 * Hearthworks multiplayer end to end: the real hub handler + the real browser-side connector + session core,
 * over in-memory DataChannels and a fake clock (test-support/hearthworks-harness.ts). A host and two members
 * join and play, the host drops, the successor is promoted and the members rebind; the relay fallback;
 * and the failures a hostile or flaky network produces.
 *
 * Verified here: the contract between hub and client, admission and identity vouching, replication and
 * prediction over fragmenting reliable channels, successor tracking, promotion, rebinding, relay fallback,
 * kicks, expiry. NOT verified (needs two real browsers): ICE/STUN/TURN, SCTP DataChannels, real latency.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetHearthworksP2pForTests } from '../hearthworks-p2p';
import { HW_LIMITS } from '@/lib/hearthworks/net/events';
import { CONNECT_TIMEOUT_MS, START_TIMEOUT_MS } from '@/lib/hearthworks/net/connector';
import { buildingAt, type World } from '@/lib/hearthworks/world';
import { Rig, type Player } from '../../test-support/hearthworks-harness';

process.env.LOG_LEVEL = 'silent';

/** Structural equality: key order is irrelevant (a decoded snapshot emits keys in schema order). */
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, canon(x)]))
      : v;
const same = (a: World | null | undefined, b: World | null | undefined) =>
  !!a && !!b && JSON.stringify(canon(a)) === JSON.stringify(canon(b));

let rig: Rig;

beforeEach(() => {
  vi.useFakeTimers();
  rig = new Rig();
});

afterEach(() => {
  resetHearthworksP2pForTests();
  vi.useRealTimers();
});

/** The world a player is drawing right now. */
const worldOf = (p: Player) => p.store.getState().world;

async function startHost(p: Player, over: { maxPlayers?: number; private?: boolean } = {}): Promise<string> {
  await p.connector.hostRoom({ name: `${p.label} world`, maxPlayers: over.maxPlayers ?? 4, world: worldOf(p), private: over.private });
  await rig.until(() => p.connector.state.phase === 'hosting', `${p.label} hosting`);
  return p.connector.state.code!;
}

async function join(p: Player, code: string): Promise<void> {
  await p.connector.joinRoom(code);
  await rig.until(() => p.connector.state.phase === 'member', `${p.label} connected`);
  await rig.until(() => p.connector.session?.kind === 'member' && p.connector.session.peer.ready, `${p.label} has the world`);
}

/** The tile next to the spawn, where every player can build. */
const spot = (w: World, dx: number, dz = 0) => ({ x: Math.floor(w.size / 2) + dx, z: Math.floor(w.size / 2) + dz });

describe('a host and two members', () => {
  it('join through the hub, play, and stay identical; the hub never sees a command or a tick', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code);

    // The host is the account, not 'local': the world's seat for it was re-keyed, so every peer sees the vouched id.
    expect(h.store.getState().playerId).toBe('acct-host');
    expect(a.store.getState().playerId).toBe('acct-ann');
    await rig.until(() => Object.keys(worldOf(h).players).length === 3, 'three players in the world');
    expect(Object.keys(worldOf(h).players).sort()).toEqual(['acct-ann', 'acct-bob', 'acct-host']);
    expect(worldOf(h).players.local).toBeUndefined();

    // Everyone builds; each command is shown at once to its sender and ordered by the host.
    const p1 = spot(worldOf(h), 1);
    const p2 = spot(worldOf(h), 2);
    const p3 = spot(worldOf(h), 3);
    a.store.getState().dispatch({ type: 'place', kind: 'cottage', ...p1 });
    expect(buildingAt(worldOf(a), p1.x, p1.z)?.kind).toBe('cottage'); // prediction, before any tick
    expect(buildingAt(worldOf(h), p1.x, p1.z)).toBeUndefined();
    b.store.getState().dispatch({ type: 'place', kind: 'road', ...p2 });
    h.store.getState().dispatch({ type: 'place', kind: 'road', ...p3 });
    await rig.until(() => same(worldOf(a), worldOf(h)) && same(worldOf(b), worldOf(h)) && !!buildingAt(worldOf(h), p3.x, p3.z), 'replicas converge');
    expect(buildingAt(worldOf(h), p1.x, p1.z)?.kind).toBe('cottage');
    expect(buildingAt(worldOf(h), p2.x, p2.z)?.kind).toBe('road');
    // The cottage cost Ann money once (not twice: prediction + the host's tick are one command).
    const annMoney = worldOf(h).players['acct-ann'].money;
    expect(worldOf(a).players['acct-ann'].money).toBe(annMoney);

    // The hub saw signalling and (at most) relay frames: never a command.
    for (const p of [h, a, b]) {
      const events = new Set(p.hub.sent.map((s) => s.event));
      expect([...events].every((e) => e.startsWith('hearthworks:p2p:'))).toBe(true);
      expect(p.hub.sent.some((s) => s.event === 'hearthworks:p2p:relay')).toBe(false);
    }
  });

  it('shows who is in the room, who hosts, who would take over, and how each is connected', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code);
    await rig.until(() => h.connector.state.players.length === 3 && h.connector.state.players.every((p) => p.host || p.conn), 'full roster');
    expect(h.connector.state.players).toEqual([
      { id: 'acct-host', name: 'Hosty', host: true, successor: false, you: true, conn: null },
      { id: 'acct-ann', name: 'Ann', host: false, successor: true, you: false, conn: 'direct' },
      { id: 'acct-bob', name: 'Bob', host: false, successor: false, you: false, conn: 'direct' },
    ]);
    await rig.until(() => b.connector.state.players.some((p) => p.successor), 'bob learns the successor');
    expect(b.connector.state.players).toEqual([
      { id: 'acct-host', name: 'Hosty', host: true, successor: false, you: false, conn: 'direct' },
      { id: 'acct-ann', name: 'Ann', host: false, successor: true, you: false, conn: null },
      { id: 'acct-bob', name: 'Bob', host: false, successor: false, you: true, conn: null },
    ]);
    // The hub's own record agrees: the host named Ann (the longest-connected) as its successor.
    expect(h.hub.sent.filter((s) => s.event === 'hearthworks:p2p:successor').pop()?.data).toMatchObject({ peerId: expect.any(String) });
  });

  it('lists a hosted room in the browser (and not a private one), and a member can join from the list', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const priv = rig.addPlayer('priv', 'acct-priv', 'Priv');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await startHost(priv, { private: true });
    a.connector.refreshRooms();
    expect(a.connector.state.rooms).toEqual([
      { code, name: 'host world', host: 'Hosty', players: 1, maxPlayers: 4, world: { seed: 7, size: 24 } },
    ]);
    await join(a, a.connector.state.rooms[0].code);
    expect(a.connector.state.roomName).toBe('host world');
  });
});

describe('the host drops', () => {
  async function room3() {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code);
    // Some shared history to carry over, and the hub learns the successor.
    const p1 = spot(worldOf(h), 1);
    a.store.getState().dispatch({ type: 'place', kind: 'cottage', ...p1 });
    await rig.until(() => !!buildingAt(worldOf(h), p1.x, p1.z) && same(worldOf(b), worldOf(h)), 'history replicated');
    await rig.until(() => h.hub.sent.some((s) => s.event === 'hearthworks:p2p:successor'), 'successor named');
    return { h, a, b, code, p1 };
  }

  it('promotes the successor, who re-admits everyone; members rebind and the world carries on', async () => {
    const { h, a, b, p1 } = await room3();
    const before = structuredClone(worldOf(h));
    const peerA = (a.connector.session as { peer: unknown }).peer;
    const peerB = (b.connector.session as { peer: unknown }).peer;
    h.close(); // the tab closes: socket and channels gone at once
    await rig.until(() => a.connector.state.role === 'host', 'ann promoted', 20_000);
    expect(a.connector.state.phase).toBe('hosting');
    expect(a.connector.session?.kind).toBe('host');
    // Ann's store runs the host driver now; Bob is a member of Ann's room again, on the SAME PeerSession.
    await rig.until(() => b.connector.state.phase === 'member' && b.connector.state.players.some((p) => p.id === 'acct-ann' && p.host), 'bob rebound', 20_000);
    expect(b.connector.session?.kind).toBe('member');
    expect((b.connector.session as { peer: unknown }).peer).toBe(peerB);
    expect(peerB).not.toBe(peerA);
    await rig.until(() => (b.connector.session as { peer: { ready: boolean } }).peer.ready, 'bob has a snapshot from the new host');
    await rig.until(() => same(worldOf(b), worldOf(a)), 'bob converged on the new host');

    // Everything that happened before is still there (equal world, identities and money intact)...
    const after = worldOf(a);
    expect(buildingAt(after, p1.x, p1.z)?.kind).toBe('cottage');
    expect(Object.keys(after.players).sort()).toEqual(['acct-ann', 'acct-bob', 'acct-host']);
    expect(after.players['acct-ann'].money).toBe(before.players['acct-ann'].money);
    expect(after.players['acct-bob'].money).toBe(before.players['acct-bob'].money);
    expect(after.tick).toBeGreaterThanOrEqual(before.tick);

    // ...and play continues: Bob builds, Ann (the host now) builds, both land in the new host's world.
    const p2 = spot(after, 2);
    const p3 = spot(after, 3);
    b.store.getState().dispatch({ type: 'place', kind: 'road', ...p2 });
    a.store.getState().dispatch({ type: 'place', kind: 'road', ...p3 });
    await rig.until(() => !!buildingAt(worldOf(a), p2.x, p2.z) && !!buildingAt(worldOf(a), p3.x, p3.z), 'new commands applied');
    await rig.until(() => same(worldOf(b), worldOf(a)), 'still identical');

    // The roster: Ann hosts, Bob is the successor now, and the old host is gone from the room.
    await rig.until(() => a.connector.state.players.length === 2, 'roster without the old host');
    expect(a.connector.state.players.map((p) => [p.id, p.host, p.successor])).toEqual([
      ['acct-ann', true, false],
      ['acct-bob', false, true],
    ]);
  });

  it('lets a host leave on purpose: the successor takes over at once, with no wait for a grace period', async () => {
    const { h, a, b } = await room3();
    h.connector.leave();
    await rig.until(() => a.connector.state.role === 'host', 'ann promoted', 1_500);
    await rig.until(() => b.connector.state.phase === 'member' && b.connector.state.players.some((p) => p.id === 'acct-ann' && p.host), 'bob rebound', 15_000);
    expect(h.store.getState().driver).toBeNull();
    expect(h.connector.state.phase).toBe('idle');
  });

  it('survives two migrations in a row', async () => {
    const { h, a, b } = await room3();
    h.close();
    await rig.until(() => a.connector.state.role === 'host' && b.connector.state.phase === 'member' && b.connector.state.players.some((p) => p.host && p.id === 'acct-ann'), 'first migration', 30_000);
    await rig.until(() => (b.connector.session as { peer: { ready: boolean } }).peer.ready && same(worldOf(b), worldOf(a)), 'bob in sync');
    await rig.until(() => a.hub.sent.filter((s) => s.event === 'hearthworks:p2p:successor').length > 0, 'ann names bob');
    a.close();
    await rig.until(() => b.connector.state.role === 'host', 'bob promoted', 20_000);
    expect(b.connector.session?.kind).toBe('host');
    expect(Object.keys(worldOf(b).players).sort()).toEqual(['acct-ann', 'acct-bob', 'acct-host']);
    // A lone host plays on; a new player can still join the room by its code.
    const c = rig.addPlayer('cy', 'acct-cy', 'Cy');
    void join(c, b.connector.state.code!);
    await rig.until(() => c.connector.state.phase === 'member', 'cy joined the twice-migrated room', 30_000);
  });

  it('expires the room when the host vanishes with nobody to take over', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const code = await startHost(h);
    h.close();
    await rig.advance(HW_LIMITS.HOST_GRACE_MS + 100);
    const late = rig.addPlayer('late', 'acct-late', 'Late');
    await late.connector.joinRoom(code);
    await rig.until(() => late.connector.state.phase === 'closed', 'late refused');
    expect(late.connector.state.error).toBe('not-found');
  });

  it('keeps the room when only the host\'s hub socket blips: members stay connected and the host resumes', async () => {
    const { h, a } = await room3();
    const code = h.connector.state.code!;
    await rig.reconnectHub(h, 500); // the shared client reconnects on a new socket: the connector re-claims its room
    await rig.advance(200);
    expect(h.connector.state.phase).toBe('hosting');
    expect(h.hub.sent.filter((s) => s.event === 'hearthworks:p2p:host').pop()?.data).toMatchObject({ resume: { code } });
    await rig.advance(HW_LIMITS.MIGRATE_GRACE_MS + 500);
    expect(a.connector.state.role).toBe('member');
    expect(a.connector.state.phase).toBe('member');
  });
});

describe('the relay fallback', () => {
  it('connects a member whose direct path fails over the hub relay, and plays through it', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    rig.peers.blockDirect = true;
    await a.connector.joinRoom(code);
    await rig.until(() => a.connector.state.phase === 'member', 'ann on the relay', 40_000);
    await rig.until(() => (a.connector.session as { peer: { ready: boolean } }).peer.ready, 'snapshot over the relay', 40_000);
    await rig.until(() => h.connector.state.players.some((p) => p.id === 'acct-ann' && p.conn === 'relay'), 'host sees the relay');
    expect(a.hub.sent.some((s) => s.event === 'hearthworks:p2p:relay:start')).toBe(true);

    const p1 = spot(worldOf(h), 1);
    a.store.getState().dispatch({ type: 'place', kind: 'cottage', ...p1 });
    await rig.until(() => !!buildingAt(worldOf(h), p1.x, p1.z) && same(worldOf(a), worldOf(h)), 'command round-trips over the relay', 10_000);
    // Only opaque frames crossed the hub, none of them JSON the hub could read as a command.
    expect(a.hub.sent.filter((s) => s.event === 'hearthworks:p2p:relay').length).toBeGreaterThan(0);
  });

  it('migrates a room whose members are on the relay', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code); // both direct
    await rig.until(() => h.hub.sent.some((s) => s.event === 'hearthworks:p2p:successor'), 'successor named');
    h.close();
    rig.peers.blockDirect = true; // the new host cannot be reached directly: everyone rebinds over the relay
    await rig.until(() => a.connector.state.role === 'host', 'ann promoted', 20_000);
    await rig.until(() => b.connector.state.phase === 'member' && b.connector.state.players.some((p) => p.id === 'acct-ann' && p.host), 'bob rebound over the relay', 60_000);
    await rig.until(() => (b.connector.session as { peer: { ready: boolean } }).peer.ready && same(worldOf(b), worldOf(a)), 'bob in sync via the relay', 20_000);
    expect(b.connector.state.players.find((p) => p.host)?.conn).toBe('relay');
  });
});

describe('failures and hostile conditions', () => {
  it('refuses a signed-out player before anything is sent to the hub', async () => {
    const anon = rig.addPlayer('anon', null);
    await anon.connector.hostRoom({ name: 'x', maxPlayers: 4, world: worldOf(anon) });
    expect(anon.connector.state).toMatchObject({ phase: 'closed', error: 'auth-required' });
    await anon.connector.joinRoom('ABCDEF');
    expect(anon.connector.state).toMatchObject({ phase: 'closed', error: 'auth-required' });
    expect(anon.hub.sent).toEqual([]);
    expect(anon.store.getState().driver).toBeNull();
  });

  it('reports an unknown code, a full room and a refused host without leaving a half-open session', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const code = await startHost(h, { maxPlayers: 2 });
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    await join(a, code);
    await b.connector.joinRoom(code);
    await rig.until(() => b.connector.state.phase === 'closed', 'bob refused');
    expect(b.connector.state.error).toBe('full');
    expect(b.store.getState().driver).toBeNull();
    const c = rig.addPlayer('cy', 'acct-cy', 'Cy');
    await c.connector.joinRoom('ZZZZZZ');
    await rig.until(() => c.connector.state.phase === 'closed', 'cy refused');
    expect(c.connector.state.error).toBe('not-found');
    // The refused players can try again straight away (and are refused again, cleanly).
    await b.connector.joinRoom('ZZZZZZ');
    expect(b.connector.state).toMatchObject({ phase: 'closed', error: 'not-found' });
  });

  it('gives up when the hub never answers a host or join request', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    h.hub.setStatus('offline'); // emits are swallowed
    await h.connector.hostRoom({ name: 'x', maxPlayers: 4, world: worldOf(h) });
    expect(h.connector.state.phase).toBe('starting');
    await rig.advance(START_TIMEOUT_MS + 100);
    expect(h.connector.state).toMatchObject({ phase: 'closed', error: 'offline' });
    expect(h.store.getState().driver).toBeNull();
  });

  it('host vanishes mid-join (before admitting): the joiner is told when the room expires, and nothing is left running', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    rig.peers.blockDirect = false;
    // Ann's request reaches the hub, but the host's tab dies in the same instant.
    void a.connector.joinRoom(code);
    h.close();
    await rig.advance(100);
    expect(a.connector.state.phase).toBe('joining');
    expect(a.connector.session).toBeNull();
    await rig.advance(HW_LIMITS.HOST_GRACE_MS + 500);
    expect(a.connector.state).toMatchObject({ phase: 'closed', error: 'host-lost' });
    expect(a.store.getState().driver).toBeNull();
  });

  it('host vanishes after admitting but before the link opens: the joiner gives up with a timeout', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await a.connector.joinRoom(code);
    // Admitted (the hub said so) — kill the host before the channels finish opening.
    await rig.until(() => a.hub.sent.some((s) => s.event === 'hearthworks:p2p:signal'), 'ann answering');
    h.close();
    await rig.advance(CONNECT_TIMEOUT_MS + 1_000);
    expect(a.connector.state.phase).toBe('closed');
    expect(['timeout', 'host-lost']).toContain(a.connector.state.error);
    expect(a.store.getState().driver).toBeNull();
  });

  it('removes a kicked member from the room and the session, and keeps it out', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code);
    h.connector.kick('acct-ann');
    await rig.until(() => a.connector.state.phase === 'closed', 'ann kicked');
    expect(a.connector.state.error).toBe('kicked');
    expect(a.store.getState().driver).toBeNull();
    expect((h.connector.session as { host: { peerIds(): string[] } }).host.peerIds()).toEqual(['acct-bob']);
    await a.connector.joinRoom(code);
    await rig.until(() => a.connector.state.phase === 'closed', 'ann refused again');
    expect(a.connector.state.error).toBe('kicked');
    // Bob is unaffected.
    expect(b.connector.state.phase).toBe('member');
  });

  it('keeps a member\'s healthy link when only its hub socket drops, and re-joins when the hub is back', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await join(a, code);
    const host = (h.connector.session as { host: { peerIds(): string[] } }).host;
    // The hub loses Ann's socket (the host is told "disconnected"): her DataChannels are fine, so she stays.
    const handleDisconnect = (await import('../hearthworks-p2p')).handleHearthworksP2pDisconnect;
    handleDisconnect(rig.world.io, a.socket as never);
    await rig.advance(300);
    expect(host.peerIds()).toEqual(['acct-ann']);
    expect(a.connector.state.phase).toBe('member');
    // A new socket for the same account (the shared client reconnected): she asks again and is re-admitted.
    a.hub.setStatus('connected', true);
    await rig.advance(100);
    expect(a.hub.sent.filter((s) => s.event === 'hearthworks:p2p:join').length).toBeGreaterThanOrEqual(2);
    await rig.until(() => a.connector.state.phase === 'member' && (a.connector.session as { peer: { ready: boolean } }).peer.ready, 'ann re-admitted', 30_000);
  });

  it('notices a dead link to a host that is still in the hub, re-joins and rebinds', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await join(a, code);
    const peer = (a.connector.session as { peer: { hostLost: boolean } }).peer;
    // Only Ann's channels die (her network blipped); both hub sockets stay.
    for (const c of rig.peers.connections) {
      for (const ch of [c.host.unreliable, c.host.reliable]) (ch as unknown as { kill(): void }).kill();
    }
    await rig.until(() => peer.hostLost, 'link loss noticed');
    await rig.until(() => a.connector.state.phase === 'member' && (a.connector.session as { peer: { ready: boolean; hostLost: boolean } }).peer.ready && !peer.hostLost, 'rebound after a re-join', 30_000);
    expect(a.connector.session?.kind).toBe('member');
    const p1 = spot(worldOf(h), 1);
    a.store.getState().dispatch({ type: 'place', kind: 'road', ...p1 });
    await rig.until(() => !!buildingAt(worldOf(h), p1.x, p1.z) && same(worldOf(a), worldOf(h)), 'works after the re-join');
  });

  it('a malicious host cannot make a member act on garbage: malformed frames are counted, never applied', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await join(a, code);
    const peer = (a.connector.session as { peer: { stats: { protocolErrors: number }; view: World } }).peer;
    const before = JSON.stringify(canon(peer.view));
    const conn = rig.peers.connections[0];
    // A garbled JSON frame and a frame with an unknown tag, pushed straight onto the reliable channel.
    const junk = (b: number[]) => {
      const bytes = new Uint8Array([0x10, ...b]); // a WHOLE frame carrying junk
      conn.host.reliable.send(bytes);
    };
    junk([1, 0x7b, 0x7b]);
    junk([9, 9, 9, 9]);
    await rig.advance(200);
    expect(peer.stats.protocolErrors).toBeGreaterThanOrEqual(2);
    expect(a.connector.state.phase).toBe('member');
    await rig.until(() => same(worldOf(a), worldOf(h)), 'still in sync');
    expect(before).toBeDefined();
  });

  it('a malicious member cannot speak for another player or exceed the command rate', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const b = rig.addPlayer('bob', 'acct-bob', 'Bob');
    const code = await startHost(h);
    await join(a, code);
    await join(b, code);
    const host = (h.connector.session as { host: { stats: { rateLimited: number; rejectedFrames: number } } }).host;
    // Ann hand-crafts frames: a command claiming to be Bob's, a forged join, and a flood.
    const annConn = rig.peers.connections.find((c) => c.memberLabel === 'ann')!;
    const frame = (o: unknown) => {
      const body = new TextEncoder().encode(JSON.stringify(o));
      const out = new Uint8Array(body.length + 1);
      out[0] = 1; // JSON frame
      out.set(body, 1);
      const whole = new Uint8Array(out.length + 1);
      whole[0] = 0x10; // WHOLE
      whole.set(out, 1);
      annConn.member.reliable.send(whole);
    };
    const p1 = spot(worldOf(h), 4);
    frame({ t: 'cmd', seq: 0, cmd: { type: 'place', kind: 'road', ...p1, playerId: 'acct-bob' } }); // extra field
    frame({ t: 'cmd', seq: 1, cmd: { type: 'join' } });
    for (let i = 2; i < 400; i++) frame({ t: 'cmd', seq: i, cmd: { type: 'move', x: 1, z: 1 } });
    await rig.advance(500);
    expect(host.stats.rejectedFrames).toBeGreaterThanOrEqual(2);
    expect(host.stats.rateLimited).toBeGreaterThan(0);
    expect(buildingAt(worldOf(h), p1.x, p1.z)).toBeUndefined();
    expect(Object.keys(worldOf(h).players).sort()).toEqual(['acct-ann', 'acct-bob', 'acct-host']);
    // Bob never noticed, and Ann is still in the room.
    expect(b.connector.state.phase).toBe('member');
  });

  it('ignores hub events that do not fit its role or room (a member never admits, a host is never "re-hosted")', async () => {
    const h = rig.addPlayer('host', 'acct-host', 'Hosty');
    const a = rig.addPlayer('ann', 'acct-ann', 'Ann');
    const code = await startHost(h);
    await join(a, code);
    const annAttempts = rig.peers.connections.length;
    // Inject hub events straight onto the sockets, as a buggy hub (or a stale message) could.
    const inject = (p: Player, event: string, payload: unknown) => p.socket.received.push({ event, payload, volatile: false });
    inject(a, 'hearthworks:p2p:join-request', { peerId: 'zzzzzzzzzz01', userId: 'acct-evil', name: 'Evil' }); // a member admits nobody
    inject(a, 'hearthworks:p2p:promote', { code: 'ZZZZZZ', token: 'x'.repeat(24), peerId: 'zzzzzzzzzz02', ice: [] }); // another room's
    inject(h, 'hearthworks:p2p:host-changed', { code, hostPeerId: 'zzzzzzzzzz03', hostUserId: 'acct-evil', hostName: 'Evil' }); // a host has no host
    inject(h, 'hearthworks:p2p:closed', { code: 'ZZZZZZ', reason: 'host-lost' }); // not our room
    inject(a, 'hearthworks:p2p:rooms', { rooms: [{ nonsense: true }] }); // malformed: dropped by the client
    inject(a, 'hearthworks:p2p:signal', { from: 'short', description: { type: 'offer', sdp: 'v=0' } }); // malformed id
    rig.flush();
    await rig.advance(300);
    expect(a.connector.session?.kind).toBe('member');
    expect(h.connector.session?.kind).toBe('host');
    expect(h.connector.state.phase).toBe('hosting');
    expect(a.connector.state.phase).toBe('member');
    expect(rig.peers.connections.length).toBe(annAttempts); // nobody dialled out because of them
    expect(h.hub.dropped + a.hub.dropped).toBe(2);
    expect(Object.keys(worldOf(h).players).sort()).toEqual(['acct-ann', 'acct-host']);
  });
});
