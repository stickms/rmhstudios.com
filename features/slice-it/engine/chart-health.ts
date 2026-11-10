/**
 * Slice It — is this chart broken, and where (`O1`, `O2`).
 *
 * A chart that generates badly — the tempo tracker locking onto half time, the
 * onset filter dropping most of the song — ships silently today. The only
 * signal is people not playing it, which is indistinguishable from the chart
 * being obscure.
 *
 * Pure and browser-safe so the admin surface, the uploader dashboard and the
 * worker all compute the same verdict from the same numbers.
 */

/* ─── O1 — the miss heatmap ──────────────────────────────────────────────── */

/** One aggregated note. `noteMs` is the note's time, in milliseconds. */
export interface NoteStat {
  noteMs: number;
  attempts: number;
  misses: number;
}

export interface HeatmapBucket {
  /** Bucket start, seconds. */
  from: number;
  to: number;
  attempts: number;
  misses: number;
  /** `misses / attempts`, or `null` when nothing reached this bucket. */
  rate: number | null;
}

/**
 * Whether a run's note results should be counted at all.
 *
 * 1-in-10, keyed off the run id rather than sampled randomly: the same run must
 * make the same decision on a retry, or a retried job double-counts. A popular
 * chart does not need every run to know which bar people fail — 1-in-10
 * converges within a day and costs a tenth of the writes, and a chart with too
 * few plays for that to converge is one nobody is complaining about.
 */
export const NOTE_STAT_SAMPLE_RATE = 10;

export function shouldSampleRun(runId: string | number): boolean {
  const text = String(runId);
  // FNV-1a. Deterministic, one pass, and not `Math.random()` — see above.
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash % NOTE_STAT_SAMPLE_RATE === 0;
}

/**
 * Bucket per-note stats into a timeline the uploader can read.
 *
 * Buckets rather than raw notes: a 1200-note chart is 1200 points, which is
 * noise on a 600-pixel strip, and the question being asked is "which BAR is
 * unplayable", not "which note".
 */
export function missHeatmap(
  stats: readonly NoteStat[],
  durationSec: number,
  buckets = 64,
): HeatmapBucket[] {
  const width = durationSec > 0 ? durationSec / buckets : 0;
  const out: HeatmapBucket[] = Array.from({ length: buckets }, (_, i) => ({
    from: i * width,
    to: (i + 1) * width,
    attempts: 0,
    misses: 0,
    rate: null,
  }));
  if (width <= 0) return out;

  for (const stat of stats) {
    const index = Math.floor(stat.noteMs / 1000 / width);
    // A note past the chart's stated duration is a chart bug, not a reason to
    // drop the data — clamp it into the last bucket so it stays visible.
    const bucket = out[Math.max(0, Math.min(buckets - 1, index))];
    bucket.attempts += stat.attempts;
    bucket.misses += stat.misses;
  }
  for (const bucket of out) {
    bucket.rate = bucket.attempts > 0 ? bucket.misses / bucket.attempts : null;
  }
  return out;
}

/**
 * Buckets that miss far more than the chart does overall.
 *
 * Relative to the chart, not to an absolute rate: an Expert chart at a 40%
 * global miss rate is hard, and flagging every bucket in it would say nothing.
 * A bucket missing three times the chart's own average is a *spike*, which is
 * what an unplayable bar looks like.
 *
 * `minAttempts` keeps a bucket that two people reached out of the result — a
 * 100% miss rate over two attempts is not evidence of anything.
 */
