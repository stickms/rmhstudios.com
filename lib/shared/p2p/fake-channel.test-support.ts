/**
 * TEST SUPPORT ONLY: an in-memory DataChannel pair on a fake clock, for the
 * peer-to-peer tests. Not imported by any runtime module. Extracted from the
 * TF2 transport (lib/tf2-game/net/p2p/fake-channel.test-support.ts re-exports it).
 *
 * Each direction models what a real `RTCDataChannel` does with a lossy path:
 *
 *   - **Serialization.** Sends queue behind each other at `bandwidth` bytes/s;
 *     what has not left yet is `bufferedAmount` (with `bufferedamountlow`
 *     when it drains below the threshold) — so backpressure is real.
 *   - **Unreliable** (`ordered: false, maxRetransmits: 0`): each message is
 *     lost with probability `loss` and delayed by latency ± jitter on its own,
 *     so jitter reorders; with `reorder` a message is additionally held back
 *     by up to two latencies.
 *   - **Reliable** (`ordered: true`): nothing is lost; a "lost" transmission is
 *     retransmitted one RTO later and everything behind it waits (head-of-line
 *     blocking, as SCTP's ordered delivery does).
 *   - **MTU.** Unreliable messages above `mtu` are counted (`overMtu`) and NOT
 *     delivered — the strict reading of "never send what would fragment".
 *     Anything above `maxMessageSize` throws, like Chromium's 256 KiB limit.
 *   - `close()` drains what is buffered, then closes both ends; `kill()` drops
 *     both ends at once (a tab closing); `partition` stops delivering silently
 *     (a network that went away: only the keepalive notices).
 */

import type { ChannelLike } from './channel';

/**
 * A seeded uniform stream (minimal-standard Park–Miller LCG with a Bays–Durham
 * shuffle) — the same generator as lib/tf2-game/core/random.ts, so a path
 * seeded the same way loses and reorders the same messages it always has.
 */
class SeededStream {
  private idum = 0;
  private iy = 0;
  private readonly iv = new Int32Array(32);

  constructor(seed: number) {
    this.idum = seed < 0 ? seed | 0 : -(seed | 0);
  }

  private generate(): number {
    const IA = 16807;
    const IM = 2147483647;
    const IQ = 127773;
    const IR = 2836;
    const NDIV = 1 + Math.floor((IM - 1) / 32);
    let k: number;
    if (this.idum <= 0 || this.iy === 0) {
      this.idum = -this.idum < 1 ? 1 : -this.idum;
      for (let j = 32 + 7; j >= 0; j--) {
        k = Math.floor(this.idum / IQ);
        this.idum = IA * (this.idum - k * IQ) - IR * k;
        if (this.idum < 0) this.idum += IM;
        if (j < 32) this.iv[j] = this.idum;
      }
      this.iy = this.iv[0];
    }
    k = Math.floor(this.idum / IQ);
    this.idum = IA * (this.idum - k * IQ) - IR * k;
    if (this.idum < 0) this.idum += IM;
    const j = Math.floor(this.iy / NDIV);
    this.iy = this.iv[j];
    this.iv[j] = this.idum;
    return this.iy;
  }

  /** Uniform float in [lo, hi). */
  randomFloat(lo = 0, hi = 1): number {
    const fl = Math.min((1 / 2147483647) * this.generate(), 1 - 1.2e-7);
    return fl * (hi - lo) + lo;
  }
}

export class FakeNet {
  now = 0;
  private queue: Array<{ at: number; seq: number; fn: () => void }> = [];
  private seq = 0;

  at(at: number, fn: () => void): void {
    const item = { at: Math.max(at, this.now), seq: this.seq++, fn };
    // Sorted insert (few items in flight).
    let i = this.queue.length;
    while (i > 0 && (this.queue[i - 1].at > item.at || (this.queue[i - 1].at === item.at && this.queue[i - 1].seq > item.seq))) i--;
    this.queue.splice(i, 0, item);
  }

  /** Runs everything due up to `to` (ms), moving `now` along. */
  advance(to: number): void {
    while (this.queue.length > 0 && this.queue[0].at <= to) {
      const item = this.queue.shift()!;
      this.now = item.at;
      item.fn();
    }
    this.now = to;
  }
}

export interface PathConfig {
  latencyMs: number;
  jitterMs?: number;
  loss?: number;
  reorder?: boolean;
  /** Bytes per second leaving the sender (default: effectively unlimited). */
  bandwidth?: number;
  mtu?: number;
  maxMessageSize?: number;
  seed?: number;
}

interface Direction {
  cfg: Required<PathConfig>;
  rng: SeededStream;
  /** When the sender's serializer is next free. */
  departFree: number;
  /** Ordered: the last delivery time (deliveries never overtake). */
  lastDelivery: number;
}

export interface FakeChannel extends ChannelLike {
  readonly label: string;
  /** Messages refused for exceeding the MTU (unreliable only). */
  overMtu: number;
  sent: number;
  lost: number;
  delivered: number;
  partition: boolean;
  kill(): void;
}

class Channel implements FakeChannel {
  readyState: ChannelLike['readyState'] = 'connecting';
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  onmessage: ((data: Uint8Array) => void) | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onbufferedamountlow: (() => void) | null = null;
  overMtu = 0;
  sent = 0;
  lost = 0;
  delivered = 0;
  partition = false;
  peer!: Channel;
  inFlight = 0;

