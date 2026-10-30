/**
 * The seams of the session runtime: everything it touches outside its own
 * logic comes in through these interfaces, so the whole runtime runs in Node
 * tests on a fake clock, an in-memory hub and in-memory DataChannels.
 *
 * Browser implementations: `../hub-client.ts` (HubLike), `./connector.ts`
 * (PeerConnector over WebRTC), `realScheduler` below, the WS3 Mailbox
 * (BridgeLike) and the engine's Emscripten FS (FsLike).
 */

import type { ChannelPair, IceCandidateLike, IceServerConfig, SessionDescriptionLike, SignalOut } from '../../../shared/p2p';
import type {
  BalatroC2SEvent,
  BalatroC2SPayload,
  BalatroS2CEvent,
  BalatroS2CPayload,
} from '../../net/events';
import type { J2LData, J2LType, L2JData, L2JType } from '../bridge-protocol';

/* ─── Time ───────────────────────────────────────────────────────────────── */

export interface Scheduler {
  /** Wall-clock ms (Date.now): referee times, `startedAt`; comparable across peers. */
  now(): number;
  /** Monotonic ms (performance.now): timers and link liveness; keeps counting in hidden tabs. */
  mono(): number;
  /** Run `fn` once after `ms`; returns a cancel function. */
  after(ms: number, fn: () => void): () => void;
  /** Run `fn` every `ms`; returns a cancel function. */
  every(ms: number, fn: () => void): () => void;
}

export function realScheduler(): Scheduler {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return {
    now: () => Date.now(),
    mono: () => (perf ? perf.now() : Date.now()),
    after(ms, fn) {
      const id = setTimeout(fn, ms);
      return () => clearTimeout(id);
    },
    every(ms, fn) {
      const id = setInterval(fn, ms);
      return () => clearInterval(id);
    },
  };
}

/* ─── The hub (socket.io signalling) ─────────────────────────────────────── */

export type HubStatus = 'connected' | 'connecting' | 'offline';

/** C2S payloads as callers write them (zod input: defaults may be omitted). */
export type HubOut<K extends BalatroC2SEvent> = K extends 'balatro:p2p:join'
  ? Omit<BalatroC2SPayload<K>, 'role'> & { role?: 'player' | 'spectator' }
  : BalatroC2SPayload<K>;

export interface HubLike {
  readonly status: HubStatus;
  emit<K extends BalatroC2SEvent>(event: K, data: HubOut<K>): void;
  /** S2C events, already validated against the frozen schemas. */
  on<K extends BalatroS2CEvent>(event: K, fn: (d: BalatroS2CPayload<K>) => void): () => void;
  /** Status changes; `reconnect` is true for a connect after an earlier one. */
  onStatus(fn: (s: HubStatus, info: { reconnect: boolean; reason?: string }) => void): () => void;
  /** The signed-in account: its id is this player's id everywhere (the hub vouches the same one). */
  account(): Promise<{ id: string; name: string; avatarUrl: string | null } | null>;
  destroy(): void;
}

/* ─── Peer connections ───────────────────────────────────────────────────── */

export interface PeerSignalIn {
  description?: SessionDescriptionLike;
  candidate?: IceCandidateLike | null;
}

export interface PeerConnectOptions {
  role: 'host' | 'member';
  ice: IceServerConfig[];
  signal(s: SignalOut): void;
  onChannels(pair: ChannelPair, kind: 'direct' | 'turn'): void;
  onFailed(why: 'timeout' | 'failed'): void;
}

export interface PeerAttempt {
  handle(signal: PeerSignalIn): void;
  close(): void;
}

export interface PeerConnector {
  connect(opts: PeerConnectOptions): PeerAttempt;
}

/* ─── Lua (the WS3 mailbox) and the engine FS ────────────────────────────── */

/** The slice of the WS3 Mailbox the runtime uses. */
export interface BridgeLike {
  send<T extends J2LType>(t: T, d: J2LData<T>): number;
  on<T extends L2JType>(t: T, fn: (d: L2JData<T>) => void): () => void;
}

/** The slice of Emscripten's FS the runtime uses (snapshots, glyphs). */
export interface FsLike {
  readFile(path: string, opts?: { encoding?: 'utf8' }): Uint8Array | string;
  writeFile(path: string, data: string | Uint8Array): void;
  analyzePath(path: string): { exists: boolean };
  mkdir(path: string): void;
}
