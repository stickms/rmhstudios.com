/**
 * Short-time Fourier transform and the log-frequency filterbank the onset
 * detector runs on.
 *
 * ## Why a filterbank at all
 *
 * Raw linear FFT bins are the wrong axis for onset detection. A kick and a
 * hi-hat both produce a broadband step, but the kick's energy sits in three
 * bins near 60 Hz and the hi-hat's is spread over hundreds above 6 kHz — sum
 * the raw bins and the hi-hat dominates every flux value in the song. Folding
 * into bands that are logarithmic in frequency (the axis music is actually
 * written on) gives each octave comparable weight, which is why every published
 * onset detector since ~2005 does it.
 */

import { RealFFT, hannWindow } from './fft';

/** STFT frame length in samples at the analysis rate — ~46 ms at 22.05 kHz. */
export const FRAME_SIZE = 1024;
/** Hop in samples — ~11.6 ms at 22.05 kHz, the resolution of the whole chart. */
export const HOP_SIZE = 256;
/** Bands per octave in the filterbank. */
const BANDS_PER_OCTAVE = 12;
const MIN_FREQ = 30;
const MAX_FREQ = 11000;

export interface Spectrogram {
  /** `frames × bands` log-magnitudes, row-major. */
  data: Float32Array;
  frames: number;
  bands: number;
  /** Seconds per frame. */
  frameDuration: number;
  /** Centre frequency of each band, Hz. */
  bandFreqs: Float64Array;
  /** Time in seconds of frame `i`, at the centre of its window. */
  frameTime: (i: number) => number;
}

/**
 * Triangular filters spaced logarithmically, as `[startBin, peakBin, endBin]`
 * triples. Bands narrower than one FFT bin are dropped rather than allowed to
 * alias onto their neighbour.
 */
function buildFilterbank(
  fftSize: number,
  sampleRate: number,
): { spans: Int32Array; weights: Float64Array; freqs: Float64Array; count: number } {
  const nyquist = sampleRate / 2;
  const top = Math.min(MAX_FREQ, nyquist * 0.98);
  const bandCount = Math.max(1, Math.floor(Math.log2(top / MIN_FREQ) * BANDS_PER_OCTAVE));

  const centres: number[] = [];
  for (let i = 0; i <= bandCount; i++) {
    centres.push(MIN_FREQ * Math.pow(2, i / BANDS_PER_OCTAVE));
  }

  const binOf = (hz: number) => Math.round((hz * fftSize) / sampleRate);
  const freqs: number[] = [];
  // Flattened `[startBin, weightOffset, binCount]` per band, with every
  // triangle weight precomputed once. They are the same for every frame, and
  // recomputing them inside the frame loop was two divides per bin per band per
  // frame — about 40 million of them over a 15-minute track.
  const spans: number[] = [];
  const weights: number[] = [];

  for (let i = 1; i < centres.length - 1; i++) {
    const lo = binOf(centres[i - 1]);
    const mid = binOf(centres[i]);
    const hi = binOf(centres[i + 1]);
    if (mid <= lo || hi <= mid) continue;
    if (hi >= fftSize / 2) break;

    spans.push(lo, weights.length, hi - lo + 1);
    // Rising then falling triangle — the standard weighting, so a partial
    // sitting between two band centres contributes to both rather than jumping
    // discontinuously from one to the other.
    for (let k = lo; k < mid; k++) weights.push((k - lo) / (mid - lo));
    for (let k = mid; k <= hi; k++) weights.push(1 - (k - mid) / (hi - mid + 1));
    freqs.push(centres[i]);
  }

  return {
    spans: Int32Array.from(spans),
    weights: Float64Array.from(weights),
    freqs: Float64Array.from(freqs),
    count: freqs.length,
  };
}

/**
 * Compute the log-magnitude band spectrogram.
 *
 * `log(1 + λ·m)` rather than plain magnitude, with λ chosen so quiet passages
 * still produce usable flux: a linear magnitude detector finds every onset in
 * the loud chorus and none in the intro, and the resulting chart has a
 * two-minute hole in it.
 */
/** Geometry of a spectrogram, derivable without doing any of the work. */
export function spectrogramShape(
  sampleCount: number,
  sampleRate: number,
  options: { frameSize?: number; hopSize?: number } = {},
) {
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;
  const { freqs, count: bands } = buildFilterbank(frameSize, sampleRate);
  const frames = Math.max(0, Math.floor((sampleCount - frameSize) / hopSize) + 1);
  return { frameSize, hopSize, bands, frames, freqs };
}

