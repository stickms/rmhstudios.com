/**
 * Slice It — song structure: verse / chorus / drop boundaries (idea `C5`).
 *
 * Design doc: `docs/slice-it-chart-editor.md` §6.
 *
 * ## The one decision that makes this tractable
 *
 * Structure analysis is a self-similarity matrix over the song's own frames,
 * and the size of that matrix is the whole problem. A 4-minute track at the
 * analyser's 11.6 ms hop is **~20 700 STFT frames**, so the matrix is 4.3 × 10⁸
 * cells — gigabytes, minutes of work, and impossible in a browser tab. The same
 * track is **~500 beats**, so a BEAT-SYNCHRONOUS matrix is 250 000 cells: a few
 * milliseconds and 1 MB of scratch.
 *
 * Beat-synchronous is not merely the cheap approximation — it is the better
 * feature. Averaging each beat's frames removes the phase of the drum pattern,
 * so two repetitions of a chorus that start a few milliseconds apart compare as
 * identical instead of as smeared copies of each other. The beat grid is
 * already tracked by the time this runs, so it costs nothing to use.
 *
 * ## The method
 *
 * Foote's novelty (2000), unchanged in its essentials since: build the
 * beat-synchronous similarity matrix, slide a Gaussian-tapered checkerboard
 * kernel down its diagonal, and read the peaks. A boundary is a moment where
 * everything before it is like itself, everything after it is like itself, and
 * the two are not like each other — which is exactly what a checkerboard
 * correlates with. Labels then come from comparing the segments to each other,
 * so a returning chorus gets the letter it had the first time.
 */

import type { Spectrogram } from './spectrum';

export interface Section {
  /** Seconds. */
  start: number;
  end: number;
  /** `A`, `B`, `C`… — repeats of the same material share a letter. */
  label: string;
  /** Mean loudness relative to the loudest section, 0–1. */
  energy: number;
}

/** Half-width of the checkerboard kernel, in beats. 8 beats ≈ two bars either side. */
const KERNEL_BEATS = 8;
/** A section shorter than this is folded into its neighbour. */
const MIN_SECTION_SECONDS = 6;
/** Novelty peaks must be this many beats apart. */
const MIN_PEAK_BEATS = 8;
/** How far above the local mean, in standard deviations, a peak must sit. */
const PEAK_SIGMA = 0.9;
/** Cosine similarity above which two sections are "the same material". */
const LABEL_SIMILARITY = 0.86;
/** More letters than this and the labelling has stopped meaning anything. */
const MAX_LABELS = 8;

/**
 * Beat-synchronous feature vectors: one L2-normalised band spectrum per beat.
 *
 * Normalised because similarity here should be about the SHAPE of the spectrum
 * (which instruments are playing) and not its loudness. Without it a quiet verse
 * and a loud verse of the same material score as different sections, which is
 * precisely the wrong answer — that is a dynamic, not a structure.
 */
export function beatFeatures(spec: Spectrogram, beats: readonly number[]): Float32Array[] {
  const out: Float32Array[] = [];
  if (spec.frames === 0 || beats.length < 2) return out;

  for (let b = 0; b < beats.length - 1; b++) {
    const from = Math.max(0, Math.floor((beats[b] - spec.frameTime(0)) / spec.frameDuration));
    const to = Math.min(
      spec.frames - 1,
      Math.floor((beats[b + 1] - spec.frameTime(0)) / spec.frameDuration),
    );
    const vector = new Float32Array(spec.bands);
    let count = 0;
    for (let f = from; f <= to; f++) {
      const row = f * spec.bands;
      for (let band = 0; band < spec.bands; band++) vector[band] += spec.data[row + band];
      count++;
    }
    if (count > 0) for (let band = 0; band < spec.bands; band++) vector[band] /= count;

    let norm = 0;
    for (let band = 0; band < spec.bands; band++) norm += vector[band] * vector[band];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let band = 0; band < spec.bands; band++) vector[band] /= norm;
    out.push(vector);
  }
  return out;
}

