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

/**
 * A regular beat grid for a track whose tempo does not move.
 *
 * The DP tracker follows the audio, which is right for a live band and slightly
 * wrong for anything produced to a click: its beats sit on 11.6 ms frames, so the
 * period it reports is quantised (a 124 BPM track came out at 123.05) and each
 * beat wobbles a frame either way. A chart snapped to that grid inherits the
 * wobble, and the BPM shown in the library is off by a whole BPM.
 *
 * When the tracked beats lie on a straight line — the median error of a
 * robust (Theil–Sen) fit under {@link GRID_FIT_TOLERANCE_S} — the line IS the
 * tempo, and the grid is the line: exact period, no wobble, extended over the
 * whole track. Otherwise (a ritardando, a live recording) this returns `null` and
 * the tracked beats are used as they were.
 */
export const GRID_FIT_TOLERANCE_S = 0.012;
const MIN_BEATS_FOR_FIT = 16;

export interface GridFit {
  /** Beat times covering `[0, duration]`, seconds. */
  beats: number[];
  /** Seconds per beat. */
  period: number;
  bpm: number;
  /** Median |tracked − fitted|, seconds. */
  medianError: number;
}

export function fitConstantTempo(beats: readonly number[], duration: number): GridFit | null {
  if (beats.length < MIN_BEATS_FOR_FIT) return null;

  // Integer beat indices, tolerating a skipped beat in the tracker's output.
  const intervals: number[] = [];
  for (let i = 1; i < beats.length; i++) intervals.push(beats[i] - beats[i - 1]);
  const sortedIntervals = [...intervals].sort((a, b) => a - b);
  const rough = sortedIntervals[Math.floor(sortedIntervals.length / 2)];
  if (!(rough > 0.2 && rough < 2)) return null;
  const index: number[] = [0];
  for (let i = 1; i < beats.length; i++) {
    index.push(index[i - 1] + Math.max(1, Math.round((beats[i] - beats[i - 1]) / rough)));
  }

  // Theil–Sen: the median slope over pairs a fixed distance apart, which a few
  // mis-tracked beats cannot move.
  const slopes: number[] = [];
  const step = Math.max(4, Math.floor(beats.length / 8));
  for (let i = 0; i + step < beats.length; i++) {
    slopes.push((beats[i + step] - beats[i]) / (index[i + step] - index[i]));
  }
  slopes.sort((a, b) => a - b);
  const period = slopes[Math.floor(slopes.length / 2)];
  if (!(period > 0.2 && period < 2)) return null;
  const offsets = beats.map((t, i) => t - index[i] * period).sort((a, b) => a - b);
  const origin = offsets[Math.floor(offsets.length / 2)];

  const errors = beats
    .map((t, i) => Math.abs(t - (origin + index[i] * period)))
    .sort((a, b) => a - b);
  const medianError = errors[Math.floor(errors.length / 2)];
  if (medianError > GRID_FIT_TOLERANCE_S) return null;

  // Whole-track grid, from before the first beat to past the last.
  const grid: number[] = [];
  const first = Math.ceil(-origin / period);
  for (let k = first; origin + k * period <= duration + period; k++) grid.push(origin + k * period);
  if (grid.length < 4) return null;
  return { beats: grid, period, bpm: 60 / period, medianError };
}

/**
 * Shift a beat grid so it sits on the sounds that define the beat.
 *
 * The tracker finds the right tempo and the right beat, but its beat times are the
 * peaks of a flux function and that peaks before the sound is audible — by an
 * amount that depends on the song's attacks (about 18 ms on a drum loop). Every
 * note is snapped to this grid, so the lead becomes every note's error.
 *
 * Once the onsets have been refined against the waveform they are accurate, so
 * they can say where the grid should be: each onset within `maxOffset` of a beat
 * votes with how far it is from it, and the median vote moves the whole grid.
 * Onsets between beats (the subdivisions) are outside the window and do not vote.
 * Too few votes, or a shift beyond `maxShift`, and the grid is left alone.
 */
export function alignBeatsToOnsets(
  beats: readonly number[],
  onsetTimes: readonly number[],
  maxOffset = 0.06,
  maxShift = 0.05,
): number[] {
  if (beats.length < 2 || onsetTimes.length === 0) return beats.slice();
  const votes: number[] = [];
  for (const t of onsetTimes) {
    let lo = 0;
    let hi = beats.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (beats[mid] < t) lo = mid + 1;
      else hi = mid;
    }
    const nearest =
      lo > 0 && Math.abs(beats[lo - 1] - t) < Math.abs(beats[lo] - t) ? beats[lo - 1] : beats[lo];
    const offset = t - nearest;
    if (Math.abs(offset) <= maxOffset) votes.push(offset);
  }
  if (votes.length < 8) return beats.slice();
  votes.sort((a, b) => a - b);
  const shift = votes[votes.length >> 1];
  if (Math.abs(shift) > maxShift) return beats.slice();
  return beats.map((t) => t + shift);
}
