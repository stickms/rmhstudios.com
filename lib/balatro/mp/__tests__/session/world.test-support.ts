/**
 * TEST SUPPORT ONLY — a whole multiplayer world in one Node process:
 *
 * - the REAL Balatro hub handler (server/socket-server/handlers/balatro-p2p.ts)
 *   on the fake socket.io world, each peer's HubLike a fake socket with a
 *   couple of ms of latency and S2C payloads parsed with the frozen schemas;
 * - P2P links on lib/shared/p2p's FakeNet channels, negotiated through the
 *   hub's real signal routing (the "SDP" is a registry token), with a switch
 *   that makes the direct path fail so the hub relay takes over;
 * - a fake Lua per peer: it validates every JS→Lua message exactly as the
 *   mailbox does (`encodeJsLine`) and lets a test emit Lua→JS messages;
 * - one clock: FakeNet's, plus vitest's fake timers for the hub's own grace
 *   timers (`step()` advances both and flushes microtasks).
 */

import { vi } from 'vitest';
import { FakeNet, fakeConnection, type FakeChannel } from '../../../../shared/p2p/fake-channel.test-support';
import { makeWorld, type FakeSocket } from '../../../../../server/socket-server/test-support/fake-world';
import {
  handleBalatroP2pDisconnect,
  registerBalatroP2pHandlers,
  resetBalatroP2pForTests,
} from '../../../../../server/socket-server/handlers/balatro-p2p';
import { BALATRO_S2C, type BalatroC2SEvent, type BalatroS2CEvent, type BalatroS2CPayload } from '../../../net/events';
import { encodeJsLine, parseBridgeMessage, type J2LData, type J2LType, type L2JData, type L2JType } from '../../bridge-protocol';
import type { BridgeLike, FsLike, HubLike, HubStatus, PeerAttempt, PeerConnectOptions, PeerConnector, PeerSignalIn, Scheduler } from '../../transport/types';
import { memoryKv, type KeyValue } from '../../history';
import { memorySnapshotStore } from '../../rejoin/rejoin-store';
import { MpRuntime, type StartIntent } from '../../lobby/runtime';
import { Rng } from '../../rng';
import type { GameEvent, RefMsg } from '../../types';

export const T0 = 1_762_000_000_000;
export const HASH = `${'a'.repeat(24)}-v1`;
export const OTHER_HASH = `${'b'.repeat(24)}-v1`;
const HUB_LATENCY_MS = 2;

/* ─── Clock ──────────────────────────────────────────────────────────────── */

export function fakeScheduler(net: FakeNet): Scheduler {
  return {
    now: () => T0 + net.now,
    mono: () => net.now,
    after(ms, fn) {
      let live = true;
      net.at(net.now + Math.max(0, ms), () => {
        if (live) fn();
      });
      return () => {
        live = false;
      };
    },
    every(ms, fn) {
      let live = true;
      const tick = () => {
        if (!live) return;
        fn();
        if (live) net.at(net.now + ms, tick);
      };
      net.at(net.now + ms, tick);
      return () => {
        live = false;
      };
    },
  };
}

/* ─── Fake Lua ───────────────────────────────────────────────────────────── */

export class FakeLua implements BridgeLike {
  readonly sent: { t: J2LType; d: unknown }[] = [];
  readonly invalid: string[] = [];
  private readonly handlers = new Map<string, Set<(d: unknown) => void>>();
  private seq = 0;

  send<T extends J2LType>(t: T, d: J2LData<T>): number {
    try {
      encodeJsLine(++this.seq, t, d);
    } catch (err) {
      this.invalid.push(`${t}: ${String(err).slice(0, 300)}`);
      return -1;
    }
    this.sent.push({ t, d: structuredClone(d) });
    return this.seq;
  }

