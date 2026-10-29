/**
 * `PeerLink` — one host ↔ member connection over two channels: `unreliable`
 * (unordered, no retransmits) for input and snapshots, `reliable` (ordered)
 * for the reliable stream and control messages (docs/tf2-game.md
 * "Peer-to-peer play"). The channels are anything shaped like an
 * `RTCDataChannel` (`ChannelLike`): a real one (`client/net/webrtc.ts`), the
 * hub relay's stand-in, or the in-memory test pair.
 *
 * What the link owns, so neither the host nor the member has to:
 *
 *   - **Backpressure, never blocking.** An unreliable message is dropped (and
 *     counted) when the channel already holds more than
 *     `UNRELIABLE_HIGH_WATER` bytes — a stale snapshot is worth nothing, the
 *     next one deltas from whatever was acknowledged. Reliable messages queue
 *     in the link and drain on `bufferedamountlow`; a member so slow that
 *     `RELIABLE_QUEUE_MAX` bytes pile up is disconnected (`congested`).
 *   - **MTU.** Unreliable messages above `UNRELIABLE_MAX_BYTES` are refused
 *     (never sent as IP fragments); reliable ones above 16 KB are split and
 *     reassembled (`wire.ts`).
 *   - **Keepalive and timeout.** Each side pings every second (five quick
 *     ones after opening); a link that hears nothing for `timeoutMs` (10 s)
 *     is gone.
 *   - **Clock sync and stats.** The host answers pings with its match tick,
 *     so a member's `TickClock` (../clock.ts) syncs exactly as over the hub;
 *     both sides keep RTT (min-filtered, like the clock), jitter (RFC 3550's
 *     estimator over successive round trips) and loss (pings unanswered after
 *     2 s, over the last 60).
 *
 * Time comes from `now()` and the owner calls `update()` a few times a
 * second (the host on its frame, a member from a timer) — no timers inside,
 * so tests run it on a fake clock.
 *
 * Environment-agnostic.
 */

import { TickClock, type ClockEstimate } from '../clock';
import {
  decodePing,
  encodePing,
  frameReliable,
  readSequence,
  ReliableAssembler,
  SEQ_HEADER_BYTES,
  sequenced,
  SEQUENCED_TAGS,
  TAG_PING,
  TAG_PONG,
  UNRELIABLE_MAX_BYTES,
} from './wire';
import { SequenceMeter } from './loss';
import { TICK_INTERVAL } from '../../core/constants';

/** The part of `RTCDataChannel` the link uses. */
export interface ChannelLike {
  readonly readyState: 'connecting' | 'open' | 'closing' | 'closed';
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  send(data: Uint8Array): void;
  onmessage: ((data: Uint8Array) => void) | null;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onbufferedamountlow: (() => void) | null;
  close(): void;
}

export type LinkCloseReason = 'timeout' | 'closed' | 'congested' | 'protocol' | 'local';

/** Unreliable sends are dropped while this much is already buffered (~10 snapshots). */
export const UNRELIABLE_HIGH_WATER = 16 * 1024;
/** Reliable frames go to the channel only while it buffers less than this… */
export const RELIABLE_HIGH_WATER = 256 * 1024;
/** …and resume when it drains below this. */
export const RELIABLE_LOW_WATER = 64 * 1024;
/** A member that lets this much reliable data pile up is too slow to play. */
export const RELIABLE_QUEUE_MAX = 4 * 1024 * 1024;
/** No message for this long: the other side is gone. */
export const LINK_TIMEOUT_MS = 10_000;
export const PING_BURST = 5;
export const PING_BURST_INTERVAL_MS = 200;
export const PING_INTERVAL_MS = 1_000;
const LOSS_WINDOW = 60;
const LOSS_AFTER_MS = 2_000;