function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Foote novelty along the diagonal of the (implicit) similarity matrix.
 *
 * The matrix is never materialised: the kernel only ever reads a
 * `2L × 2L` neighbourhood of the diagonal, so the similarities are computed on
 * demand. That turns the 250 000-cell matrix into ~500 × 256 comparisons and
 * removes the only allocation that would have scaled with the square of the
 * track length.
 */
export function noveltyCurve(features: readonly Float32Array[], half = KERNEL_BEATS): Float32Array {
  const n = features.length;
  const novelty = new Float32Array(n);
  if (n < half * 2) return novelty;

  // Gaussian taper, so beats at the edge of the window matter less than the ones
  // next to the boundary. An untapered checkerboard rings: it reports a second,
  // phantom peak `half` beats away from every real boundary.
  const taper = new Float32Array(half);
  for (let i = 0; i < half; i++) {
    const x = (i + 0.5) / half;
    taper[i] = Math.exp(-4 * x * x);
  }

  for (let centre = half; centre < n - half; centre++) {
    let same = 0;
    let cross = 0;
    let weight = 0;
    for (let i = 0; i < half; i++) {
      for (let j = 0; j < half; j++) {
        const w = taper[i] * taper[j];
        // Top-left and bottom-right quadrants: within a section.
        same += w * cosine(features[centre - 1 - i], features[centre - 1 - j]);
        same += w * cosine(features[centre + i], features[centre + j]);
        // Off-diagonal quadrant: across the candidate boundary.
        cross += 2 * w * cosine(features[centre - 1 - i], features[centre + j]);
        weight += 2 * w;
      }
    }
    novelty[centre] = weight > 0 ? (same - cross) / (2 * weight) : 0;
  }
  return novelty;
}

/** Peaks of the novelty curve, as beat indices. */
function pickBoundaries(novelty: Float32Array, minGap: number): number[] {
  const n = novelty.length;
  if (n === 0) return [];

  let mean = 0;
  for (let i = 0; i < n; i++) mean += novelty[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) variance += (novelty[i] - mean) ** 2;
  const deviation = Math.sqrt(variance / Math.max(1, n));
  // A flat novelty curve is audio with no structure to find — a drone, a
  // spoken-word track, a test tone. Everything on a flat curve is a local
  // maximum and everything ties the threshold, so without this the song comes
  // back chopped into sections at arbitrary beats, which is worse than the
  // honest answer of "one section".
  if (deviation < 1e-6) return [];
  const threshold = mean + PEAK_SIGMA * deviation;

  const peaks: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (novelty[i] <= threshold) continue;
    // Strictly higher than what precedes it: a plateau is not a boundary, and
    // treating each of its points as one produces a burst of adjacent peaks.
    if (novelty[i] <= novelty[i - 1] || novelty[i] < novelty[i + 1]) continue;
    const previous = peaks[peaks.length - 1];
    if (previous != null && i - previous < minGap) {
      // Two peaks inside the minimum gap are one boundary detected twice; keep
      // the stronger, because the weaker is the shoulder of the same event.
      if (novelty[i] > novelty[previous]) peaks[peaks.length - 1] = i;
      continue;
    }
    peaks.push(i);
  }
  return peaks;
}

/**
 * Detect sections.
 *
 * Never throws and never returns nothing useful: a track with no discernible
 * structure comes back as one section covering the whole song, which is an
 * honest answer and one the editor can draw.
 */