  on<T extends L2JType>(t: T, fn: (d: L2JData<T>) => void): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(fn as (d: unknown) => void);
    return () => void set.delete(fn as (d: unknown) => void);
  }

  /** Lua sends a message (validated like the mailbox does). */
  emit<T extends L2JType>(t: T, d: L2JData<T>): void {
    const r = parseBridgeMessage('l2j', { s: ++this.seq, t, d });
    if (!r.ok) throw new Error(`fake Lua sent an invalid ${t}: ${JSON.stringify(r)}`);
    for (const fn of [...(this.handlers.get(t) ?? [])]) fn(r.msg.d);
  }

  all<T extends J2LType>(t: T): J2LData<T>[] {
    return this.sent.filter((m) => m.t === t).map((m) => m.d as J2LData<T>);
  }

  last<T extends J2LType>(t: T): J2LData<T> | undefined {
    const a = this.all(t);
    return a[a.length - 1];
  }

  outcomes(): { o: RefMsg; hs: number }[] {
    return this.all('outcome');
  }

  outcomesOf<K extends RefMsg['t']>(t: K): Extract<RefMsg, { t: K }>[] {
    return this.outcomes()
      .map((x) => x.o)
      .filter((o): o is Extract<RefMsg, { t: K }> => o.t === t);
  }

  errors(): string[] {
    return this.all('lobby_error').map((e) => e.code);
  }
}

/* ─── Fake FS ────────────────────────────────────────────────────────────── */

export function memoryFs(): FsLike & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const dirs = new Set<string>(['/']);
  return {
    files,
    readFile(path, opts) {
      const f = files.get(path);
      if (!f) throw new Error(`ENOENT ${path}`);
      return opts?.encoding === 'utf8' ? new TextDecoder().decode(f) : f.slice();
    },
    writeFile(path, data) {
      files.set(path, typeof data === 'string' ? new TextEncoder().encode(data) : data.slice());
    },
    analyzePath: (path) => ({ exists: files.has(path) || dirs.has(path) }),
    mkdir: (path) => void dirs.add(path),
  };
}

/* ─── Fake hub client ────────────────────────────────────────────────────── */

export class FakeHub implements HubLike {
  status: HubStatus = 'connected';
  socket: FakeSocket;
  private readonly listeners = new Map<string, Set<(d: unknown) => void>>();
  private readonly statusListeners = new Set<(s: HubStatus, info: { reconnect: boolean; reason?: string }) => void>();
  private gen = 0;
  readonly emitted: { event: string; data: unknown }[] = [];

  constructor(
    private readonly world: World,
    readonly userId: string,
    readonly name: string,
  ) {
    this.socket = this.attach();
  }

  private attach(): FakeSocket {
    this.gen += 1;
    const gen = this.gen;
    const sock = this.world.hub.connect(`${this.userId}-s${++this.world.socketSeq}`, { userId: this.userId, userName: this.name, avatarUrl: null });
    const deliver = (event: string, payload: unknown) => {
      const copy = payload instanceof Uint8Array ? payload.slice() : structuredClone(payload);
      this.world.net.at(this.world.net.now + HUB_LATENCY_MS, () => {
        if (this.gen === gen && this.status === 'connected') this.dispatch(event, copy);
      });
    };
    const s = sock as unknown as { emit: (e: string, p: unknown) => void; volatile: { emit: (e: string, p: unknown) => void } };
    s.emit = deliver;
    s.volatile.emit = deliver;
    return sock;
  }

  private dispatch(event: string, raw: unknown): void {
    const schema = (BALATRO_S2C as Record<string, { safeParse(v: unknown): { success: boolean; data?: unknown } }>)[event];
    const parsed = schema ? schema.safeParse(raw) : { success: true, data: raw };
    if (!parsed.success) throw new Error(`hub sent an invalid ${event}`);
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(parsed.data);
  }

  emit(event: BalatroC2SEvent, data: unknown): void {
    if (this.status !== 'connected') return;
    this.emitted.push({ event, data });
    const sock = this.socket;
    const payload = data instanceof Uint8Array ? data.slice() : structuredClone(data);
    this.world.net.at(this.world.net.now + HUB_LATENCY_MS, () => {
      if (this.socket === sock && this.status === 'connected') this.world.hub.send(sock, event, payload);
    });
  }

  on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as (d: unknown) => void);
    return () => void set.delete(fn as (d: unknown) => void);
  }

  onStatus(fn: (s: HubStatus, info: { reconnect: boolean; reason?: string }) => void): () => void {
    this.statusListeners.add(fn);
    return () => void this.statusListeners.delete(fn);
  }

  async account() {
    return { id: this.userId, name: this.name, avatarUrl: null };
  }

  /** The socket drops (tab closed, network gone). */
  drop(): void {
    if (this.status !== 'connected') return;
    this.status = 'offline';
    handleBalatroP2pDisconnect(this.world.hub.io, this.socket as never);
    this.world.hub.disconnect(this.socket);
    for (const fn of [...this.statusListeners]) fn('offline', { reconnect: false });
  }

  /** A new socket (reconnect after a drop). */
  reconnect(): void {
    this.socket = this.attach();
    this.status = 'connected';
    for (const fn of [...this.statusListeners]) fn('connected', { reconnect: true });
  }

  destroy(): void {
    this.drop();
  }
}