export interface LinkStats {
  /** Best recent round trip (ms), null before the first pong. */
  rttMs: number | null;
  /** Smoothed variation of successive round trips (ms). */
  jitterMs: number;
  /** Fraction of recent pings that went unanswered (0…1). */
  loss: number;
  sentBytes: number;
  receivedBytes: number;
  sentPackets: number;
  receivedPackets: number;
  /** Unreliable messages dropped because the channel was congested. */
  droppedUnreliable: number;
  /** Unreliable messages refused for exceeding the MTU rule. */
  oversize: number;
  /** Largest unreliable message sent (bytes). */
  maxUnreliableBytes: number;
  /** Reliable bytes waiting in the link (not yet handed to the channel). */
  reliableQueuedBytes: number;
  /** From the other side's sequenced traffic (input or snapshots): share lost on the way (0…1). */
  trafficLoss: number;
  /** …the share the other side had to drop before sending (choke, 0…1). */
  trafficChoke: number;
  /** …transit jitter (RFC 3550, ms). */
  trafficJitterMs: number;
  /** Sequenced messages received. */
  trafficReceived: number;
  /** Sequenced messages WE dropped before sending (our choke), in all. */
  choked: number;
}

export interface PeerLinkOptions {
  unreliable: ChannelLike;
  reliable: ChannelLike;
  now: () => number;
  /** The host's estimated match tick for pongs (members leave it out: they answer −1). */
  tickNow?: () => number;
  timeoutMs?: number;
  onUnreliable?: (message: Uint8Array) => void;
  onReliable?: (message: Uint8Array) => void;
  onOpen?: () => void;
  onClose?: (reason: LinkCloseReason) => void;
  /** A new clock estimate after a pong that carried a tick. */
  onClock?: (estimate: ClockEstimate) => void;
}

export class PeerLink {
  readonly stats: LinkStats = {
    rttMs: null,
    jitterMs: 0,
    loss: 0,
    sentBytes: 0,
    receivedBytes: 0,
    sentPackets: 0,
    receivedPackets: 0,
    droppedUnreliable: 0,
    oversize: 0,
    maxUnreliableBytes: 0,
    reliableQueuedBytes: 0,
    trafficLoss: 0,
    trafficChoke: 0,
    trafficJitterMs: 0,
    trafficReceived: 0,
    choked: 0,
  };
  /** Loss, jitter and choke of what the other side sends us (sequenced messages). */
  readonly traffic = new SequenceMeter();
  private txSeq = 0;
  /** Sequenced sends dropped since the last one that left (reported in the next one's header). */
  private chokePending = 0;
  readonly clock = new TickClock(TICK_INTERVAL * 1000);

  private readonly u: ChannelLike;
  private readonly r: ChannelLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly assembler = new ReliableAssembler();
  private readonly queue: Uint8Array[] = [];
  private nextMessageId = 1;
  private pingSeq = 0;
  private pingsSent = 0;
  private nextPingAt = 0;
  private readonly pings: Array<{ seq: number; sentAt: number; answered: boolean }> = [];
  private lastRtt = -1;
  private lastHeard: number;
  private opened = false;
  private closedReason: LinkCloseReason | null = null;

  constructor(private readonly opts: PeerLinkOptions) {
    this.u = opts.unreliable;
    this.r = opts.reliable;
    this.now = opts.now;
    this.timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS;
    this.lastHeard = this.now();
    this.r.bufferedAmountLowThreshold = RELIABLE_LOW_WATER;
    this.u.onmessage = (data) => this.onUnreliableData(data);
    this.r.onmessage = (data) => this.onReliableData(data);
    this.u.onopen = this.r.onopen = () => this.checkOpen();
    this.u.onclose = this.r.onclose = () => this.close('closed');
    this.r.onbufferedamountlow = () => this.flush();
    // Channels that are open already (a direct connection hands them over open) report
    // `onOpen` on the next microtask, never from inside this constructor: an `onOpen` that
    // uses the link it was passed to would otherwise run before that variable is assigned.
    queueMicrotask(() => this.checkOpen());
  }

  get isOpen(): boolean {
    return this.opened && this.closedReason === null;
  }

