/**
 * `ReliableLink` — one host ↔ member connection for apps whose traffic is all
 * reliable messages (Balatro multiplayer): the generic sibling of TF2's
 * `PeerLink` (lib/tf2-game/net/p2p/link.ts) without its tick clock, sequenced
 * snapshots or input channel.
 *
 *   - **Two channels** (`./channel.ts` ChannelPair): `unreliable` carries only
 *     ping/pong (`./wire.ts`), `reliable` (ordered) carries every message,
 *     split above 16 KB and reassembled (≤ 1 MiB a message).
 *   - **Backpressure, never blocking.** Messages queue in the link and go to
 *     the channel only while it buffers less than `RELIABLE_HIGH_WATER`
 *     (256 KiB); they resume on `bufferedamountlow` below `RELIABLE_LOW_WATER`
 *     (64 KiB). A peer so slow that `RELIABLE_QUEUE_MAX` (4 MiB) piles up in
 *     the link is dropped (`congested`).
 *   - **Keepalive and timeout.** Each side pings every second (five quick ones
 *     after opening); anything heard on either channel counts as life; a link
 *     that hears nothing for `timeoutMs` (10 s) closes (`timeout`). The owner
 *     reads `silentForMs()` for softer states ("away" after 5 s).
 *   - **Stats:** RTT (minimum of the last 8 round trips — queueing only
 *     adds), jitter (RFC 3550's estimator), loss (pings unanswered after 2 s,
 *     over the last 60), bytes and messages each way, queued bytes.
 *
 * Time comes from `now()`; the owner calls `update()` a few times a second
 * (or `startTimer()`), so tests run it on a fake clock. A protocol violation
 * on the reliable channel (a bad fragment) closes the link (`protocol`).
 *
 * Environment-agnostic.
 */

import type { ChannelLike } from './channel';
import {
  decodePing,
  encodeControl,
  encodePing,
  frameReliable,
  ReliableAssembler,
  RELIABLE_MESSAGE_MAX_BYTES,
  TAG_PING,
  TAG_PONG,
} from './wire';

export type ReliableLinkCloseReason = 'timeout' | 'closed' | 'congested' | 'protocol' | 'local';

/** Reliable frames go to the channel only while it buffers less than this… */
export const RELIABLE_HIGH_WATER = 256 * 1024;
/** …and resume when it drains below this. */
export const RELIABLE_LOW_WATER = 64 * 1024;
/** A peer that lets this much reliable data pile up in the link is too slow to keep. */
export const RELIABLE_QUEUE_MAX = 4 * 1024 * 1024;
/** No message for this long: the other side is gone. */
export const LINK_TIMEOUT_MS = 10_000;
export const PING_BURST = 5;
export const PING_BURST_INTERVAL_MS = 200;
export const PING_INTERVAL_MS = 1_000;
const LOSS_WINDOW = 60;
const LOSS_AFTER_MS = 2_000;
const RTT_WINDOW = 8;

export interface ReliableLinkStats {
  /** Best of the recent round trips (ms), null before the first pong. */
  rttMs: number | null;
  /** Smoothed variation of successive round trips (ms). */
  jitterMs: number;
  /** Fraction of recent pings that went unanswered (0…1). */
  loss: number;
  sentBytes: number;
  receivedBytes: number;
  /** Whole messages handed to `send` that left (all their frames). */
  sentMessages: number;
  /** Whole messages reassembled and delivered. */
  receivedMessages: number;
  /** Bytes waiting in the link (not yet handed to the channel). */
  queuedBytes: number;
}

export interface ReliableLinkOptions {
  unreliable: ChannelLike;
  reliable: ChannelLike;
  now: () => number;
  timeoutMs?: number;
  /** Largest message this side sends or accepts (≤ 1 MiB, the framing's own cap). */
  maxMessageBytes?: number;
  onMessage?: (message: Uint8Array) => void;
  onOpen?: () => void;
  onClose?: (reason: ReliableLinkCloseReason) => void;
}

export class ReliableLink {
  readonly stats: ReliableLinkStats = {
    rttMs: null,
    jitterMs: 0,
    loss: 0,
    sentBytes: 0,
    receivedBytes: 0,
    sentMessages: 0,
    receivedMessages: 0,
    queuedBytes: 0,
  };

  private readonly u: ChannelLike;
  private readonly r: ChannelLike;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly maxMessageBytes: number;
  private readonly assembler = new ReliableAssembler();
  /** Frames waiting for the channel; `last` marks the final frame of a message. */
  private readonly queue: Array<{ frame: Uint8Array; last: boolean }> = [];
  private nextMessageId = 1;
  private pingSeq = 0;
  private pingsSent = 0;
  private nextPingAt = 0;
  private readonly pings: Array<{ seq: number; sentAt: number; answered: boolean }> = [];
  private readonly rtts: number[] = [];
  private lastRtt = -1;
  private lastHeard: number;
  private opened = false;
  private closedReason: ReliableLinkCloseReason | null = null;

