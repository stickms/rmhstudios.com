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

import { FFT, hannWindow } from './fft';

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
): { edges: Int32Array; freqs: Float64Array; count: number } {
  const nyquist = sampleRate / 2;
  const top = Math.min(MAX_FREQ, nyquist * 0.98);
  const bandCount = Math.max(1, Math.floor(Math.log2(top / MIN_FREQ) * BANDS_PER_OCTAVE));

  const centres: number[] = [];
  for (let i = 0; i <= bandCount; i++) {
    centres.push(MIN_FREQ * Math.pow(2, i / BANDS_PER_OCTAVE));
  }

  const binOf = (hz: number) => Math.round((hz * fftSize) / sampleRate);
  const edges: number[] = [];
  const freqs: number[] = [];

  for (let i = 1; i < centres.length - 1; i++) {
    const lo = binOf(centres[i - 1]);
    const mid = binOf(centres[i]);
    const hi = binOf(centres[i + 1]);
    if (mid <= lo || hi <= mid) continue;
    if (hi >= fftSize / 2) break;
    edges.push(lo, mid, hi);
    freqs.push(centres[i]);
  }

  return {
    edges: Int32Array.from(edges),
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
export function computeSpectrogram(
  samples: Float32Array,
  sampleRate: number,
  options: { frameSize?: number; hopSize?: number } = {},
): Spectrogram {
  const frameSize = options.frameSize ?? FRAME_SIZE;
  const hopSize = options.hopSize ?? HOP_SIZE;

  const fft = new FFT(frameSize);
  const window = hannWindow(frameSize);
  const { edges, freqs, count: bands } = buildFilterbank(frameSize, sampleRate);

  const frames = Math.max(0, Math.floor((samples.length - frameSize) / hopSize) + 1);
  const data = new Float32Array(Math.max(0, frames * bands));

  const re = new Float64Array(frameSize);
  const im = new Float64Array(frameSize);
  const magnitude = new Float64Array(frameSize / 2);
  const lambda = 20;

  for (let f = 0; f < frames; f++) {
    const offset = f * hopSize;
    for (let i = 0; i < frameSize; i++) {
      re[i] = samples[offset + i] * window[i];
      im[i] = 0;
    }
    fft.transform(re, im);

    for (let k = 0; k < magnitude.length; k++) {
      magnitude[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    }

    const rowStart = f * bands;
    for (let b = 0; b < bands; b++) {
      const lo = edges[b * 3];
      const mid = edges[b * 3 + 1];
      const hi = edges[b * 3 + 2];
      let sum = 0;
      // Rising then falling triangle — the standard weighting, so a partial
      // sitting between two band centres contributes to both rather than
      // jumping discontinuously from one to the other.
      for (let k = lo; k < mid; k++) {
        sum += magnitude[k] * ((k - lo) / (mid - lo));
      }
      for (let k = mid; k <= hi; k++) {
        sum += magnitude[k] * (1 - (k - mid) / (hi - mid + 1));
      }
      data[rowStart + b] = Math.log1p(lambda * sum);
    }
  }

  const frameDuration = hopSize / sampleRate;
  const centreOffset = frameSize / 2 / sampleRate;

  return {
    data,
    frames,
    bands,
    frameDuration,
    bandFreqs: freqs,
    frameTime: (i: number) => i * frameDuration + centreOffset,
  };
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
