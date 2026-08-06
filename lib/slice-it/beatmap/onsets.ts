/**
 * Onset detection — SuperFlux plus adaptive peak picking.
 *
 * ## The detection function
 *
 * Spectral flux is the sum of the positive frame-to-frame change in each band:
 * energy appearing where there was less before, which is what a note attack
 * sounds like. Plain flux has one well-known failure: **vibrato and glissando**.
 * A held violin note wobbling ±50 cents moves energy from one band to the next
 * every few frames, and every one of those moves reads as a positive change in
 * the band it arrived in. The result is a detector that fires continuously
 * through sustained strings — a chart with a wall of notes where the song has
 * one long tone.
 *
 * SuperFlux (Böck & Widmer, DAFx-13) fixes it with two changes, both here:
 *
 * 1. **A maximum filter over frequency** on the reference frame, so energy that
 *    merely *moved* to an adjacent band is compared against the neighbourhood
 *    it came from and produces no flux.
 * 2. **A lag of more than one frame** (`μ`), so the comparison is against
 *    genuinely earlier audio rather than the tail of the same attack.
 *
 * ## Peak picking
 *
 * Dixon's rules, as refined by Böck: a frame is an onset if it is a local
 * maximum over a short window, exceeds a *moving average* over a longer window
 * by a margin, and is far enough from the previous onset. Moving-average
 * thresholding rather than a global one is the reason quiet verses get charted
 * at all — a fixed threshold tuned for a chorus finds nothing anywhere else.
 */

import { bandEnergyRatio, type Spectrogram } from './spectrum';

/** Kick/bass territory, and the hat/cymbal band the charter reads for lanes. */
const LOW_BAND_HZ = 250;
const HIGH_BAND_HZ = 2000;

export interface Onset {
  /** Seconds from the start of the track. */
  time: number;
  /** Detection-function value, normalised to roughly 0–1 across the song. */
  strength: number;
  /** Frame index in the spectrogram, for band lookups. */
  frame: number;
  /** Fraction of this frame's energy below 250 Hz. */
  lowRatio: number;
  /** Fraction above 2 kHz. */
  highRatio: number;
  /** Seconds the attack's energy stays elevated; 0 when it decays immediately. */
  sustain: number;
}

/** Lag in frames for the flux difference — ~35 ms at an 11.6 ms hop. */
const FLUX_LAG = 3;
/** Half-width of the frequency max-filter, in bands. */
const MAX_FILTER_RADIUS = 1;

/** Local-maximum window, seconds either side. */
const PRE_MAX_S = 0.03;
const POST_MAX_S = 0.03;
/** Moving-average window, seconds either side. */
const PRE_AVG_S = 0.15;
const POST_AVG_S = 0.1;
/** How far above the local mean a peak must sit, in units of the ODF's own std. */
const DELTA_SIGMA = 0.55;
/** Two onsets closer than this are one onset. */
const MIN_ONSET_GAP_S = 0.03;

/**
 * The SuperFlux onset detection function, one value per spectrogram frame.
 *
 * Exported separately from {@link detectOnsets} because the tempo estimator
 * consumes it directly: tempo is a property of the *continuous* detection
 * function, and running it on discrete picked onsets throws away exactly the
 * weak-but-regular pulse that makes a tempo obvious.
 */
export function onsetStrengthSignal(spec: Spectrogram): Float32Array {
  const { data, frames, bands } = spec;
  const odf = new Float32Array(frames);
  if (frames === 0 || bands === 0) return odf;

  const filtered = new Float32Array(bands);

  for (let f = FLUX_LAG; f < frames; f++) {
    const refRow = (f - FLUX_LAG) * bands;
    const row = f * bands;

    // Max-filter the reference frame across frequency.
    for (let b = 0; b < bands; b++) {
      let peak = data[refRow + b];
      for (let d = 1; d <= MAX_FILTER_RADIUS; d++) {
        if (b - d >= 0) peak = Math.max(peak, data[refRow + b - d]);
        if (b + d < bands) peak = Math.max(peak, data[refRow + b + d]);
      }
      filtered[b] = peak;
    }

    let flux = 0;
    for (let b = 0; b < bands; b++) {
      const diff = data[row + b] - filtered[b];
      if (diff > 0) flux += diff;
    }
    odf[f] = flux;
  }

  return odf;
}

