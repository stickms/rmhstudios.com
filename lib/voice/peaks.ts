/**
 * The waveform a voice bubble draws.
 *
 * ## Why the peaks are computed at record time and stored on the row
 *
 * The obvious implementation — fetch the audio, decode it, draw it — costs the
 * recipient a full download of every voice note in the thread *before* they have
 * decided to play any of them. On a 50-message scroll-back that is megabytes of
 * audio fetched to draw a few hundred pixels of bars.
 *
 * So the sender's `AnalyserNode` already has the amplitude envelope while
 * recording; we downsample it to a fixed number of buckets and store that
 * alongside the message (`DirectMessage.audioPeaks Float[]`). The bubble renders
 * from ~48 floats and touches the network only when the recipient presses play.
 *
 * Everything here is pure and client-safe: the recorder produces peaks with
 * {@link downsamplePeaks}, and the API route sanitises whatever a client claims
 * with {@link normalizePeaks} before it reaches the database.
 */

/**
 * Bars in a stored waveform.
 *
 * Fixed rather than proportional to duration on purpose: a bubble is a fixed
 * width, so a 10-minute note and a 3-second note both get the same number of
 * bars and the row size is bounded no matter how long the clip. 48 is what fits
 * legibly at ~2px per bar in the narrowest bubble (360px viewport) without the
 * bars becoming sub-pixel.
 */
export const VOICE_PEAK_BUCKETS = 48;

/** Stored peaks are rounded to this many decimals — 8 bits of visual range. */
const PEAK_PRECISION = 2;

/**
 * `NaN` is the only value treated as silence: it means "no measurement". An
 * infinity is a measurement that overflowed, which is as loud as a bar gets, so
 * it clamps to 1 like any other out-of-range value — mapping it to 0 would let
 * one garbage sample blank a bucket that also contains real speech.
 */
function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function round(value: number): number {
  const factor = 10 ** PEAK_PRECISION;
  return Math.round(value * factor) / factor;
}

/**
 * Downsample an amplitude envelope to {@link VOICE_PEAK_BUCKETS} bars.
 *
 * Each output bucket is the **maximum** of its input window, not the mean.
 * A mean flattens speech into a nearly straight line — the silences between
 * words dominate the average — and produces the featureless grey sausage that
 * makes so many voice-note waveforms decorative rather than informative. The
 * max keeps syllable structure, which is the only thing the bars are for.
 *
 * Fewer samples than buckets is normal (a 300ms clip at 20 frames/second yields
 * 6 frames): the envelope is then stretched, so a very short note still renders
 * a full-width waveform instead of six bars and a gap.
 */
export function downsamplePeaks(
  samples: ArrayLike<number>,
  buckets: number = VOICE_PEAK_BUCKETS,
): number[] {
  const size = Math.max(1, Math.floor(buckets));
  const n = samples.length;
  if (n === 0) return new Array<number>(size).fill(0);

  const out = new Array<number>(size);
  for (let i = 0; i < size; i++) {
    const start = Math.floor((i * n) / size);
    // `end` is exclusive and always at least one past `start`, so no bucket is
    // empty when n < size (the same sample is simply reused across buckets).
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / size));
    let peak = 0;
    for (let j = start; j < end && j < n; j++) {
      // Clamped per sample, before the max: otherwise a single NaN or infinity
      // wins the comparison and decides the whole bucket.
      const v = clamp01(Math.abs(samples[j]));
      if (v > peak) peak = v;
    }
    out[i] = round(peak);
  }
  return out;
}

/**
 * Sanitise peaks that arrived from a client.
 *
 * A browser can send anything: NaN, negatives, 4000 entries, a number instead of
 * an array. This is the door: it returns exactly `buckets` finite values in
 * `[0, 1]`, resampling if the length is wrong, so nothing downstream has to
 * defend itself and the `Float[]` column can never grow unbounded.
 */
export function normalizePeaks(input: unknown, buckets: number = VOICE_PEAK_BUCKETS): number[] {
  const size = Math.max(1, Math.floor(buckets));
  if (!Array.isArray(input) || input.length === 0) return new Array<number>(size).fill(0);

  const cleaned = input.map((v) => clamp01(typeof v === 'number' ? v : Number(v)));
  if (cleaned.length === size) return cleaned.map(round);
  return downsamplePeaks(cleaned, size);
}

/**
 * Scale peaks so the loudest bar reaches full height.
 *
 * Purely cosmetic and applied at render time, never before storage: a quiet
 * recording and a loud one should both draw a readable waveform, but the stored
 * values stay the true envelope so the normalisation can be changed later
 * without a migration. Silence (all zeros) is returned untouched rather than
 * amplified into noise.
 */
export function normalizeForDisplay(peaks: number[]): number[] {
  let max = 0;
  for (const p of peaks) if (p > max) max = p;
  if (max <= 0.001) return peaks.map(() => 0);
  if (max >= 0.98) return peaks;
  return peaks.map((p) => clamp01(p / max));
}

/**
 * Root-mean-square of one analyser frame, in `[0, 1]`.
 *
 * `getByteTimeDomainData` centres silence at 128, so each byte is converted to a
 * signed −1..1 sample first. RMS (not peak) per frame because a single sample
 * spike from a click would otherwise define the whole frame; the max across
 * frames in {@link downsamplePeaks} restores the peaky character at bar level.
 */
export function frameLevel(timeDomain: Uint8Array): number {
  if (timeDomain.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < timeDomain.length; i++) {
    const sample = (timeDomain[i] - 128) / 128;
    sum += sample * sample;
  }
  return clamp01(Math.sqrt(sum / timeDomain.length));
}

/** `m:ss` for a duration in milliseconds. Used by the recorder and the player. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
