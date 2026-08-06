/**
 * Tempo estimation and beat tracking.
 *
 * ## Tempo
 *
 * Autocorrelate the onset detection function: if the song has a pulse, the ODF
 * correlates with itself at the beat period and at its multiples. Two things
 * are layered on top of the raw autocorrelation, and both matter:
 *
 * - **A comb filter.** Scoring a candidate period by the correlation at that
 *   lag *alone* cannot tell 85 BPM from 170 BPM — a signal periodic at 0.7 s is
 *   also periodic at 1.4 s. Summing the correlation at 1×, 2×, 3× and 4× the
 *   candidate period rewards the period that explains the whole pattern, which
 *   is the actual beat rather than the bar or the half-beat.
 * - **A tempo prior.** Octave ambiguity is not fully resolvable from the signal
 *   — musicians disagree about it too — so we weight toward the range people
 *   actually count in, a log-normal centred at 125 BPM. This is what stops a
 *   drum-and-bass track being charted at 87 BPM with every note on an off-beat.
 *
 * ## Beats
 *
 * A single tempo plus a phase would be enough for a metronomic track and wrong
 * for everything else — live drumming drifts, and a chart that drifts away from
 * the song is unplayable by the end. So beats come from Ellis's dynamic
 * programming tracker (2007): choose the beat sequence maximising
 * `Σ odf(bᵢ) + α·Σ transition(bᵢ − bᵢ₋₁)`, where the transition cost is a
 * log-Gaussian penalty for deviating from the estimated period. It follows
 * gradual tempo change while refusing to follow a syncopation off a cliff.
 */

/** Search range, BPM. */
const MIN_BPM = 60;
const MAX_BPM = 210;
/** Where the prior peaks, and how wide it is in octaves. */
const PRIOR_CENTRE_BPM = 125;
const PRIOR_WIDTH = 0.9;
/** Comb harmonics and their weights — later multiples explain less. */
const COMB_HARMONICS: readonly number[] = [1, 2, 3, 4];
const COMB_WEIGHTS: readonly number[] = [1, 0.6, 0.4, 0.25];
/** Ellis's tightness. Higher = less willing to leave the estimated period. */
const TRANSITION_TIGHTNESS = 320;

export interface TempoEstimate {
  bpm: number;
  /** Beat period in ODF frames. */
  periodFrames: number;
  /** 0–1; how much better the winner scored than the field. */
  confidence: number;
}

/**
 * Autocorrelation of `signal` for every lag in `[minLag, maxLag]`.
 *
 * Normalised by the overlap length, so a long lag is not penalised simply for
 * having fewer terms to sum.
 */
function autocorrelate(signal: Float32Array, minLag: number, maxLag: number): Float64Array {
  const out = new Float64Array(maxLag + 1);
  const n = signal.length;

  let mean = 0;
  for (let i = 0; i < n; i++) mean += signal[i];
  mean /= Math.max(1, n);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = n - lag;
    if (limit <= 0) continue;
    for (let i = 0; i < limit; i++) {
      sum += (signal[i] - mean) * (signal[i + lag] - mean);
    }
    out[lag] = sum / limit;
  }
  return out;
}

/** Estimate the beat period from an onset detection function. */
export function estimateTempo(odf: Float32Array, frameDuration: number): TempoEstimate {
  const minLag = Math.max(2, Math.floor(60 / MAX_BPM / frameDuration));
  const maxLag = Math.max(minLag + 1, Math.ceil(60 / MIN_BPM / frameDuration));

  if (odf.length < maxLag * 2) {
    // Too short to have a tempo. 120 is the least-wrong default and the grid
    // still gives the charter something to quantise against.
    return { bpm: 120, periodFrames: 60 / 120 / frameDuration, confidence: 0 };
  }

  // The comb needs correlations out to 4× the longest candidate period.
  const acf = autocorrelate(odf, minLag, Math.min(odf.length - 1, maxLag * 4));

  let bestLag = minLag;
  let bestScore = -Infinity;
  let scoreSum = 0;
  let scoreCount = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let score = 0;
    for (let h = 0; h < COMB_HARMONICS.length; h++) {
      const harmonicLag = Math.round(lag * COMB_HARMONICS[h]);
      if (harmonicLag >= acf.length) break;
      // Take the best of the three lags around the harmonic: a real tempo is
      // rarely an exact integer number of frames, and rounding alone loses the
      // peak often enough to change the answer.
      let peak = acf[harmonicLag];
      if (harmonicLag > 0) peak = Math.max(peak, acf[harmonicLag - 1]);
      if (harmonicLag + 1 < acf.length) peak = Math.max(peak, acf[harmonicLag + 1]);
      score += COMB_WEIGHTS[h] * peak;
    }

    const bpm = 60 / (lag * frameDuration);
    const octavesFromCentre = Math.log2(bpm / PRIOR_CENTRE_BPM);
    const prior = Math.exp(-0.5 * (octavesFromCentre / PRIOR_WIDTH) ** 2);
    score *= prior;

    scoreSum += score;
    scoreCount++;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const meanScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  const confidence = bestScore > 0 && meanScore > 0 ? Math.min(1, 1 - meanScore / bestScore) : 0;

  return {
    bpm: 60 / (bestLag * frameDuration),
    periodFrames: bestLag,
    confidence,
  };
}

