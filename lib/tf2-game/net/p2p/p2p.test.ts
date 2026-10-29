/**
 * Peer-to-peer play end to end, on an in-memory DataChannel pair with a fake
 * clock (fake-channel.test-support.ts): a listen server (the real
 * ListenServer → MatchRunner → Tf2MatchHost, synthetic room) hosting the
 * host's own player and three members over PeerLinks, through the real
 * codecs both ways — prediction, the reliable stream, the snapshot budget,
 * backpressure, the host leaving, and a member rejoining its seat.
 */
import { describe, expect, it } from 'vitest';
import { IN_FORWARD, IN_JUMP, IN_MOVELEFT, IN_MOVERIGHT } from '../../core/constants';
import { copy, vec3, type Vec3 } from '../../core/vec';
import { LIFE_ALIVE } from '../../sim/entity';
import { GR_STATE_RND_RUNNING } from '../../sim/rules';
import type { ChatMessage, JoinedPayload } from '../events';
import { createTf2MatchHost, Tf2MatchHost } from '../../server/tf2-match-host';
import { buildCheckpointCatalog } from '../../client/net/checkpoint-catalog';
import { packCheckpoint, unpackCheckpoint } from '../../sim/checkpoint/pack';
import type { MatchCommand, PlayerInfo } from '../../server/match-host';
import { matchOptions, roomClientWorld, roomWorld, TICK_MS, WanderBrain } from '../../server/match.test-support';
import { connectListenServer, ListenServer, LISTEN_PLAYER_ID, type FromListenServer, type ToListenServer } from '../../client/net/listen-server';
import { InputSender } from '../../client/net/input';
import { Prediction } from '../../client/net/prediction';
import { SnapshotClient } from '../../client/net/snapshot-client';
import { P2pHostSession, PEER_RATE_LIMITS, type HostMatchPort } from './host-session';
import { PeerLink, UNRELIABLE_HIGH_WATER } from './link';
import { P2pPeerClient, type PeerEndReason } from './peer-client';
import type { PeerRow } from './control';
import { FakeNet, fakeConnection, type PathConfig } from './fake-channel.test-support';
import { encodeControl, P2P_SNAPSHOT_MAX_BYTES, tagged, TAG_INPUT, TAG_SNAPSHOT, UNRELIABLE_MAX_BYTES } from './wire';

const CODE = 'P2PABC';

interface Member {
  userId: string;
  peerId: string;
  playerId: number;
  client: P2pPeerClient;
  hostLink: PeerLink;
  snap: SnapshotClient;
  input: InputSender;
  prediction: Prediction;
  joined: JoinedPayload | null;
  ended: PeerEndReason | null;
  chats: ChatMessage[];
  peers: PeerRow[];
  firstPrediction: Map<number, Vec3>;
  serverAt: Map<number, Vec3>;
  comparable: Set<number>;
  /** Commands run with another player close enough to collide (see recordServer). */
  crowded: Set<number>;
  liveSince: number;
  path: PathConfig;
  channels: ReturnType<typeof fakeConnection>;
}