  constructor(private readonly opts: ReliableLinkOptions) {
    this.u = opts.unreliable;
    this.r = opts.reliable;
    this.now = opts.now;
    this.timeoutMs = opts.timeoutMs ?? LINK_TIMEOUT_MS;
    this.maxMessageBytes = Math.min(opts.maxMessageBytes ?? RELIABLE_MESSAGE_MAX_BYTES, RELIABLE_MESSAGE_MAX_BYTES);
    this.lastHeard = this.now();
    this.r.bufferedAmountLowThreshold = RELIABLE_LOW_WATER;
    this.u.onmessage = (data) => this.onUnreliableData(data);
    this.r.onmessage = (data) => this.onReliableData(data);
    this.u.onopen = this.r.onopen = () => this.checkOpen();
    this.u.onclose = this.r.onclose = () => this.close('closed');
    this.r.onbufferedamountlow = () => this.flush();
    // Channels handed over already open report `onOpen` on the next microtask, never from
    // inside this constructor (an `onOpen` that uses the link would run before it is assigned).
    queueMicrotask(() => this.checkOpen());
  }

  get isOpen(): boolean {
    return this.opened && this.closedReason === null;
  }

  get closed(): ReliableLinkCloseReason | null {
    return this.closedReason;
  }

  /** How long since anything arrived on either channel (ms). */
  silentForMs(): number {
    return Math.max(0, this.now() - this.lastHeard);
  }

  // ─── Sending ───────────────────────────────────────────────────────────────

  /**
   * One message, queued until the channel takes it (also before the link opens). False when it
   * was refused: the link is closed, the message is empty or above the size cap, or queueing it
   * congested the link (which then closes).
   */
  send(message: Uint8Array): boolean {
    if (this.closedReason) return false;
    if (message.byteLength === 0 || message.byteLength > this.maxMessageBytes) return false;
    const frames = frameReliable(message, this.nextMessageId++);
    frames.forEach((frame, i) => {
      this.queue.push({ frame, last: i === frames.length - 1 });
      this.stats.queuedBytes += frame.byteLength;
    });
    if (this.stats.queuedBytes > RELIABLE_QUEUE_MAX) {
      this.close('congested');
      return false;
    }
    this.flush();
    return true;
  }

  /** A CONTROL message (tag + JSON, `./wire.ts`). */
  sendControl(message: unknown): boolean {
    return this.send(encodeControl(message));
  }

  private flush(): void {
    if (!this.isOpen || this.r.readyState !== 'open') return;
    while (this.queue.length > 0 && this.r.bufferedAmount < RELIABLE_HIGH_WATER) {
      const { frame, last } = this.queue.shift()!;
      this.stats.queuedBytes -= frame.byteLength;
      try {
        this.r.send(frame);
      } catch {
        this.close('closed');
        return;
      }
      this.stats.sentBytes += frame.byteLength;
      if (last) this.stats.sentMessages++;
    }
  }

  private sendUnreliable(message: Uint8Array): void {
    if (!this.isOpen || this.u.readyState !== 'open') return;
    // A ping is worth nothing behind a backed-up channel; the timeout covers real silence.
    if (this.u.bufferedAmount > 16 * 1024) return;
    try {
      this.u.send(message);
      this.stats.sentBytes += message.byteLength;
    } catch {
      /* a dying channel: its close event follows */
    }
  }

  // ─── Receiving ─────────────────────────────────────────────────────────────

  private heard(bytes: number): void {
    this.lastHeard = this.now();
    this.stats.receivedBytes += bytes;
  }

  private onUnreliableData(data: Uint8Array): void {
    if (this.closedReason || data.byteLength === 0) return;
    this.heard(data.byteLength);
    const tag = data[0];
    if (tag !== TAG_PING && tag !== TAG_PONG) return; // nothing else rides this channel
    const p = decodePing(data);
    if (!p) return;
    if (tag === TAG_PING) this.sendUnreliable(encodePing(TAG_PONG, p.seq, p.sentAt, -1));
    else this.onPong(p.seq, p.sentAt);
  }

  private onReliableData(data: Uint8Array): void {
    if (this.closedReason) return;
    this.heard(data.byteLength);
    const message = this.assembler.push(data);
    if (message === false || (message && message.byteLength > this.maxMessageBytes)) {
      this.close('protocol');
      return;
    }
    if (!message) return;
    this.stats.receivedMessages++;
    this.opts.onMessage?.(message);
  }

  private onPong(seq: number, sentAt: number): void {
    const entry = this.pings.find((p) => p.seq === seq);
    if (!entry || entry.answered || entry.sentAt !== sentAt) return;
    entry.answered = true;
    const rtt = this.now() - sentAt;
    if (rtt < 0) return;
    if (this.lastRtt >= 0) this.stats.jitterMs += (Math.abs(rtt - this.lastRtt) - this.stats.jitterMs) / 16;
    this.lastRtt = rtt;
    this.rtts.push(rtt);
    if (this.rtts.length > RTT_WINDOW) this.rtts.shift();
    this.stats.rttMs = Math.min(...this.rtts);
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
    const settled = this.pings.filter((p) => now - p.sentAt >= LOSS_AFTER_MS).slice(-LOSS_WINDOW);
    this.stats.loss = settled.length > 0 ? settled.filter((p) => !p.answered).length / settled.length : 0;
    this.flush();
  }

  /** Drives `update()` from a timer (browser or Node); returns the stop function. */
  startTimer(intervalMs = 250): () => void {
    const id = setInterval(() => {
      this.update();
      if (this.closedReason) clearInterval(id);
    }, intervalMs);
    return () => clearInterval(id);
  }

  close(reason: ReliableLinkCloseReason = 'local'): void {
    if (this.closedReason) return;
    this.closedReason = reason;
    this.queue.length = 0;
    this.stats.queuedBytes = 0;
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