  get closed(): LinkCloseReason | null {
    return this.closedReason;
  }

  /** The newest clock estimate (members), or null. */
  clockEstimate(): ClockEstimate | null {
    return this.clock.estimate();
  }

  // ─── Sending ───────────────────────────────────────────────────────────────

  /** One unreliable message (tag + body already joined). Returns false when it was dropped. */
  sendUnreliable(message: Uint8Array): boolean {
    if (!this.isOpen || this.u.readyState !== 'open') return false;
    if (message.byteLength > UNRELIABLE_MAX_BYTES) {
      this.stats.oversize++;
      return false;
    }
    if (this.u.bufferedAmount > UNRELIABLE_HIGH_WATER) {
      this.stats.droppedUnreliable++;
      return false;
    }
    try {
      this.u.send(message);
    } catch {
      this.stats.droppedUnreliable++;
      return false;
    }
    this.stats.sentBytes += message.byteLength;
    this.stats.sentPackets++;
    if (message.byteLength > this.stats.maxUnreliableBytes) this.stats.maxUnreliableBytes = message.byteLength;
    return true;
  }

  /**
   * One sequenced unreliable message (input, snapshots): the link adds the sequence header (wire.ts)
   * so the other side measures loss, jitter and choke from it. Returns false when it was dropped —
   * counted as choke and reported in the next one that leaves.
   */
  sendSequenced(tag: number, body: Uint8Array): boolean {
    const m = sequenced(tag, this.txSeq & 0xffff, this.now(), this.chokePending, body);
    const ok = this.sendUnreliable(m);
    if (ok) {
      this.txSeq++;
      this.chokePending = 0;
    } else if (this.isOpen) {
      this.chokePending = Math.min(255, this.chokePending + 1);
      this.stats.choked++;
    }
    return ok;
  }

  /** One reliable message: queued, never dropped while the link lives. */
  sendReliable(message: Uint8Array): void {
    if (this.closedReason) return;
    for (const frame of frameReliable(message, this.nextMessageId++)) {
      this.queue.push(frame);
      this.stats.reliableQueuedBytes += frame.byteLength;
    }
    if (this.stats.reliableQueuedBytes > RELIABLE_QUEUE_MAX) {
      this.close('congested');
      return;
    }
    this.flush();
  }

  private flush(): void {
    if (!this.isOpen || this.r.readyState !== 'open') return;
    while (this.queue.length > 0 && this.r.bufferedAmount < RELIABLE_HIGH_WATER) {
      const frame = this.queue.shift()!;
      this.stats.reliableQueuedBytes -= frame.byteLength;
      try {
        this.r.send(frame);
      } catch {
        this.close('closed');
        return;
      }
      this.stats.sentBytes += frame.byteLength;
      this.stats.sentPackets++;
    }
  }

  // ─── Receiving ─────────────────────────────────────────────────────────────

  private heard(bytes: number): void {
    this.lastHeard = this.now();
    this.stats.receivedBytes += bytes;
    this.stats.receivedPackets++;
  }

  private onUnreliableData(data: Uint8Array): void {
    if (this.closedReason || data.byteLength === 0) return;
    this.heard(data.byteLength);
    const tag = data[0];
    if (tag === TAG_PING || tag === TAG_PONG) {
      const p = decodePing(data);
      if (!p) return;
      if (tag === TAG_PING) {
        this.sendUnreliable(encodePing(TAG_PONG, p.seq, p.sentAt, this.opts.tickNow ? this.opts.tickNow() : -1));
      } else {
        this.onPong(p.seq, p.sentAt, p.tick);
      }
      return;
    }
    if (data.byteLength > UNRELIABLE_MAX_BYTES) return;
    if (SEQUENCED_TAGS.has(tag)) {
      const h = readSequence(data);
      if (!h) return;
      this.traffic.record(h.seq, h.sentMs, h.choke, this.now());
      const s = this.stats;
      s.trafficLoss = this.traffic.loss;
      s.trafficChoke = this.traffic.choke;
      s.trafficJitterMs = this.traffic.jitterMs;
      s.trafficReceived = this.traffic.received;
      // Hand on tag · body: the tag moves up over the header (the buffer is ours).
      data[SEQ_HEADER_BYTES] = tag;
      this.opts.onUnreliable?.(data.subarray(SEQ_HEADER_BYTES));
      return;
    }
    this.opts.onUnreliable?.(data);
  }

