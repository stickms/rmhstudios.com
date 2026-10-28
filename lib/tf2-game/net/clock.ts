/**
 * Server-tick clock sync from `tf2:ping` / `tf2:pong` round trips.
 *
 * Each pong carries the match tick the hub estimated when it answered. The
 * sample with the smallest round trip is the one least distorted by queueing,
 * so the estimate is built from the best of the last few samples (NTP's
 * minimum-delay filter): the server stamped the tick roughly half a round trip
 * before the pong arrived.
 *
 * Pure; times are the caller's monotonic clock (performance.now() ms).
 */

export interface ClockSample {
  /** Local time the ping left. */
  sentAt: number;
  /** Local time the pong arrived. */
  receivedAt: number;
  /** The match tick in the pong. */
  serverTick: number;
}

export interface ClockEstimate {
  /** Round trip of the sample in use, ms. */
  rttMs: number;
  /** The fractional server tick at local time `at`. */
  tickAt(at: number): number;
}

export class TickClock {
  private readonly samples: ClockSample[] = [];

  constructor(
    private readonly tickMs: number,
    private readonly window = 8,
  ) {}

  add(sample: ClockSample): void {
    if (!(sample.receivedAt >= sample.sentAt)) return;
    this.samples.push(sample);
    if (this.samples.length > this.window) this.samples.shift();
  }

  reset(): void {
    this.samples.length = 0;
  }

  get sampleCount(): number {
    return this.samples.length;
  }

  estimate(): ClockEstimate | null {
    let best: ClockSample | null = null;
    for (const s of this.samples) {
      if (!best || s.receivedAt - s.sentAt < best.receivedAt - best.sentAt) best = s;
    }
    if (!best) return null;
    const rttMs = best.receivedAt - best.sentAt;
    const stampedAt = best.receivedAt - rttMs / 2;
    const tick = best.serverTick;
    const tickMs = this.tickMs;
    return { rttMs, tickAt: (at: number) => tick + (at - stampedAt) / tickMs };
  }
}
