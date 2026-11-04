/**
 * The adapter between a negotiated channel pair (lib/shared/p2p: two DataChannels, or the hub relay's
 * stand-ins) and the session core's minimal `Link` (protocol.ts).
 *
 * It is a `ReliableLink` underneath, which is what makes the session's frames safe on a real channel:
 *   - **Fragmentation.** A snapshot is the whole world (up to ~150 KB at the largest size) and a DataChannel
 *     message is only safely 16 KB across browsers (Chromium refuses above 256 KB outright). `ReliableLink`
 *     splits a message into 16 KB fragments and reassembles it (≤ 1 MiB), so `Link.send` takes any frame
 *     the protocol makes. The hub relay's packet cap is the same 16 KB + framing.
 *   - **Backpressure.** Frames go to the channel only while it buffers < 256 KiB; a peer so slow that 4 MiB
 *     piles up is dropped (`congested`) instead of eating the host's memory.
 *   - **Liveness.** Ping/pong on the unreliable channel; a link that hears nothing for 10 s (60 s on the hub
 *     relay, whose close never reaches the other end) closes — which is how the session notices a vanished
 *     host or peer without help from the hub.
 *
 * The `Link` contract here is stricter than a raw channel in two ways the session core relies on: messages
 * that arrive before `onmessage` is assigned are held and delivered once it is (the other end may send
 * the instant the channel opens), and `open` is true only while the link can carry traffic.
 */

import type { ChannelPair } from '../../shared/p2p/channel';
import type { Scheduler } from '../../shared/p2p/connector';
import { ReliableLink, LINK_TIMEOUT_MS, type ReliableLinkCloseReason } from '../../shared/p2p/reliable-link';
import type { Link } from './protocol';

export type ConnKind = 'direct' | 'turn' | 'relay';

/** The silence after which a link on the hub relay closes (see lib/balatro/mp/transport/wire-link.ts). */
export const RELAY_LINK_TIMEOUT_MS = 60_000;
/** Messages held for a listener that is not there yet. */
const EARLY_MAX = 256;

export interface ChannelLink extends Link {
  readonly kind: ConnKind;
  /** Fires once, when both channels are open and the link carries traffic (immediately if it already does). */
  onopen: (() => void) | null;
  /** Why it closed, or null while it lives. */
  readonly closedReason: ReliableLinkCloseReason | null;
  /** Smoothed round-trip time, for the player list. */
  readonly rttMs: number | null;
}

export function channelPairToLink(pair: ChannelPair, kind: ConnKind, sched: Scheduler): ChannelLink {
  let listener: ((data: Uint8Array) => void) | null = null;
  let closeListener: (() => void) | null = null;
  let openListener: (() => void) | null = null;
  let early: Uint8Array[] = [];
  let reason: ReliableLinkCloseReason | null = null;
  let stopTimer: (() => void) | null = null;
  let opened = false;
  let flushing = false;

  const flush = () => {
    if (flushing || !listener || early.length === 0) return;
    flushing = true;
    queueMicrotask(() => {
      flushing = false;
      const held = early;
      early = [];
      for (const m of held) listener?.(m);
    });
  };

  const rl: ReliableLink = new ReliableLink({
    unreliable: pair.unreliable,
    reliable: pair.reliable,
    now: () => sched.mono(),
    timeoutMs: kind === 'relay' ? RELAY_LINK_TIMEOUT_MS : LINK_TIMEOUT_MS,
    onMessage: (bytes) => {
      if (listener && early.length === 0 && !flushing) listener(bytes);
      else if (early.length < EARLY_MAX) {
        early.push(bytes);
        flush();
      }
    },
    onOpen: () => {
      opened = true;
      openListener?.();
    },
    onClose: (why) => {
      reason = why;
      stopTimer?.();
      stopTimer = null;
      closeListener?.();
    },
  });
  stopTimer = sched.every(250, () => rl.update());

  return {
    kind,
    get open() {
      return rl.isOpen;
    },
    get closedReason() {
      return reason;
    },
    get rttMs() {
      return rl.stats.rttMs;
    },
    send(data) {
      rl.send(data);
    },
    get onmessage() {
      return listener;
    },
    set onmessage(fn) {
      listener = fn;
      flush();
    },
    get onclose() {
      return closeListener;
    },
    set onclose(fn) {
      closeListener = fn;
      // A listener that arrives after the close still hears of it (once).
      if (fn && reason !== null) queueMicrotask(() => closeListener?.());
    },
    get onopen() {
      return openListener;
    },
    set onopen(fn) {
      openListener = fn;
      if (fn && opened && rl.isOpen) queueMicrotask(() => openListener?.());
    },
    close() {
      rl.close('local');
    },
  };
}