  private onReliableData(data: Uint8Array): void {
    if (this.closedReason) return;
    this.heard(data.byteLength);
    const message = this.assembler.push(data);
    if (message === false) {
      this.close('protocol');
      return;
    }
    if (message) this.opts.onReliable?.(message);
  }

  private onPong(seq: number, sentAt: number, tick: number): void {
    const entry = this.pings.find((p) => p.seq === seq);
    if (!entry || entry.answered || entry.sentAt !== sentAt) return;
    entry.answered = true;
    const now = this.now();
    const rtt = now - sentAt;
    if (rtt < 0) return;
    if (this.lastRtt >= 0) this.stats.jitterMs += (Math.abs(rtt - this.lastRtt) - this.stats.jitterMs) / 16;
    this.lastRtt = rtt;
    // The minimum of recent samples, as the clock does (queueing only adds).
    this.clock.add({ sentAt, receivedAt: now, serverTick: tick >= 0 ? tick : 0 });
    this.stats.rttMs = this.clock.estimate()?.rttMs ?? rtt;
    if (tick >= 0) {
      const est = this.clock.estimate();
      if (est) this.opts.onClock?.(est);
    }
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  private checkOpen(): void {
    if (this.opened || this.closedReason) return;
    if (this.u.readyState !== 'open' || this.r.readyState !== 'open') return;
    this.opened = true;
    this.lastHeard = this.now();
    this.nextPingAt = this.now();
    this.opts.onOpen?.();
    this.flush();
    this.update();
  }

  /** Pings, loss accounting and the timeout. Call a few times a second. */
  update(): void {
    if (this.closedReason || !this.opened) return;
    const now = this.now();
    if (now - this.lastHeard > this.timeoutMs) {
      this.close('timeout');
      return;
    }
    if (now >= this.nextPingAt) {
      const seq = ++this.pingSeq;
      this.pings.push({ seq, sentAt: now, answered: false });
      while (this.pings.length > LOSS_WINDOW + 8) this.pings.shift();
      this.sendUnreliable(encodePing(TAG_PING, seq, now));
      this.pingsSent++;
      this.nextPingAt = now + (this.pingsSent < PING_BURST ? PING_BURST_INTERVAL_MS : PING_INTERVAL_MS);
    }
    let settled = 0;
    let lost = 0;
    for (const p of this.pings) {
      if (now - p.sentAt < LOSS_AFTER_MS) continue;
      settled++;
      if (!p.answered) lost++;
    }
    if (settled > LOSS_WINDOW) {
      // Count only the newest LOSS_WINDOW settled pings.
      let skip = settled - LOSS_WINDOW;
      settled = 0;
      lost = 0;
      for (const p of this.pings) {
        if (now - p.sentAt < LOSS_AFTER_MS) continue;
        if (skip > 0) {
          skip--;
          continue;
        }
        settled++;
        if (!p.answered) lost++;
      }
    }
    this.stats.loss = settled > 0 ? lost / settled : 0;
    this.flush();
  }

  close(reason: LinkCloseReason = 'local'): void {
    if (this.closedReason) return;
    this.closedReason = reason;
    this.queue.length = 0;
    this.stats.reliableQueuedBytes = 0;
    for (const c of [this.u, this.r]) {
      c.onmessage = null;
      c.onopen = null;
      c.onclose = null;
      c.onbufferedamountlow = null;
      try {
        c.close();
      } catch {
        /* already closed */
      }
    }
    this.opts.onClose?.(reason);
  }
}

