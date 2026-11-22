/**
 * Loss, jitter and choke from the real unreliable traffic of a link (every
 * input packet and snapshot carries a u16 sequence, the sender's clock and a
 * choke count — wire.ts `sequenced`), the numbers net_graph and the
 * scoreboard show, as Source's INetChannelInfo reports them from its packet
 * sequence numbers:
 *
 *   - **loss**: of the last `LOSS_WINDOW` sequence numbers, the share that
 *     never arrived (a late one still counts — the channel is unordered);
 *   - **jitter**: RFC 3550's estimator over successive packets' transit times
 *     (arrival − the sender's clock), smoothed by 1/16;
 *   - **choke**: messages the SENDER dropped before they left (its channel was
 *     backed up), as it reported them — a share of everything it meant to send.
 *
 * Environment-agnostic.
 */

export const LOSS_WINDOW = 128;

export class SequenceMeter {
  private readonly got = new Uint8Array(LOSS_WINDOW);
  /** Highest sequence seen, unwrapped (−1 before the first). */
  private top = -1;
  /** Sequence numbers covered so far (≤ LOSS_WINDOW counts toward the share). */
  private span = 0;
  private lastTransit: number | null = null;
  private lastSeq = -1;
  /** Smoothed transit jitter, ms. */
  jitterMs = 0;
  received = 0;
  /** Messages the sender reported dropping (choke), in all. */
  choked = 0;
  private recentChoke = 0;
  private recentSent = 0;

  /** One message arrived: its u16 sequence, the sender's u16 ms clock, its choke count; `nowMs` is ours. */
  record(seq16: number, sentMs16: number, choke: number, nowMs: number): void {
    this.received++;
    this.choked += choke;
    // Choke share over roughly the loss window.
    this.recentChoke += choke;
    this.recentSent += 1 + choke;
    if (this.recentSent > LOSS_WINDOW * 2) {
      this.recentChoke /= 2;
      this.recentSent /= 2;
    }
    let seq: number;
    if (this.top < 0) {
      seq = seq16;
      this.top = seq;
      this.got.fill(0);
      this.got[seq % LOSS_WINDOW] = 1;
      this.span = 1;
    } else {
      const diff = ((seq16 - (this.top & 0xffff) + 0x8000) & 0xffff) - 0x8000;
      seq = this.top + diff;
      if (diff > 0) {
        // Everything between was not here (yet).
        const steps = Math.min(diff, LOSS_WINDOW);
        for (let i = 1; i < steps; i++) this.got[(seq - i) % LOSS_WINDOW] = 0;
        if (diff >= LOSS_WINDOW) this.got.fill(0);
        this.got[seq % LOSS_WINDOW] = 1;
        this.span = Math.min(LOSS_WINDOW, this.span + diff);
        this.top = seq;
      } else if (diff > -LOSS_WINDOW && diff <= 0 && this.top - seq < this.span) {
        // A late arrival inside the window (reordered): it was not lost after all.
        this.got[((seq % LOSS_WINDOW) + LOSS_WINDOW) % LOSS_WINDOW] = 1;
      }
    }
    // RFC 3550 jitter over consecutive in-order packets: D = (arrival − sent) − (previous arrival − previous sent).
    const transit = nowMs - sentMs16;
    if (this.lastTransit !== null && seq === this.lastSeq + 1) {
      // The sender's clock wraps every 65.536 s: compare the two transits mod 2^16.
      const d = ((((transit - this.lastTransit) % 65536) + 65536 + 32768) % 65536) - 32768;
      this.jitterMs += (Math.abs(d) - this.jitterMs) / 16;
    }
    if (seq > this.lastSeq) {
      this.lastTransit = transit;
      this.lastSeq = seq;
    }
  }

  /** Share of the recent sequence numbers that never arrived (0…1). */
  get loss(): number {
    if (this.span <= 1) return 0;
    let have = 0;
    for (let i = 0; i < this.span; i++) have += this.got[(this.top - i) % LOSS_WINDOW];
    return Math.max(0, 1 - have / this.span);
  }

  /** Share of what the sender meant to send that it dropped itself (0…1). */
  get choke(): number {
    return this.recentSent > 0 ? this.recentChoke / this.recentSent : 0;
  }

  reset(): void {
    this.got.fill(0);
    this.top = -1;
    this.span = 0;
    this.lastTransit = null;
    this.lastSeq = -1;
    this.jitterMs = 0;
    this.received = 0;
    this.choked = 0;
    this.recentChoke = 0;
    this.recentSent = 0;
  }
}
