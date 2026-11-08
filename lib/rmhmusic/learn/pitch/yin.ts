/**
 * Monophonic pitch detection for the RMH Music learning programme, using the YIN
 * algorithm (de Cheveigné & Kawahara, 2002). The tuner and "play this note"
 * lesson checks feed it ~2048-sample microphone frames every ~25 ms and get back
 * a fundamental frequency, or `null` when there is nothing trustworthy to report.
 *
 * Plain autocorrelation latches onto strong harmonics and reports an octave (or a
 * twelfth) too high on guitar and piano tones. YIN instead takes the *first* lag
 * whose normalised difference dips below a threshold, which is the fundamental
 * period. Returning `null` for silence and noise matters just as much as
 * accuracy: a phantom note would mark a learner right or wrong for no reason.
 *
 * Pure and client-safe. Allocates one Float32Array per call (the difference
 * function) and nothing in the inner loops.
 */

export interface PitchResult {
  /** Fundamental frequency in Hz; always finite and > 0. */
  freq: number;
  /** Confidence 0..1 (1 − the normalised difference at the chosen lag). */
  clarity: number;
}

export interface DetectPitchOptions {
  /** Lowest frequency to consider, in Hz (default 60, below guitar low E). */
  minFreq?: number;
  /** Highest frequency to consider, in Hz (default 1400). */
  maxFreq?: number;
  /** YIN absolute threshold on the normalised difference (default 0.15). */
  threshold?: number;
  /** Frames quieter than this RMS are treated as silence (default 0.01). */
  minRms?: number;
}

export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  opts: DetectPitchOptions = {},
): PitchResult | null {
  const { minFreq = 60, maxFreq = 1400, threshold = 0.15, minRms = 0.01 } = opts;

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  if (!(minFreq > 0) || !(maxFreq > minFreq)) return null;

  const tauMin = Math.max(2, Math.floor(sampleRate / maxFreq));
  const tauMax = Math.ceil(sampleRate / minFreq);
  // Need a full period at the lowest frequency to compare against another.
  if (buf.length < 2 * tauMax || tauMin >= tauMax) return null;

  // Silence gate. `!(rms >= minRms)` also rejects NaN input.
  let sumSq = 0;
  for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / buf.length);
  if (!(rms >= minRms)) return null;

  // Step 1: difference function d(tau) over a fixed window, so every lag
  // compares the same number of samples.
  const window = buf.length - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }

  // Step 2: cumulative mean normalised difference d'(tau), in place.
  // d'(0) = 1 by definition; it removes the bias towards small lags.
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }

  // Step 3: first lag below the threshold, then walk down to the local minimum.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Step 4: parabolic interpolation around the minimum for sub-sample accuracy.
  let betterTau = tau;
  if (tau > 1 && tau < tauMax) {
    const s0 = d[tau - 1];
    const s1 = d[tau];
    const s2 = d[tau + 1];
    const denom = 2 * (2 * s1 - s2 - s0);
    if (denom !== 0) {
      const shift = (s2 - s0) / denom;
      if (Number.isFinite(shift) && Math.abs(shift) <= 1) betterTau = tau + shift;
    }
  }

  const freq = sampleRate / betterTau;
  if (!Number.isFinite(freq) || freq <= 0) return null;

  const clarity = Math.min(1, Math.max(0, 1 - d[tau]));
  return { freq, clarity };
}
