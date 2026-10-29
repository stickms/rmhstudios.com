/**
 * `net_graph`'s numbers: incoming and outgoing bytes and packets per second,
 * packet loss and choke, from the client's own counters (SnapshotClient's
 * cumulative snapshot / reliable bytes, the newest snapshot tick, and the
 * input packets the client sent), sampled a few times a second over a
 * one-second window — what Source's CNetGraphPanel shows from INetChannelInfo.
 *
 * Loss is snapshots that never arrived: the server sends one every
 * `snapshotInterval` ticks, so the newest tick advancing by N intervals while
 * fewer than N snapshots came in means the rest were dropped (volatile
 * packets; on the hub they are dropped under backpressure, which the hub
 * cannot report, so a hub room's choke shows 0). Over a peer-to-peer link the
 * counters carry the real thing instead: loss from the snapshots' own sequence
 * numbers, choke as the host reports it (snapshots its channel was too backed
 * up to send) and the transit jitter (net/p2p/loss.ts).
 *
 * Environment-agnostic.
 */

export interface NetCounters {
  /** Bytes received so far (snapshots + reliable batches). */
  inBytes: number;
  /** Packets received so far. */
  inPackets: number;
  /** Snapshots decoded so far. */
  snapshots: number;
  /** The newest snapshot's tick (0 before the first). */
  newestTick: number;
  /** Ticks between the server's snapshots (hello.snapshotInterval). */
  snapshotInterval: number;
  /** Measured from the traffic's sequence numbers (peer-to-peer), when there is such a measure (0…100). */
  lossPct?: number;
  chokePct?: number;
  jitterMs?: number;
}

export interface NetGraphStats {
  inBytesPerSec: number;
  outBytesPerSec: number;
  inPacketsPerSec: number;
  outPacketsPerSec: number;
  /** 0…100. */
  lossPct: number;
  chokePct: number;
  /** Transit jitter (ms), when the link measures it. */
  jitterMs?: number;
  /** Snapshots per second actually received (cl_updaterate as delivered). */
  updateRate: number;
}

interface Sample {
  t: number;
  c: NetCounters;
  outBytes: number;
  outPackets: number;
}

export const NET_GRAPH_WINDOW_MS = 1000;

export class NetGraphMeter {
  private readonly samples: Sample[] = [];
  private outBytes = 0;
  private outPackets = 0;

  /** One input packet sent. */
  recordOut(bytes: number): void {
    this.outBytes += bytes;
    this.outPackets++;
  }

  /** Takes a sample of the counters (call a few times a second). */
  sample(now: number, c: NetCounters): void {
    this.samples.push({ t: now, c: { ...c }, outBytes: this.outBytes, outPackets: this.outPackets });
    // Keep a little more than one window.
    while (this.samples.length > 2 && now - this.samples[1].t >= NET_GRAPH_WINDOW_MS) this.samples.shift();
  }

  reset(): void {
    this.samples.length = 0;
  }

  stats(): NetGraphStats | null {
    if (this.samples.length < 2) return null;
    const a = this.samples[0];
    const b = this.samples[this.samples.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt <= 0) return null;
    const snaps = Math.max(0, b.c.snapshots - a.c.snapshots);
    const interval = Math.max(1, b.c.snapshotInterval);
    const expected = b.c.newestTick > a.c.newestTick && a.c.newestTick > 0 ? (b.c.newestTick - a.c.newestTick) / interval : 0;
    const lossPct = expected > 0 ? Math.max(0, Math.min(100, (1 - snaps / expected) * 100)) : 0;
    return {
      inBytesPerSec: Math.max(0, b.c.inBytes - a.c.inBytes) / dt,
      outBytesPerSec: Math.max(0, b.outBytes - a.outBytes) / dt,
      inPacketsPerSec: Math.max(0, b.c.inPackets - a.c.inPackets) / dt,
      outPacketsPerSec: Math.max(0, b.outPackets - a.outPackets) / dt,
      lossPct: b.c.lossPct ?? lossPct,
      chokePct: b.c.chokePct ?? 0,
      ...(b.c.jitterMs !== undefined ? { jitterMs: b.c.jitterMs } : {}),
      updateRate: snaps / dt,
    };
  }
}
