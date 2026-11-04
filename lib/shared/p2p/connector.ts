/**
 * The seams every peer-to-peer session runtime shares (extracted from Balatro's transport, PLAN §3.e):
 * a `Scheduler` (so a runtime runs on a fake clock in Node), the `PeerConnector` interface (one
 * host ↔ member connection attempt) and its browser implementation over `DirectConnection`.
 *
 * Apps own their hub contract; this module knows nothing of it. A hub that has no null
 * end-of-candidates event (Balatro, Hearthworks) never signals one (`endOfCandidates: false`). When no
 * direct or TURN path forms in time, `onFailed` tells the owner to fall back to the hub relay.
 *
 * `webrtcConnector` is browser only at call time (it builds an `RTCPeerConnection`); importing this file
 * is safe anywhere. Test builds can pass `P2pTestHooks` (`blockCandidates` forces the relay path,
 * `relayOnly` proves TURN).
 */

import type { ChannelPair } from './channel';
import type { IceServerConfig } from './ice-core';
import { DirectConnection, type IceCandidateLike, type P2pTestHooks, type SessionDescriptionLike, type SignalOut } from './webrtc';

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

/** The browser's PeerConnector: one `DirectConnection` (./webrtc.ts) per host ↔ member pair. */
export function webrtcConnector(hooks?: P2pTestHooks): PeerConnector {
  return {
    connect(opts: PeerConnectOptions): PeerAttempt {
      const dc = new DirectConnection({
        role: opts.role,
        iceServers: hooks?.iceServers ?? opts.ice,
        hooks,
        endOfCandidates: false,
        signal: opts.signal,
        onChannels: opts.onChannels,
        onFailed: opts.onFailed,
      });
      return {
        handle: (s) => void dc.handle(s),
        close: () => dc.close(),
      };
    },
  };
}
