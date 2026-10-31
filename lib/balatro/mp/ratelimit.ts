/**
 * Receiver-side rate limits (NET-10, D-35): token buckets on an injected clock.
 *
 * - Every peer link: 40 messages/s with a burst of 100; replay `log` frames
 *   have their own bucket of 20/s with a burst of 1024 (A3 §2.1).
 * - Chat: 1 line/s with a burst of 5, on the sender (before sending) and on
 *   every receiver (per original sender, after the host stamped `f`).
 *
 * Pure apart from the clock the caller passes (ms). Browser-free.
 */

export interface BucketSpec {
  /** Tokens added per second. */
  rate: number;
  /** Bucket size. */
  burst: number;
}

export const RATE_LIMITS = {
  PEER: { rate: 40, burst: 100 },
  LOG: { rate: 20, burst: 1024 },
  CHAT: { rate: 1, burst: 5 },
} as const satisfies Record<string, BucketSpec>;

export class TokenBucket {
  private tokens: number;
  private last: number | null = null;

  constructor(
    private readonly spec: BucketSpec,
    private readonly now: () => number,
  ) {
    this.tokens = spec.burst;
  }

  private refill(): void {
    const t = this.now();
    if (this.last !== null && t > this.last) {
      this.tokens = Math.min(this.spec.burst, this.tokens + ((t - this.last) / 1000) * this.spec.rate);
    }
    this.last = t;
  }

  /** Take `n` tokens; false (and nothing taken) when the bucket is short. */
  take(n = 1): boolean {
    this.refill();
    if (this.tokens + 1e-9 < n) return false;
    this.tokens -= n;
    return true;
  }

  /** Tokens available now (for tests and UI hints). */
  available(): number {
    this.refill();
    return this.tokens;
  }
}

/** One bucket per key (a sender id), created on first use. */
export class KeyedBuckets {
  private readonly buckets = new Map<string, TokenBucket>();

  constructor(
    private readonly spec: BucketSpec,
    private readonly now: () => number,
    private readonly maxKeys = 64,
  ) {}

  take(key: string, n = 1): boolean {
    let b = this.buckets.get(key);
    if (!b) {
      if (this.buckets.size >= this.maxKeys) {
        const oldest = this.buckets.keys().next().value;
        if (oldest !== undefined) this.buckets.delete(oldest);
      }
      b = new TokenBucket(this.spec, this.now);
      this.buckets.set(key, b);
    }
    return b.take(n);
  }

  forget(key: string): void {
    this.buckets.delete(key);
  }
}

/** A peer link's limiter: the general bucket plus the replay-log bucket. */
export class PeerLimiter {
  private readonly general: TokenBucket;
  private readonly log: TokenBucket;
  dropped = 0;

  constructor(now: () => number) {
    this.general = new TokenBucket(RATE_LIMITS.PEER, now);
    this.log = new TokenBucket(RATE_LIMITS.LOG, now);
  }

  allow(kind: string): boolean {
    const ok = kind === 'log' ? this.log.take() : this.general.take();
    if (!ok) this.dropped += 1;
    return ok;
  }
}
