/**
 * Slice It — frame-timing telemetry (`O6`).
 *
 * The 07-30 audit measured this game's canvas cost with an external probe and
 * shipped `canvasGlowEnabled()` as the mitigation. The game reports no frame
 * timing from real players, so the tier's field effectiveness is unknown — and
 * the frame loop has changed substantially since.
 *
 * **In a rhythm game a frame-time spike is a missed note**, so this is a
 * correctness metric and not a performance nicety. Percentiles, never a mean: a
 * run at a perfect 60 fps with four 200 ms stalls has an excellent mean and
 * four missed notes.
 *
 * Browser-free — takes numbers, returns numbers, so the sampler can be tested
 * without a canvas.
 */

/**
 * How many frames are retained.
 *
 * A fixed ring, allocated once. A growing array is an allocation per frame and
 * a GC pause during a run, which would make the instrument the problem it is
 * measuring. 4096 frames is ~68 seconds at 60 fps; older frames age out, which
 * is correct — the tail of a long song is not more interesting than its middle,
 * and the alternative is retaining 30 000 floats to answer the same question.
 */
export const FRAME_CAPACITY = 4096;

/**
 * A stall long enough to lose a note.
 *
 * 50 ms is roughly the GOOD window's half-width: a frame that takes longer than
 * that can move a note from inside the window to outside it between two
 * consecutive draws, which is the player missing a note they hit.
 */
export const STALL_MS = 50;

export interface FrameReport {
  p50: number;
  p95: number;
  p99: number;
  /** Longest single frame observed, in the retained window. */
  max: number;
  /** Frames over {@link STALL_MS}, counted over the WHOLE run, not the ring. */
  stalls: number;
  /** Frames counted over the whole run. */
  frames: number;
}

export class FrameSampler {
  private readonly ring = new Float32Array(FRAME_CAPACITY);
  private cursor = 0;
  private filled = 0;
  private total = 0;
  private stallCount = 0;
  private worst = 0;

  /** Record one frame's duration, in milliseconds. */
  push(deltaMs: number): void {
    // Guard the pathological first frame and a tab that was backgrounded: a
    // 40-second delta from a hidden tab is not a stall the player experienced,
    // and it would dominate every percentile in the ring.
    if (!Number.isFinite(deltaMs) || deltaMs <= 0 || deltaMs > 1000) return;
    this.ring[this.cursor] = deltaMs;
    this.cursor = (this.cursor + 1) % FRAME_CAPACITY;
    if (this.filled < FRAME_CAPACITY) this.filled++;
    this.total++;
    if (deltaMs > this.worst) this.worst = deltaMs;
    // Counted outside the ring, so a run that stalled early and then recovered
    // still reports the stall rather than having it age out.
    if (deltaMs >= STALL_MS) this.stallCount++;
  }

  get sampleCount(): number {
    return this.filled;
  }

  report(): FrameReport | null {
    // Under a second of frames is a run that was abandoned in the countdown.
    if (this.filled < 60) return null;
    const sorted = Float32Array.prototype.slice.call(this.ring, 0, this.filled).sort();
    return {
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      max: round2(this.worst),
      stalls: this.stallCount,
      frames: this.total,
    };
  }

  reset(): void {
    this.cursor = 0;
    this.filled = 0;
    this.total = 0;
    this.stallCount = 0;
    this.worst = 0;
  }
}

/** Nearest-rank percentile over an ALREADY SORTED array. */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return round2(sorted[rank]);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The beacon body.
 *
 * The context fields are the whole point: a p99 of 90 ms means nothing without
 * knowing whether the glow tier was on and what the device pixel ratio was —
 * those are the two things the mitigation actually controls, and the reason
 * this telemetry exists is to find out whether the mitigation works.
 */
export interface FrameBeacon extends FrameReport {
  glow: boolean;
  dpr: number;
  notes: number;
  difficulty: string;
}

export function frameBeacon(
  report: FrameReport,
  context: { glow: boolean; dpr: number; notes: number; difficulty: string },
): FrameBeacon {
  return { ...report, ...context, dpr: Math.round(context.dpr * 100) / 100 };
}