export function spikeBuckets(
  heatmap: readonly HeatmapBucket[],
  options: { minAttempts?: number; ratio?: number } = {},
): HeatmapBucket[] {
  const minAttempts = options.minAttempts ?? 20;
  const ratio = options.ratio ?? 3;

  let attempts = 0;
  let misses = 0;
  for (const bucket of heatmap) {
    attempts += bucket.attempts;
    misses += bucket.misses;
  }
  if (attempts === 0) return [];
  const baseline = misses / attempts;
  // Bounded at BOTH ends. The floor stops a chart nobody misses on flagging
  // every bucket with a single miss in it; the ceiling stops a genuinely hard
  // chart — a 40% baseline puts `baseline * 3` above 1.0 — from having a
  // threshold no bucket can reach, which would silently disable the detector on
  // exactly the charts most likely to have an unplayable bar in them.
  const threshold = Math.min(0.9, Math.max(baseline * ratio, 0.25));

  return heatmap.filter(
    (bucket) => bucket.attempts >= minAttempts && (bucket.rate ?? 0) >= threshold,
  );
}

/* ─── O2 — automatic bad-chart detection ─────────────────────────────────── */

export type BrokenReason = 'clear-rate' | 'bimodal' | 'miss-spike';

export interface BrokenVerdict {
  broken: boolean;
  reasons: BrokenReason[];
  /** Hartigan-style dip on the accuracy distribution, for the admin surface. */
  dip: number;
  clearRate: number;
  sampleSize: number;
}

/** Below this many scored runs, every signal here is noise. */
export const MIN_RUNS_FOR_VERDICT = 30;

/**
 * A chart nobody clears is either brutal on purpose or broken. 2% is low
 * enough that "brutal on purpose" is a stretch and high enough that a genuinely
 * hard chart with a handful of clears is not flagged.
 */
export const BROKEN_CLEAR_RATE = 0.02;

/**
 * How much bimodality counts as a mis-tracked tempo.
 *
 * Calibrated against the shape rather than a literature value: a unimodal
 * distribution of any width sits near zero on the statistic below, and two
 * separated humps sit well above 0.1. The number is deliberately conservative —
 * this flags a chart for review, and a false positive costs a human's time.
 */
export const DIP_THRESHOLD = 0.1;

/**
 * Bimodality is the tell for a mis-tracked tempo.
 *
 * Players who happen to lock onto the wrong grid score well and everyone else
 * scores terribly, so the accuracy distribution has two humps where a merely
 * hard chart has one long tail.
 *
 * The statistic: sort, then find the largest gap between consecutive values in
 * the middle 80% of the sample, normalised by the range. Real Hartigan's dip
 * needs a least-concave-majorant fit; this is the cheap cousin that answers the
 * same question well enough to queue a chart for a human, which is all it feeds.
 * The trimming is what makes it usable — untrimmed, one outlier at 5% accuracy
 * is a bigger gap than any true valley.
 */
export function dipStatistic(values: readonly number[]): number {
  if (values.length < 8) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const from = Math.floor(sorted.length * 0.1);
  const to = Math.ceil(sorted.length * 0.9);
  const middle = sorted.slice(from, to);
  if (middle.length < 4) return 0;

  const range = middle[middle.length - 1] - middle[0];
  if (range <= 0) return 0;

  let widest = 0;
  for (let i = 1; i < middle.length; i++) {
    const gap = middle[i] - middle[i - 1];
    if (gap > widest) widest = gap;
  }
  return widest / range;
}

export function looksBroken(input: {
  accuracies: readonly number[];
  clearRate: number;
  /** From {@link spikeBuckets}; optional, since `O1` may have no data yet. */
  spikes?: number;
}): BrokenVerdict {
  const dip = dipStatistic(input.accuracies);
  const verdict: BrokenVerdict = {
    broken: false,
    reasons: [],
    dip,
    clearRate: input.clearRate,
    sampleSize: input.accuracies.length,
  };
  if (input.accuracies.length < MIN_RUNS_FOR_VERDICT) return verdict;

  if (input.clearRate < BROKEN_CLEAR_RATE) verdict.reasons.push('clear-rate');
  if (dip > DIP_THRESHOLD) verdict.reasons.push('bimodal');
  // Two or more spiking buckets, not one: a single brutal bar is a chart with a
  // hard section, which is a chart. Several is a generation failure.
  if ((input.spikes ?? 0) >= 2) verdict.reasons.push('miss-spike');

  verdict.broken = verdict.reasons.length > 0;
  return verdict;
}