async function settle(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

/** The host's page: a listen server on the fake clock, its own snapshot client, the session. */
interface RestoreSpec {
  packed: Uint8Array;
  catalog: ReturnType<typeof buildCheckpointCatalog>;
  localPlayerId: number;
  userId: string;
  seats: Array<{ hubId: number; userId?: string; name: string }>;
}

async function makeHost(
  net: FakeNet,
  over: { botCount?: number; maxPlayers?: number; seatGraceMs?: number; restore?: RestoreSpec } = {},
) {
  let match: Tf2MatchHost | null = null;
  const page: { postMessage(m: unknown, t: ArrayBuffer[]): void; onmessage: ((e: { data: unknown }) => void) | null } = {
    postMessage: (m) => server.handle(m as ToListenServer),
    onmessage: null,
  };
  const server = new ListenServer(
    async (opts, host, controls) => {
      const deps = {
        world: roomWorld(5),
        autoTeam: host.autoTeam ?? true,
        autoClass: true,
        snapshotMaxBytes: host.snapshotMaxBytes,
        botBrain: (_d: unknown, p: { id: number }) => new WanderBrain(p.id * 7),
        console: { kind: 'listen' as const, ownerId: controls.localPlayerId },
      };
      if (host.restore && over.restore) {
        // The successor's worker: the match from the previous host's checkpoint.
        const cp = await unpackCheckpoint(new Uint8Array(host.restore));
        match = Tf2MatchHost.restore(opts, deps, cp, over.restore.catalog);
        return match;
      }
      match = await createTf2MatchHost(opts, deps);
      return match;
    },
    (message: FromListenServer) => page.onmessage?.({ data: message }),
    { now: () => net.now, autoRun: false },
  );
  const local = new SnapshotClient();
  const localChats: ChatMessage[] = [];
  let joined: JoinedPayload | null = null;
  const maxPlayers = over.maxPlayers ?? 12;
  // eslint-disable-next-line prefer-const -- assigned after the connection it reads
  let session: P2pHostSession;
  const conn = connectListenServer(
    page,
    {
      opts: matchOptions({ matchId: CODE, maxPlayers, botCount: over.botCount ?? 8 }),
      playerName: 'Host',
      host: {
        autoTeam: true,
        snapshotMaxBytes: P2P_SNAPSHOT_MAX_BYTES,
        ...(over.restore ? { restore: over.restore.packed.slice().buffer as ArrayBuffer } : {}),
      },
      ...(over.restore ? { localPlayerId: over.restore.localPlayerId } : {}),
    },
    {
      onJoined: (j) => (joined = j),
      onEvents: (d) => local.onReliable(d),
      onSnapshot: (d) => local.onSnapshot(d),
      onSummary: (s) => session.onSummary(s),
      onPeerFrame: (tick, packets) => session.deliver(tick, packets),
    },
  );
  session = new P2pHostSession({
    code: CODE,
    map: 'ctf_2fort',
    mode: 'ctf',
    name: 'Friends',
    maxPlayers,
    hostUserId: over.restore?.userId ?? 'user-host',
    hostName: 'Host',
    localPlayerId: over.restore?.localPlayerId ?? LISTEN_PLAYER_ID,
    match: conn.peers,
    now: () => net.now,
    seatGraceMs: over.seatGraceMs,
    onLocalChat: (m) => localChats.push(m),
  });
  if (over.restore) session.restoreSeats(over.restore.seats.map((x) => ({ playerId: x.hubId, userId: x.userId, name: x.name })));
  await settle();
  // A restore unpacks and builds the match asynchronously (as in the worker): wait for it.
  for (let i = 0; i < 1000 && over.restore && !joined; i++) await new Promise((r) => setTimeout(r, 10));
  return { server, conn, session, local, localChats, match: () => match!, joined: () => joined };
}

type Host = Awaited<ReturnType<typeof makeHost>>;

/** A member asks (through the hub, which vouches for `userId`), the host admits, the link opens. */
function join(net: FakeNet, host: Host, userId: string, peerId: string, path: PathConfig): Member {
  const res = host.session.admit({ code: CODE, peerId, userId, name: userId });
  if (!res.accept) throw new Error(`refused: ${res.reason}`);
  const channels = fakeConnection(net, path);
  const handlers = host.session.linkHandlers(peerId);
  const hostLink: PeerLink = new PeerLink({
    unreliable: channels.host.unreliable,
    reliable: channels.host.reliable,
    now: () => net.now,
    tickNow: () => host.session.tickNow(),
    onUnreliable: handlers.onUnreliable,
    onReliable: handlers.onReliable,
    onClose: handlers.onClose,
    onOpen: () => host.session.attach(peerId, hostLink, 'direct'),
  });
  const cworld = roomClientWorld();
  const m: Member = {
    userId,
    peerId,
    playerId: res.playerId,
    client: null as unknown as P2pPeerClient,
    hostLink,
    snap: new SnapshotClient(),
    input: new InputSender(),
    prediction: new Prediction(cworld, cworld.addPlayer(userId)),
    joined: null,
    ended: null,
    chats: [],
    peers: [],
    firstPrediction: new Map(),
    serverAt: new Map(),
    comparable: new Set(),
    crowded: new Set(),
    liveSince: -1,
    path,
    channels,
  };
  const onSnap = (d: Uint8Array) => {
    const s = m.snap.onSnapshot(d);
    const me = m.snap.localPlayer();
    if (!s || !me) return;
    m.prediction.reconcile(
      { tick: s.tick, ackCmd: s.ackCmd, player: me, weapons: m.snap.localWeapons(), rules: m.snap.rules() },
      net.now,
    );
  };
  m.client = new P2pPeerClient({
    unreliable: channels.member.unreliable,
    reliable: channels.member.reliable,
    now: () => net.now,
    handlers: {
      onJoined: (j) => (m.joined = j),
      onEvents: (d) => {
        m.snap.onReliable(d);
        for (const b of m.snap.takeDeferred()) onSnap(b);
      },
      onSnapshot: onSnap,
      onChat: (c) => m.chats.push(c),
      onPeers: (p) => (m.peers = p),
      onEnded: (r) => (m.ended = r),
    },
  });
  return m;
}

/** One member command per client tick, deterministic per member. */
function memberTick(net: FakeNet, m: Member, frame: number, salt: number): void {
  if (!m.joined || m.ended) return;
  const cmd = m.input.createCommand(m.snap.ackTick + 7, (c) => {
    c.viewAngles.y = (frame * 0.7 + salt * 90) % 360;
    c.viewAngles.x = 10 * Math.sin(frame / 50);
    c.forwardMove = 450;
    c.buttons = IN_FORWARD;
    const phase = Math.floor((frame + salt * 30) / 90) % 3;
    if (phase === 1) {
      c.sideMove = 450;
      c.buttons |= IN_MOVERIGHT;
    } else if (phase === 2) {
      c.sideMove = -450;
      c.buttons |= IN_MOVELEFT;
    }
    if ((frame + salt) % 97 < 2) c.buttons |= IN_JUMP;
  });
  m.prediction.addCommand(cmd);
  const predicted = m.prediction.predictedOrigin(cmd.commandNumber);
  if (predicted) m.firstPrediction.set(cmd.commandNumber, copy(vec3(), predicted));
  const packet = m.input.packet(m.snap.ackTick, 4);
  if (packet) m.client.sendInput(packet);
  void net;
}

/** After a server tick: where the server put each member after its newest command. */
function recordServer(host: Host, m: Member): void {
  const match = host.match();
  const p = match.playerOf(m.playerId);
  if (!p) return;
  const w = match.world;
  const live = w.rules.state === GR_STATE_RND_RUNNING && p.lifeState === LIFE_ALIVE;
  if (live && m.liveSince < 0) m.liveSince = w.tickCount;
  if (!live) m.liveSince = -1;
  const ran = match.lastCommandRun(m.playerId);
  if (ran > 0 && !m.serverAt.has(ran)) {
    m.serverAt.set(ran, copy(vec3(), p.origin));
    // Another player within reach can push us — something no client predicts (the
    // predicting world holds only us), so those commands measure the room, not the netcode.
    let crowded = false;
    w.forEachPlayer((o) => {
      if (o !== p && o.alive && Math.hypot(o.origin.x - p.origin.x, o.origin.y - p.origin.y, o.origin.z - p.origin.z) < 160) crowded = true;
    });
    if (crowded) m.crowded.add(ran);
    if (live && w.tickCount > m.liveSince + 33) m.comparable.add(ran);
  }
}

function firstPredictionError(m: Member): { max: number; compared: number } {
  let max = 0;
  let compared = 0;
  for (const n of m.comparable) {
    // A push lingers in the velocity for a few commands after the contact.
    let near = false;
    for (let k = 0; k < 16 && !near; k++) near = m.crowded.has(n - k);
    if (near) continue;
    const s = m.serverAt.get(n)!;
    const p = m.firstPrediction.get(n);
    if (!p) continue;
    compared++;
    const e = Math.hypot(s.x - p.x, s.y - p.y, s.z - p.z);
    max = Math.max(max, e);
  }
  return { max, compared };
}

/** Runs the match and the members until `until` ms. */
function run(
  net: FakeNet,
  host: Host,
  members: Member[],
  until: number,
  opts: { ticks?: boolean; every?: (t: number) => void } = {},
): void {
  const ticks = opts.ticks ?? true;
  let frame = Math.floor(net.now / TICK_MS);
  for (let t = Math.floor(net.now) + 1; t <= until; t++) {
    net.advance(t);
    if (ticks && t % TICK_MS === 0) {
      host.server.matchRunner.pump();
      for (const m of members) recordServer(host, m);
    }
    if (ticks && (t + 7) % TICK_MS === 0) {
      frame++;
      members.forEach((m, i) => memberTick(net, m, frame, i + 1));
    }
    if (t % 100 === 0) {
      host.session.update();
      for (const m of members) m.client.update();
    }
    opts.every?.(t);
  }
}

describe('peer-to-peer play (in-memory DataChannels)', () => {
  it('a host and three members for 60 s at 80 ms RTT, 3 % loss and reordering', async () => {
    const net = new FakeNet();
    const host = await makeHost(net);
    expect(host.joined()?.playerId).toBe(LISTEN_PLAYER_ID);
    const path: PathConfig = { latencyMs: 40, jitterMs: 6, loss: 0.03, reorder: true };
    const members = [
      join(net, host, 'user-a', 'peeraaaaaaaa', { ...path, seed: 11 }),
      join(net, host, 'user-b', 'peerbbbbbbbb', { ...path, seed: 12 }),
      join(net, host, 'user-c', 'peercccccccc', { ...path, seed: 13 }),
    ];
    const seconds = 60;
    run(net, host, members, seconds * 1000, {
      every: (t) => {
        if (t === 10_000) members[0].client.chat('hello from a', false);
        if (t === 12_000) members[1].client.command({ kind: 'voice', menu: 0, item: 0 });
      },
    });
    // Let everything in flight land (no new ticks), then compare the streams.
    run(net, host, members, seconds * 1000 + 3000, { ticks: false });

    const match = host.match();
    expect(match.summary().players.length).toBe(12);
    const lines: string[] = [];
    for (const m of members) {
      expect(m.joined?.playerId).toBe(m.playerId);
      expect(m.ended).toBeNull();
      // The reliable stream arrived whole and in order: every batch the match sent, decoded.
      const sent = match.stats.get(m.playerId)!;
      expect(m.snap.stats.reliablePackets).toBe(sent.reliablePackets);
      expect(m.snap.stats.errors.reliable).toBe(0);
      expect(m.snap.stats.errors.malformed).toBe(0);
      expect(m.snap.stats.errors['no-baseline']).toBe(0);
      expect(m.client.rejected).toBe(0);
      // Snapshots: within the P2P budget, every datagram ≤ the MTU rule, none refused.
      expect(sent.maxSnapshotBytes).toBeLessThanOrEqual(P2P_SNAPSHOT_MAX_BYTES);
      expect(m.hostLink.stats.maxUnreliableBytes).toBeLessThanOrEqual(UNRELIABLE_MAX_BYTES);
      expect(m.hostLink.stats.oversize).toBe(0);
      expect(m.channels.host.unreliable.overMtu).toBe(0);
      expect(m.snap.stats.snapshots).toBeGreaterThan(seconds * 30 * 0.9);
      // Prediction: the first prediction of every command against where the server put us.
      const err = firstPredictionError(m);
      expect(err.compared).toBeGreaterThan(1500);
      expect(err.max).toBeLessThan(1);
      expect(m.prediction.snaps).toBeLessThanOrEqual(2);
      // Stats from the link: RTT ≈ 80 ms, some loss measured.
      expect(m.client.stats.rttMs!).toBeGreaterThan(60);
      expect(m.client.stats.rttMs!).toBeLessThan(110);
      // Loss from the real traffic (the snapshots' and inputs' sequence numbers), both ways: ≈ the path's 3 %.
      expect(m.client.stats.trafficLoss).toBeGreaterThan(0.002);
      expect(m.client.stats.trafficLoss).toBeLessThan(0.12);
      expect(m.hostLink.stats.trafficLoss).toBeLessThan(0.12);
      expect(m.hostLink.stats.trafficReceived).toBeGreaterThan(seconds * 60);
      expect(m.client.stats.trafficJitterMs).toBeGreaterThan(0);
      const down = m.hostLink.stats.sentBytes / seconds / 1024;
      const up = m.client.stats.sentBytes / seconds / 1024;
      expect(down).toBeLessThan(40);
      lines.push(
        `${m.userId}: down ${down.toFixed(1)} KB/s, up ${up.toFixed(1)} KB/s, max snapshot ${sent.maxSnapshotBytes} B, ` +
          `prediction max ${err.max.toFixed(4)} over ${err.compared}, rtt ${m.client.stats.rttMs?.toFixed(0)} ms, ` +
          `jitter ${m.client.stats.jitterMs.toFixed(1)} ms, loss ${(m.client.stats.loss * 100).toFixed(1)} %, ` +
          `held for strings ${m.snap.stats.errors['unknown-string']}`,
      );
    }
    // Host upload for 3 members, extrapolated per member.
    const totalUp = members.reduce((n, m) => n + m.hostLink.stats.sentBytes, 0) / seconds / 1024;
    lines.push(`host upload ${totalUp.toFixed(1)} KB/s for 3 members (12 players: 4 humans + 8 bots)`);
    // The measured numbers (docs/tf2-game.md "Peer-to-peer play"): TF2_P2P_REPORT=1 pnpm test:tf2 lib/tf2-game/net/p2p
    if (process.env.TF2_P2P_REPORT) process.stdout.write(`[p2p] ${lines.join('\n[p2p] ')}\n`);

    // Chat reached everyone (members and the host's HUD), and the voice line ran in the match.
    for (const m of members) expect(m.chats.map((c) => c.text)).toContain('hello from a');
    expect(host.localChats.map((c) => c.text)).toContain('hello from a');
    expect(members[1].chats[0].name).toBe('user-a');
    // Every human's connection type, keyed by entity.
    const links = new Map(members[2].peers.map((p) => [p.entity, p.link]));
    expect([...links.values()].filter((l) => l === 'host').length).toBe(1);
    expect([...links.values()].filter((l) => l === 'direct').length).toBe(3);
    expect(links.get(match.playerOf(members[0].playerId)!.id)).toBe('direct');
  }, 180_000);

  it('a member who drops keeps the seat for 30 s; one who never returns is released', async () => {
    const net = new FakeNet();
    const host = await makeHost(net, { botCount: 2, maxPlayers: 6 });
    const path: PathConfig = { latencyMs: 20 };
    const a = join(net, host, 'user-a', 'peeraaaaaaaa', path);
    const b = join(net, host, 'user-b', 'peerbbbbbbbb', path);
    run(net, host, [a, b], 3000);
    const match = host.match();
    const entityA = match.playerOf(a.playerId)!.id;
    const entityB = match.playerOf(b.playerId)!.id;
    expect(a.snap.localEntity).toBe(entityA);

    // Both tabs die. The seats stay; the players stand where they were.
    a.channels.host.reliable.kill();
    a.channels.host.unreliable.kill();
    b.channels.host.reliable.kill();
    b.channels.host.unreliable.kill();
    run(net, host, [], 8000);
    expect(a.ended).toBe('closed');
    expect(host.session.seatList().map((s) => s.droppedAt !== null)).toEqual([true, true]);
    expect(match.playerOf(a.playerId)?.id).toBe(entityA);

    // A comes back by code (a new hub peer id, the same account) within the grace: same seat.
    const again = join(net, host, 'user-a', 'peerzzzzzzzz', path);
    expect(again.playerId).toBe(a.playerId);
    run(net, host, [again], 12_000);
    expect(again.joined?.playerId).toBe(a.playerId);
    expect(again.snap.localEntity).toBe(entityA);
    expect(again.snap.stats.errors.malformed + again.snap.stats.errors['no-baseline']).toBe(0);
    expect(again.snap.stats.snapshots).toBeGreaterThan(100);
    expect(again.snap.hello?.localEntity).toBe(entityA);

    // B never returns: released after the grace, and its entity leaves the match.
    run(net, host, [again], 40_000);
    expect(match.playerOf(b.playerId)).toBeNull();
    expect(host.session.seatList().map((s) => s.userId)).toEqual(['user-a']);
    void entityB;
  }, 120_000);

  it('the host leaving ends the match for everyone; a dead tab and a silent network are noticed', async () => {
    const net = new FakeNet();
    const host = await makeHost(net, { botCount: 0, maxPlayers: 6 });
    const path: PathConfig = { latencyMs: 30 };
    const a = join(net, host, 'user-a', 'peeraaaaaaaa', path);
    const b = join(net, host, 'user-b', 'peerbbbbbbbb', path);
    const c = join(net, host, 'user-c', 'peercccccccc', path);
    run(net, host, [a, b, c], 2000);
    expect(a.joined && b.joined && c.joined).toBeTruthy();

    // c's network goes silent: nothing is closed, the keepalive notices after 10 s.
    c.channels.host.unreliable.partition = true;
    c.channels.host.reliable.partition = true;
    c.channels.member.unreliable.partition = true;
    c.channels.member.reliable.partition = true;
    run(net, host, [a, b, c], 14_000);
    expect(c.ended).toBe('timeout');

    // The host leaves on purpose: a and b are told why.
    host.session.close('host-left');
    run(net, host, [a, b], 15_000, { ticks: false });
    expect(a.ended).toBe('host-left');
    expect(b.ended).toBe('host-left');
  }, 60_000);

  it('host migration: the host leaves, a member restores its checkpoint and the others play on, on their seats', async () => {
    const net = new FakeNet();
    const host = await makeHost(net, { botCount: 4, maxPlayers: 8 });
    const path: PathConfig = { latencyMs: 30, jitterMs: 3, loss: 0.01, seed: 5 };
    const a = join(net, host, 'user-a', 'peeraaaaaaaa', path);
    const b = join(net, host, 'user-b', 'peerbbbbbbbb', path);
    run(net, host, [a, b], 20_000);
    expect(a.joined && b.joined).toBeTruthy();
    // The successor (a) holds the newest checkpoint the host's worker wrote (here: written directly).
    const catalog = buildCheckpointCatalog({ 'test:WanderBrain': WanderBrain });
    const cp = host.match().checkpoint(catalog);
    const packed = await packCheckpoint(cp);
    const tick = cp.tick;
    const bScore = host.match().summary().players.find((p) => p.id === b.playerId)!;
    expect(Tf2MatchHost.checkpointSeats(cp).map((s) => s.userId).sort()).toEqual(['user-a', 'user-b', undefined].sort());

    // The host leaves, handing over: members are told `migrating`, not that the match ended.
    host.session.close('migrating');
    run(net, host, [a, b], 21_000, { ticks: false });
    expect(a.ended).toBe('migrating');
    expect(b.ended).toBe('migrating');

    // a's page starts the match from the checkpoint, on its own seat, with every other seat held.
    const hostB = await makeHost(net, {
      restore: { packed, catalog, localPlayerId: a.playerId, userId: 'user-a', seats: Tf2MatchHost.checkpointSeats(cp) },
      botCount: 4,
      maxPlayers: 8,
    });
    expect(hostB.joined()?.playerId).toBe(a.playerId);
    // b is asked for again (the hub vouches for it) and reclaims its seat: same player, same score.
    const b2 = join(net, hostB, 'user-b', 'peerbbbbbbb2', path);
    expect(b2.playerId).toBe(b.playerId);
    run(net, hostB, [b2], 28_000);
    const m = hostB.match();
    expect(m.world.tickCount).toBeGreaterThan(tick);
    expect(b2.joined?.playerId).toBe(b.playerId);
    expect(b2.ended).toBeNull();
    expect(b2.snap.stats.snapshots).toBeGreaterThan(150);
    expect(b2.snap.stats.errors['no-baseline']).toBe(0);
    expect(m.summary().players.find((p) => p.id === b.playerId)!.score).toBeGreaterThanOrEqual(bScore.score);
    // The bots came back with their brains (4), and the old host's seat is held for 30 s.
    expect(m.summary().players.filter((p) => p.bot).length).toBe(4);
    expect(hostB.session.seatList().map((s) => s.userId).sort()).toEqual(['user-b']);
    // b's input moves b on the new host.
    const before = { ...m.playerOf(b.playerId)!.origin };
    run(net, hostB, [b2], 31_000);
    const after = m.playerOf(b.playerId)!.origin;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(50);
  }, 120_000);

  it('the host closing its tab (no goodbye) ends the members’ sessions too', async () => {
    const net = new FakeNet();
    const host = await makeHost(net, { botCount: 0, maxPlayers: 4 });
    const a = join(net, host, 'user-a', 'peeraaaaaaaa', { latencyMs: 25 });
    run(net, host, [a], 1500);
    a.channels.host.reliable.kill();
    a.channels.host.unreliable.kill();
    run(net, host, [a], 1600, { ticks: false });
    expect(a.ended).toBe('closed');
  }, 30_000);
});

describe('PeerLink', () => {
  function pair(path: PathConfig, opts: { hostTick?: () => number } = {}) {
    const net = new FakeNet();
    const ch = fakeConnection(net, path);
    const got = { a: [] as Uint8Array[], b: [] as Uint8Array[], au: [] as Uint8Array[], bu: [] as Uint8Array[] };
    const a = new PeerLink({
      unreliable: ch.host.unreliable,
      reliable: ch.host.reliable,
      now: () => net.now,
      tickNow: opts.hostTick,
      onReliable: (m) => got.a.push(m.slice()),
      onUnreliable: (m) => got.au.push(m.slice()),
    });
    const b = new PeerLink({
      unreliable: ch.member.unreliable,
      reliable: ch.member.reliable,
      now: () => net.now,
      onReliable: (m) => got.b.push(m.slice()),
      onUnreliable: (m) => got.bu.push(m.slice()),
    });
    const step = (to: number) => {
      for (let t = net.now + 1; t <= to; t++) {
        net.advance(t);
        if (t % 100 === 0) {
          a.update();
          b.update();
        }
      }
    };
    return { net, ch, a, b, got, step };
  }

  it('keeps the reliable stream whole and ordered across loss, reorder and fragmentation', () => {
    const { a, got, step } = pair({ latencyMs: 35, jitterMs: 10, loss: 0.05, reorder: true, seed: 4 });
    step(200);
    const sent: Uint8Array[] = [];
    for (let i = 0; i < 300; i++) {
      // Mostly small batches, some far beyond one chunk (a burst of string definitions).
      const size = i % 37 === 0 ? 40_000 + i * 13 : 20 + ((i * 97) % 900);
      const msg = new Uint8Array(size);
      for (let k = 0; k < size; k++) msg[k] = (i * 31 + k) & 0xff;
      msg[0] = 0x20;
      sent.push(msg);
      a.sendReliable(msg);
      step(200 + i * 15);
    }
    step(10_000);
    expect(got.b.length).toBe(sent.length);
    for (let i = 0; i < sent.length; i++) expect(got.b[i]).toEqual(sent[i]);
  });

  it('drops only unreliable messages under backpressure, and never sends one above the MTU', () => {
    // 6 KB/s: a 33 Hz stream of 1 KB snapshots cannot fit.
    const { a, ch, got, step } = pair({ latencyMs: 20, bandwidth: 6_000, seed: 2 });
    step(200);
    const reliable: Uint8Array[] = [];
    for (let i = 0; i < 300; i++) {
      a.sendUnreliable(tagged(TAG_SNAPSHOT, new Uint8Array(1000).fill(i & 0xff)));
      if (i % 10 === 0) {
        const m = new Uint8Array(200).fill(i & 0xff);
        m[0] = 0x20;
        reliable.push(m);
        a.sendReliable(m);
      }
      step(200 + i * 30);
    }
    expect(a.stats.droppedUnreliable).toBeGreaterThan(50);
    expect(ch.host.unreliable.bufferedAmount).toBeLessThanOrEqual(UNRELIABLE_HIGH_WATER + 1100);
    expect(a.sendUnreliable(tagged(TAG_SNAPSHOT, new Uint8Array(UNRELIABLE_MAX_BYTES)))).toBe(false);
    expect(a.stats.oversize).toBe(1);
    step(60_000);
    expect(got.b).toEqual(reliable);
    expect(got.bu.length).toBeGreaterThan(0);
    expect(got.bu.length).toBeLessThan(300);
    expect(ch.host.unreliable.overMtu).toBe(0);
  });

  it('syncs the member clock to the host tick and measures RTT, jitter and loss', () => {
    let tick = 1000;
    const { b, step, net } = pair({ latencyMs: 50, jitterMs: 8, loss: 0.1, seed: 9 }, { hostTick: () => tick + net.now / TICK_MS });
    step(20_000);
    void tick;
    const est = b.clockEstimate()!;
    expect(est.rttMs).toBeGreaterThan(84);
    expect(est.rttMs).toBeLessThan(110);
    expect(Math.abs(est.tickAt(net.now) - (1000 + net.now / TICK_MS))).toBeLessThan(2);
    expect(b.stats.loss).toBeGreaterThan(0.05);
    expect(b.stats.loss).toBeLessThan(0.4);
    expect(b.stats.jitterMs).toBeGreaterThan(1);
    tick = 0;
  });
});

describe('P2pHostSession validation', () => {
  function setup() {
    const net = new FakeNet();
    const calls: Array<[string, number, unknown?]> = [];
    const port: HostMatchPort = {
      add: (id: number, info: PlayerInfo) => calls.push(['add', id, info]),
      remove: (id) => calls.push(['remove', id]),
      input: (id, p) => calls.push(['input', id, p.byteLength]),
      command: (id, cmd: MatchCommand) => calls.push(['command', id, cmd]),
      resync: (id) => calls.push(['resync', id]),
    };
    const session = new P2pHostSession({
      code: CODE,
      map: 'ctf_2fort',
      mode: 'ctf',
      name: 'x',
      maxPlayers: 4,
      hostUserId: 'user-host',
      hostName: 'Host',
      localPlayerId: 1,
      match: port,
      now: () => net.now,
    });
    const connectMember = (userId: string, peerId: string) => {
      const res = session.admit({ code: CODE, peerId, userId, name: userId });
      const ch = fakeConnection(net, { latencyMs: 5 });
      const h = session.linkHandlers(peerId);
      const link: PeerLink = new PeerLink({
        unreliable: ch.host.unreliable,
        reliable: ch.host.reliable,
        now: () => net.now,
        ...h,
        onOpen: () => session.attach(peerId, link, 'direct'),
      });
      const raw = new PeerLink({ unreliable: ch.member.unreliable, reliable: ch.member.reliable, now: () => net.now });
      return { res, link, raw };
    };
    return { net, calls, session, connectMember };
  }

  it('refuses the host’s own account, kicked accounts and a full room', () => {
    const { session, net, connectMember } = setup();
    expect(session.admit({ code: CODE, peerId: 'peerhhhhhhhh', userId: 'user-host', name: 'h' })).toEqual({
      accept: false,
      reason: 'refused',
    });
    const a = connectMember('user-a', 'peeraaaaaaaa');
    connectMember('user-b', 'peerbbbbbbbb');
    connectMember('user-c', 'peercccccccc');
    net.advance(200);
    expect(a.res.accept).toBe(true);
    expect(session.admit({ code: CODE, peerId: 'peerdddddddd', userId: 'user-d', name: 'd' })).toEqual({
      accept: false,
      reason: 'full',
    });
    expect(session.kick('peeraaaaaaaa')?.userId).toBe('user-a');
    expect(session.admit({ code: CODE, peerId: 'peereeeeeeee', userId: 'user-a', name: 'a' })).toEqual({
      accept: false,
      reason: 'kicked',
    });
  });

  it('validates every member packet like the hub: tags, lengths, schemas, rates', () => {
    const { session, net, calls, connectMember } = setup();
    const { raw } = connectMember('user-a', 'peeraaaaaaaa');
    net.advance(200);
    expect(calls[0][0]).toBe('add');
    calls.length = 0;
    // Wrong tag, empty, oversized input; a snapshot from a member.
    raw.sendUnreliable(new Uint8Array([0x7f, 1, 2]));
    raw.sendUnreliable(new Uint8Array([TAG_INPUT]));
    raw.sendSequenced(TAG_INPUT, new Uint8Array(0));
    raw.sendSequenced(TAG_INPUT, new Uint8Array(600));
    raw.sendSequenced(TAG_SNAPSHOT, new Uint8Array(20));
    raw.sendSequenced(TAG_INPUT, new Uint8Array(40));
    // Malformed JSON, an unknown command, an out-of-range voice line, chat with control characters.
    raw.sendReliable(new Uint8Array([0x21, 0x7b, 0x7b]));
    raw.sendReliable(encodeControl({ t: 'cmd', cmd: { kind: 'rcon', command: 'quit' } }));
    raw.sendReliable(encodeControl({ t: 'cmd', cmd: { kind: 'voice', menu: 0, item: 9 } }));
    raw.sendReliable(encodeControl({ t: 'cmd', cmd: { kind: 'chat', text: 'hi\u0007 there' } }));
    raw.sendReliable(encodeControl({ t: 'eval', code: 'alert(1)' }));
    for (let i = 0; i < 40; i++) raw.sendReliable(encodeControl({ t: 'cmd', cmd: { kind: 'team', team: 'red' } }));
    net.advance(1000);
    expect(calls.filter((c) => c[0] === 'input')).toEqual([['input', 2, 40]]);
    const commands = calls.filter((c) => c[0] === 'command').map((c) => c[2] as MatchCommand);
    expect(commands[0]).toEqual({ kind: 'chat', text: 'hi there', teamOnly: false });
    expect(commands.filter((c) => c.kind === 'team').length).toBe(PEER_RATE_LIMITS.team);
    expect(commands.some((c) => c.kind === 'voice')).toBe(false);
    expect(session.stats.rejected).toBe(8);
    expect(session.stats.rateLimited).toBe(40 - PEER_RATE_LIMITS.team);
    // `leave` releases the seat at once.
    raw.sendReliable(encodeControl({ t: 'leave' }));
    net.advance(1200);
    expect(calls.at(-1)).toEqual(['remove', 2]);
  });
});

describe('PeerLink over channels that are already open', () => {
  it('reports onOpen after construction, so the callback can use the link', async () => {
    const net = new FakeNet();
    const ch = fakeConnection(net, { latencyMs: 5 }, 1);
    net.advance(10);
    expect(ch.host.reliable.readyState).toBe('open');
    let opened: PeerLink | null = null;
    const link: PeerLink = new PeerLink({
      unreliable: ch.host.unreliable,
      reliable: ch.host.reliable,
      now: () => net.now,
      onOpen: () => (opened = link),
    });
    expect(opened).toBeNull();
    await Promise.resolve();
    expect(opened).toBe(link);
    expect(link.isOpen).toBe(true);
  });
});