  constructor(
    readonly label: string,
    private readonly net: FakeNet,
    private readonly dir: Direction,
    private readonly ordered: boolean,
  ) {}

  send(data: Uint8Array): void {
    if (this.readyState !== 'open') throw new Error(`InvalidStateError: ${this.label} is ${this.readyState}`);
    const cfg = this.dir.cfg;
    if (data.byteLength > cfg.maxMessageSize) throw new Error('OperationError: message too large');
    this.sent++;
    if (!this.ordered && data.byteLength > cfg.mtu) {
      this.overMtu++;
      return;
    }
    const copy = data.slice();
    const size = copy.byteLength;
    this.bufferedAmount += size;
    this.inFlight++;
    const departAt = Math.max(this.net.now, this.dir.departFree) + (size / cfg.bandwidth) * 1000;
    this.dir.departFree = departAt;
    this.net.at(departAt, () => {
      const before = this.bufferedAmount;
      this.bufferedAmount -= size;
      if (before > this.bufferedAmountLowThreshold && this.bufferedAmount <= this.bufferedAmountLowThreshold) {
        this.onbufferedamountlow?.();
      }
      this.transmit(copy);
    });
  }

  private transmit(data: Uint8Array): void {
    const { cfg, rng } = this.dir;
    const jitter = () => (cfg.jitterMs > 0 ? rng.randomFloat(-cfg.jitterMs, cfg.jitterMs) : 0);
    let arrive = this.net.now + cfg.latencyMs + jitter();
    if (this.ordered) {
      // Retransmit until it gets through: each loss costs an RTO.
      while (cfg.loss > 0 && rng.randomFloat() < cfg.loss) arrive += cfg.latencyMs * 2 + 20;
      arrive = Math.max(arrive, this.dir.lastDelivery);
      this.dir.lastDelivery = arrive;
    } else {
      if (cfg.loss > 0 && rng.randomFloat() < cfg.loss) {
        this.lost++;
        this.inFlight--;
        this.maybeFinishClose();
        return;
      }
      if (cfg.reorder && rng.randomFloat() < 0.1) arrive += rng.randomFloat(0, cfg.latencyMs * 2);
    }
    this.net.at(arrive, () => {
      this.inFlight--;
      if (!this.partition && this.peer.readyState === 'open') {
        this.delivered++;
        this.peer.onmessage?.(data);
      }
      this.maybeFinishClose();
    });
  }

  open(): void {
    if (this.readyState !== 'connecting') return;
    this.readyState = 'open';
    this.onopen?.();
  }

  close(): void {
    if (this.readyState === 'closed' || this.readyState === 'closing') return;
    this.readyState = 'closing';
    this.maybeFinishClose();
  }

  private maybeFinishClose(): void {
    if (this.readyState !== 'closing' || this.inFlight > 0) return;
    this.finish();
    // A partitioned network does not carry the close either.
    if (!this.partition) this.peer.finish();
  }

  finish(): void {
    if (this.readyState === 'closed') return;
    this.readyState = 'closed';
    this.onclose?.();
  }

  kill(): void {
    this.finish();
    this.peer.finish();
  }
}

function direction(cfg: PathConfig, seed: number): Direction {
  return {
    cfg: {
      latencyMs: cfg.latencyMs,
      jitterMs: cfg.jitterMs ?? 0,
      loss: cfg.loss ?? 0,
      reorder: cfg.reorder ?? false,
      bandwidth: cfg.bandwidth ?? 1e9,
      mtu: cfg.mtu ?? 1_200,
      maxMessageSize: cfg.maxMessageSize ?? 256 * 1024,
      seed,
    },
    rng: new SeededStream(seed),
    departFree: 0,
    lastDelivery: 0,
  };
}

/** One DataChannel (both ends), opened after `openMs`. */
export function fakeChannelPair(
  net: FakeNet,
  label: string,
  ordered: boolean,
  path: PathConfig,
  openMs = 50,
): [FakeChannel, FakeChannel] {
  const seed = path.seed ?? 1;
  const a = new Channel(`${label}:a`, net, direction(path, seed * 2 + 1), ordered);
  const b = new Channel(`${label}:b`, net, direction(path, seed * 2 + 2), ordered);
  a.peer = b;
  b.peer = a;
  net.at(net.now + openMs, () => {
    a.open();
    b.open();
  });
  return [a, b];
}

/** The two channels of a peer connection: `[hostSide, memberSide]` for each. */
export function fakeConnection(
  net: FakeNet,
  path: PathConfig,
  openMs = 50,
): { host: { unreliable: FakeChannel; reliable: FakeChannel }; member: { unreliable: FakeChannel; reliable: FakeChannel } } {
  const seed = path.seed ?? 1;
  const [hu, mu] = fakeChannelPair(net, 'unreliable', false, { ...path, seed: seed * 7 + 1 }, openMs);
  const [hr, mr] = fakeChannelPair(net, 'reliable', true, { ...path, seed: seed * 7 + 2 }, openMs);
  return { host: { unreliable: hu, reliable: hr }, member: { unreliable: mu, reliable: mr } };
}