/* ─── Fake WebRTC ────────────────────────────────────────────────────────── */

const DIRECT_TIMEOUT_MS = 8_000;

export class FakeConnector implements PeerConnector {
  /** Make this peer's direct path fail (the relay takes over, E2E-15). */
  blockDirect = false;
  /** The simulated network path of the links this peer creates as host. */
  path: { latencyMs: number; jitterMs?: number; loss?: number; reorder?: boolean } = { latencyMs: 5 };
  readonly conns: { host: { unreliable: FakeChannel; reliable: FakeChannel }; member: { unreliable: FakeChannel; reliable: FakeChannel } }[] = [];

  constructor(private readonly world: World) {}

  connect(o: PeerConnectOptions): PeerAttempt {
    const w = this.world;
    let done = false;
    const fail = () => {
      if (done) return;
      done = true;
      o.onFailed('timeout');
    };
    w.net.at(w.net.now + DIRECT_TIMEOUT_MS, fail);
    if (o.role === 'host') {
      const token = `fake-sdp-${++w.sdpSeq}`;
      if (!this.blockDirect) {
        const conn = fakeConnection(w.net, { ...this.path, seed: w.sdpSeq }, 100);
        this.conns.push(conn);
        w.sdp.set(token, conn);
      }
      o.signal({ description: { type: 'offer', sdp: token } });
      return {
        handle: (s: PeerSignalIn) => {
          const conn = w.sdp.get(token);
          if (s.description?.type === 'answer' && conn && !done && !this.blockDirect) {
            done = true;
            o.onChannels(conn.host, 'direct');
          }
        },
        close: () => {
          done = true;
        },
      };
    }
    return {
      handle: (s: PeerSignalIn) => {
        if (s.description?.type !== 'offer' || done || this.blockDirect) return;
        const conn = w.sdp.get(s.description.sdp);
        if (!conn) return;
        this.conns.push(conn);
        done = true;
        o.onChannels(conn.member, 'direct');
        o.signal({ description: { type: 'answer', sdp: s.description.sdp } });
      },
      close: () => {
        done = true;
      },
    };
  }

  /** Every channel this peer used goes silent (a network partition; only keepalives notice). */
  partition(on: boolean): void {
    for (const c of this.conns) for (const ch of [c.host.unreliable, c.host.reliable, c.member.unreliable, c.member.reliable]) ch.partition = on;
  }

  /** Every channel this peer used dies at once (the tab closed). */
  kill(): void {
    for (const c of this.conns) {
      c.host.reliable.kill();
      c.host.unreliable.kill();
    }
  }
}

/* ─── Peers and the world ────────────────────────────────────────────────── */

export interface Peer {
  id: string;
  hub: FakeHub;
  lua: FakeLua;
  connector: FakeConnector;
  kv: KeyValue;
  fs: ReturnType<typeof memoryFs>;
  snapshots: ReturnType<typeof memorySnapshotStore>;
  runtime: MpRuntime;
  logs: string[];
}

export interface PeerOptions {
  path?: FakeConnector['path'];
  intent?: StartIntent;
  invite?: string | null;
  contentHash?: string;
  blockDirect?: boolean;
  /** Reuse storage (a reload of the same browser). */
  kv?: KeyValue;
  snapshots?: ReturnType<typeof memorySnapshotStore>;
  testBuild?: boolean;
}

export class World {
  readonly net = new FakeNet();
  readonly hub = makeWorld(registerBalatroP2pHandlers);
  readonly sched: Scheduler;
  readonly sdp = new Map<string, ReturnType<typeof fakeConnection>>();
  sdpSeq = 0;
  socketSeq = 0;
  readonly peers: Peer[] = [];
  private readonly rng = new Rng(12345);

  constructor() {
    resetBalatroP2pForTests();
    this.sched = fakeScheduler(this.net);
  }