/**
 * Ellis's dynamic-programming beat tracker.
 *
 * Returns beat times in seconds. The returned sequence is globally optimal for
 * the objective, which is the property that makes it robust: a single missing
 * kick cannot knock the grid out of phase, because the path through that gap is
 * scored against everything that comes after it.
 */
export function trackBeats(
  odf: Float32Array,
  frameDuration: number,
  periodFrames: number,
): number[] {
  const n = odf.length;
  if (n === 0 || periodFrames < 2) return [];

  // Normalise so the tightness constant means the same thing on every song.
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, odf[i]);
  if (peak <= 0) return [];
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) local[i] = odf[i] / peak;

  const cumulative = new Float64Array(n);
  const backlink = new Int32Array(n).fill(-1);

  const searchStart = Math.round(-2 * periodFrames);
  const searchEnd = Math.round(-periodFrames / 2);
  const windowSize = searchEnd - searchStart + 1;

  // Transition cost is fixed per relative offset, so precompute it once rather
  // than calling Math.log in the inner loop of an O(n · period) scan.
  const transition = new Float64Array(Math.max(0, windowSize));
  for (let k = 0; k < windowSize; k++) {
    const offset = -(searchStart + k);
    transition[k] = -TRANSITION_TIGHTNESS * Math.log(offset / periodFrames) ** 2;
  }

  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    let bestIndex = -1;
    for (let k = 0; k < windowSize; k++) {
      const j = i + searchStart + k;
      if (j < 0) continue;
      if (j >= i) break;
      const score = cumulative[j] + transition[k];
      if (score > best) {
        best = score;
        bestIndex = j;
      }
    }
    if (bestIndex < 0) {
      cumulative[i] = local[i];
      backlink[i] = -1;
    } else {
      cumulative[i] = local[i] + best;
      backlink[i] = bestIndex;
    }
  }

  // Start the backtrace from the best score in the final stretch, not the very
  // last frame: the tail of a track is usually a fade, and ending on it drags
  // the whole path toward silence.
  let endIndex = n - 1;
  let endScore = -Infinity;
  const tailStart = Math.max(0, n - Math.round(periodFrames * 2));
  for (let i = tailStart; i < n; i++) {
    if (cumulative[i] > endScore) {
      endScore = cumulative[i];
      endIndex = i;
    }
  }

  const beats: number[] = [];
  let cursor = endIndex;
  const guard = n + 1;
  let steps = 0;
  while (cursor >= 0 && steps++ < guard) {
    beats.push(cursor * frameDuration);
    cursor = backlink[cursor];
  }
  beats.reverse();
  return beats;
}

/**
 * The BPM the beat sequence actually came out at.
 *
 * Reported instead of the estimator's own number because the DP tracker is
 * allowed to drift, and the value shown in the library should describe the
 * chart the player will get.
 */
export function bpmFromBeats(beats: number[], fallback: number): number {
  if (beats.length < 4) return fallback;
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) {
    const d = beats[i] - beats[i - 1];
    if (d > 0.2 && d < 2) intervals.push(d);
  }
  if (intervals.length === 0) return fallback;
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  const bpm = 60 / median;
  return Number.isFinite(bpm) && bpm > 0 ? bpm : fallback;
}

/**
 * A synthetic constant-tempo grid, for the degenerate cases: an ODF with no
 * usable pulse, or a clip too short for the tracker.
 */
export function syntheticBeats(durationSeconds: number, bpm: number, offset = 0): number[] {
  const interval = 60 / (bpm > 0 ? bpm : 120);
  const beats: number[] = [];
  for (let t = offset; t < durationSeconds; t += interval) beats.push(t);
  return beats;
}