/** Mean and standard deviation of the non-zero part of a signal. */
function stats(signal: Float32Array): { mean: number; std: number } {
  if (signal.length === 0) return { mean: 0, std: 0 };
  let sum = 0;
  for (let i = 0; i < signal.length; i++) sum += signal[i];
  const mean = sum / signal.length;
  let varianceSum = 0;
  for (let i = 0; i < signal.length; i++) {
    const d = signal[i] - mean;
    varianceSum += d * d;
  }
  return { mean, std: Math.sqrt(varianceSum / signal.length) };
}

/**
 * How long the energy that arrived at `frame` stays up.
 *
 * A LONG (hold) note is exactly this question: did the attack decay, or is it a
 * pad/vocal/guitar note the player should hold through? Measured against the
 * frame's own peak so a quiet sustained note counts the same as a loud one.
 */
function measureSustain(spec: Spectrogram, frame: number, maxFrames: number): number {
  const { data, frames, bands, frameDuration } = spec;
  if (frame >= frames) return 0;

  const rowEnergy = (f: number) => {
    const row = f * bands;
    let sum = 0;
    for (let b = 0; b < bands; b++) sum += data[row + b];
    return sum;
  };

  const peak = rowEnergy(frame);
  if (peak <= 0) return 0;
  const floor = peak * 0.6;

  let held = 0;
  for (let f = frame + 1; f < frames && held < maxFrames; f++) {
    if (rowEnergy(f) < floor) break;
    held++;
  }
  return held * frameDuration;
}

export interface DetectOnsetsOptions {
  /** Longest hold the charter will consider, seconds. Bounds the sustain scan. */
  maxSustainSeconds?: number;
}

/** Run the full detector and return picked onsets in time order. */
export function detectOnsets(
  spec: Spectrogram,
  odf: Float32Array,
  options: DetectOnsetsOptions = {},
): Onset[] {
  const { frames, frameDuration } = spec;
  if (frames === 0) return [];

  const { mean, std } = stats(odf);
  const delta = std * DELTA_SIGMA;
  const maxSustainFrames = Math.ceil((options.maxSustainSeconds ?? 2) / frameDuration);

  const framesFor = (seconds: number) => Math.max(1, Math.round(seconds / frameDuration));
  const preMax = framesFor(PRE_MAX_S);
  const postMax = framesFor(POST_MAX_S);
  const preAvg = framesFor(PRE_AVG_S);
  const postAvg = framesFor(POST_AVG_S);
  const minGapFrames = framesFor(MIN_ONSET_GAP_S);

  // Normalising by the 99th percentile rather than the maximum keeps a single
  // clipped transient — a rimshot, a vinyl pop — from squashing the entire
  // song's strengths into the bottom of the range, which would then fail the
  // charter's percentile-based difficulty selection.
  const sorted = Float32Array.from(odf).sort();
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 1;
  const scale = p99 > 0 ? p99 : 1;

  const onsets: Onset[] = [];
  let lastOnsetFrame = -Infinity;

  for (let f = 1; f < frames; f++) {
    const value = odf[f];
    if (value <= mean) continue;

    let isLocalMax = true;
    for (let j = Math.max(0, f - preMax); j <= Math.min(frames - 1, f + postMax); j++) {
      if (odf[j] > value) {
        isLocalMax = false;
        break;
      }
    }
    if (!isLocalMax) continue;

    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, f - preAvg); j <= Math.min(frames - 1, f + postAvg); j++) {
      sum += odf[j];
      count++;
    }
    const localMean = count > 0 ? sum / count : 0;
    if (value < localMean + delta) continue;

    if (f - lastOnsetFrame < minGapFrames) {
      // Same attack seen twice — keep whichever peak is higher.
      const previous = onsets[onsets.length - 1];
      if (previous && value > previous.strength * scale) {
        onsets.pop();
      } else {
        continue;
      }
    }

    lastOnsetFrame = f;
    onsets.push({
      time: spec.frameTime(f),
      strength: Math.min(1, value / scale),
      frame: f,
      lowRatio: bandEnergyRatio(spec, f, 0, LOW_BAND_HZ),
      highRatio: bandEnergyRatio(spec, f, HIGH_BAND_HZ, Infinity),
      sustain: measureSustain(spec, f, maxSustainFrames),
    });
  }

  return onsets;
}