  peer(id: string, o: PeerOptions = {}): Peer {
    const hub = new FakeHub(this, id, id.toUpperCase());
    const lua = new FakeLua();
    const connector = new FakeConnector(this);
    connector.blockDirect = o.blockDirect ?? false;
    if (o.path) connector.path = o.path;
    const kv = o.kv ?? memoryKv();
    const fs = memoryFs();
    const snapshots = o.snapshots ?? memorySnapshotStore();
    const logs: string[] = [];
    let n = 0;
    const runtime = new MpRuntime(
      {
        bridge: lua,
        hub,
        connector,
        sched: this.sched,
        fs,
        kv,
        snapshots,
        contentHash: o.contentHash ?? HASH,
        testBuild: o.testBuild ?? true,
        randomId: () => `${id}r${++n}${this.rng.int(1e6)}`.slice(0, 32),
        randomSeed: () => 'SEEDABCD',
        randomInt: () => this.rng.int(0x7fffffff),
        log: (m) => logs.push(m),
      },
      { intent: o.intent ?? 'menu', invite: o.invite ?? null, lang: 'en-us' },
    );
    const p: Peer = { id, hub, lua, connector, kv, fs, snapshots, runtime, logs };
    this.peers.push(p);
    return p;
  }

  /** Advance the shared clock by `ms` in small steps, flushing microtasks between them. */
  async step(ms: number, stepMs = 10): Promise<void> {
    const end = this.net.now + ms;
    while (this.net.now < end) {
      const to = Math.min(end, this.net.now + stepMs);
      this.net.advance(to);
      vi.advanceTimersByTime(to - (this.lastTimers ?? 0));
      this.lastTimers = to;
      await flush();
    }
  }

  private lastTimers: number | null = 0;

  /** Step until `check()` holds (or fail after `maxMs`). */
  async until(check: () => boolean, maxMs = 30_000, what = 'condition'): Promise<void> {
    const end = this.net.now + maxMs;
    await flush();
    while (!check()) {
      if (this.net.now >= end) throw new Error(`timed out waiting for ${what}`);
      await this.step(10);
    }
  }

  stop(): void {
    for (const p of this.peers) p.runtime.stop();
    resetBalatroP2pForTests();
  }
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

/* ─── Scenario helpers ───────────────────────────────────────────────────── */

export const code = (p: Peer) => p.lua.last('lobby_view')?.state.code ?? null;

export const NAMES = ['bob', 'carol', 'dave', 'erin', 'frank', 'gina', 'hank', 'ivy', 'jack', 'kim', 'liam', 'mia', 'nick', 'olga', 'pete'];

export async function lobbyWith(
  w: World,
  n: number,
  opts: { queueMode?: 'pvp_nemesis' | 'pvp_royale' | 'pvp_teams' | 'pvp_manhunt'; blockDirect?: boolean[]; testBuild?: boolean; path?: FakeConnector['path'] } = {},
) {
  const host = w.peer('alice', { testBuild: opts.testBuild, path: opts.path });
  await w.step(20);
  host.lua.emit('ui_create_lobby', { queueMode: opts.queueMode ?? 'pvp_nemesis', kind: 'private' });
  await w.until(() => !!host.runtime.role?.code && code(host) === host.runtime.role.code, 5_000, 'hosted');
  const members: Peer[] = [];
  for (let i = 1; i < n; i++) {
    const m = w.peer(NAMES[i - 1] as string, { blockDirect: opts.blockDirect?.[i] });
    await w.step(20);
    m.lua.emit('ui_join', { code: code(host) as string });
    members.push(m);
  }
  await w.until(
    () => members.every((m) => m.lua.last('lobby_view')?.state.players.length === n) && host.lua.last('lobby_view')?.state.players.length === n,
    30_000,
    'everyone in the lobby',
  );
  return { host, members, all: [host, ...members] };
}

export async function startMatch(w: World, host: Peer, members: Peer[], options: Record<string, unknown> = {}) {
  for (const [key, value] of Object.entries(options)) host.lua.emit('ui_set_option', { key: key as never, value: value as never });
  for (const m of members) m.lua.emit('ui_ready', { ready: true });
  await w.until(() => host.lua.last('lobby_view')?.canStart === true, 5_000, 'can start');
  host.lua.emit('ui_start', {});
  await w.until(() => [host, ...members].every((p) => !!p.lua.last('match_start')), 5_000, 'match_start everywhere');
}

export function ev(p: Peer, e: GameEvent) {
  p.lua.emit('ev', { e });
}