export function detectSections(
  spec: Spectrogram,
  beats: readonly number[],
  duration: number,
): Section[] {
  const whole: Section[] = [{ start: 0, end: duration, label: 'A', energy: 1 }];
  if (beats.length < KERNEL_BEATS * 2 + 2 || !(duration > 0)) return whole;

  const features = beatFeatures(spec, beats);
  if (features.length < KERNEL_BEATS * 2) return whole;

  const novelty = noveltyCurve(features);
  const boundaries = pickBoundaries(novelty, MIN_PEAK_BEATS);
  if (boundaries.length === 0) return whole;

  // Beat indices → times, with the head and tail of the track closing the ends.
  // A boundary inside the first few seconds is dropped rather than kept: it
  // would open the song with a section too short to be one, and unlike every
  // other short span there is no earlier section to fold it into.
  const edges = [
    0,
    ...boundaries.map((index) => beats[index]).filter((t) => t > MIN_SECTION_SECONDS),
    duration,
  ];
  edges[edges.length - 1] = duration;

  const spans: { start: number; end: number; from: number; to: number }[] = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const start = edges[i];
    const end = edges[i + 1];
    if (end - start < MIN_SECTION_SECONDS && spans.length > 0) {
      // Too short to be a section of its own: extend the previous one. A
      // four-second "section" is a fill, and an editor strip full of them is
      // less readable than no strip at all.
      spans[spans.length - 1].end = end;
      spans[spans.length - 1].to = boundaryBeat(beats, end);
      continue;
    }
    spans.push({ start, end, from: boundaryBeat(beats, start), to: boundaryBeat(beats, end) });
  }
  if (spans.length === 0) return whole;

  // One mean feature vector per span, for labelling, plus its loudness.
  const means = spans.map((span) => meanFeature(features, span.from, span.to));
  const energies = spans.map((span) => meanEnergy(spec, span.start, span.end));
  const loudest = Math.max(...energies, 1e-9);

  const labels: string[] = [];
  const prototypes: Float32Array[] = [];
  for (let i = 0; i < spans.length; i++) {
    let matched = -1;
    let best = LABEL_SIMILARITY;
    for (let p = 0; p < prototypes.length; p++) {
      const score = cosine(means[i], prototypes[p]);
      if (score > best) {
        best = score;
        matched = p;
      }
    }
    if (matched >= 0) {
      labels.push(String.fromCharCode(65 + matched));
    } else if (prototypes.length < MAX_LABELS) {
      prototypes.push(means[i]);
      labels.push(String.fromCharCode(65 + prototypes.length - 1));
    } else {
      labels.push(String.fromCharCode(65 + MAX_LABELS - 1));
    }
  }

  return spans.map((span, i) => ({
    start: Number(span.start.toFixed(3)),
    end: Number(span.end.toFixed(3)),
    label: labels[i],
    energy: Number(Math.min(1, energies[i] / loudest).toFixed(3)),
  }));
}

/** Nearest beat index at or before `time`. */
function boundaryBeat(beats: readonly number[], time: number): number {
  let lo = 0;
  let hi = beats.length - 1;
  if (time <= beats[0]) return 0;
  if (time >= beats[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= time) lo = mid;
    else hi = mid;
  }
  return lo;
}

function meanFeature(features: readonly Float32Array[], from: number, to: number): Float32Array {
  const bands = features[0]?.length ?? 0;
  const out = new Float32Array(bands);
  const start = Math.max(0, Math.min(from, features.length - 1));
  const end = Math.max(start, Math.min(to, features.length - 1));
  for (let i = start; i <= end; i++) {
    for (let b = 0; b < bands; b++) out[b] += features[i][b];
  }
  let norm = 0;
  for (let b = 0; b < bands; b++) norm += out[b] * out[b];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let b = 0; b < bands; b++) out[b] /= norm;
  return out;
}

/**
 * Mean linear magnitude over a time span.
 *
 * `expm1` first, for the reason `bandEnergyRatio` documents at length: the
 * stored values are `log1p(λ·m)`, and averaging logs weights the sixty
 * near-silent high bands as heavily as the three loud low ones, so a bass drop
 * reads as quieter than the ambient intro it follows.
 */
function meanEnergy(spec: Spectrogram, from: number, to: number): number {
  const first = Math.max(0, Math.floor(from / spec.frameDuration));
  const last = Math.min(spec.frames - 1, Math.floor(to / spec.frameDuration));
  if (last < first) return 0;
  let sum = 0;
  let count = 0;
  for (let f = first; f <= last; f++) {
    const row = f * spec.bands;
    let frame = 0;
    for (let b = 0; b < spec.bands; b++) frame += Math.expm1(spec.data[row + b]);
    sum += frame;
    count++;
  }
  return count > 0 ? sum / count : 0;
}