/**
 * Fill rows `[from, to)` of a `frames × bands` matrix.
 *
 * Split out of {@link computeSpectrogram} so the parallel path
 * (`spectrum.parallel.server.ts`) runs **this exact code** in each worker
 * instead of a transcription of it. A numeric kernel copied into a worker is a
 * kernel that drifts from its reference, and the symptom would be charts that
 * differ depending on how many cores the box had — which is not a bug anyone
 * would find by reading either copy.
 *
 * Rows are disjoint by construction, so N workers writing N ranges of one
 * `SharedArrayBuffer` never overlap and need no locking.
 */
export function computeSpectrogramRange(
  samples: Float32Array,
  sampleRate: number,
  out: Float32Array,
  from: number,
  to: number,
  options: { frameSize?: number; hopSize?: number } = {},
): void {
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;

  // A real-input FFT: `im[]` was all zeros on every one of these transforms —
  // ~78 000 of them for a 15-minute track — and a complex FFT spends half its
  // work carrying those zeros. `RealFFT` also applies the window and reads
  // straight from `samples` at an offset, so the per-frame copy is gone too.
  //
  // Measured 2026-08-12: this transform is **95%** of the whole STFT; the
  // filterbank + log1p below is the other 5%. That is why the parallel path
  // exists and why nothing here is micro-tuned.
  const fft = new RealFFT(frameSize);
  const window = hannWindow(frameSize);
  const { spans, weights, count: bands } = buildFilterbank(frameSize, sampleRate);

  const magnitude = new Float64Array(frameSize / 2);
  const lambda = 20;

  for (let f = from; f < to; f++) {
    fft.magnitudes(samples, magnitude, f * hopSize, window);

    const rowStart = f * bands;
    for (let b = 0; b < bands; b++) {
      const start = spans[b * 3];
      const w = spans[b * 3 + 1];
      const span = spans[b * 3 + 2];
      let sum = 0;
      for (let i = 0; i < span; i++) {
        sum += magnitude[start + i] * weights[w + i];
      }
      out[rowStart + b] = Math.log1p(lambda * sum);
    }
  }
}

/** Assemble a {@link Spectrogram} around an already-filled data matrix. */
export function spectrogramFromData(
  data: Float32Array,
  shape: ReturnType<typeof spectrogramShape>,
  sampleRate: number,
): Spectrogram {
  const frameDuration = shape.hopSize / sampleRate;
  const centreOffset = shape.frameSize / 2 / sampleRate;
  return {
    data,
    frames: shape.frames,
    bands: shape.bands,
    frameDuration,
    bandFreqs: shape.freqs,
    frameTime: (i: number) => i * frameDuration + centreOffset,
  };
}

export function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  options: { frameSize?: number; hopSize?: number } = {},
): Spectrogram {
  const shape = spectrogramShape(samples.length, sampleRate, options);
  const data = new Float32Array(Math.max(0, shape.frames * shape.bands));
  computeSpectrogramRange(samples, sampleRate, data, 0, shape.frames, options);
  return spectrogramFromData(data, shape, sampleRate);
}

/**
 * Energy in a frequency range for one frame, as a fraction of that frame's
 * total. Used by the charter to decide which lane a note belongs on: a hit
 * whose energy is mostly under 250 Hz is a kick, mostly above 2 kHz is a hat.
 *
 * Undoes the `log1p` first. Summing the stored log-magnitudes and calling the
 * result an energy ratio is the kind of mistake that still *looks* plausible —
 * every value is in range and the ratio sums to 1 — while being wrong in a
 * specific direction: the log floors quiet bands at a small positive number, so
 * the sixty near-silent high bands out-vote the three loud low ones and every
 * kick reads as a hi-hat. `expm1` recovers the linear magnitude; λ is a common
 * factor and cancels in the ratio.
 */
export function bandEnergyRatio(
  spec: Spectrogram,
  frame: number,
  fromHz: number,
  toHz: number,
): number {
  if (frame < 0 || frame >= spec.frames) return 0;
  const row = frame * spec.bands;
  let inRange = 0;
  let total = 0;
  for (let b = 0; b < spec.bands; b++) {
    const value = Math.expm1(spec.data[row + b]);
    total += value;
    const hz = spec.bandFreqs[b];
    if (hz >= fromHz && hz < toHz) inRange += value;
  }
  return total > 0 ? inRange / total : 0;
}
