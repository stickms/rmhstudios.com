/**
 * Where a sound actually starts.
 *
 * The onset detector works on a log-magnitude spectrogram with 46 ms windows, and
 * its flux peaks when the attack first shows up in the *edge* of a window — about
 * 16 ms before the sound is audible (measured: every onset of a click-accurate
 * test track came out 16 ms early, with a spread of ±3 ms). A chart whose notes
 * all sit 16 ms ahead of the music feels like the music is late, and the player's
 * calibration cannot fix it because it differs per song.
 *
 * So each detected time is refined against the waveform itself: find the loudest
 * point of a short amplitude envelope near the detection and walk back to where
 * the envelope rose out of its floor. That is the moment a player hears the hit.
 */

/** Envelope resolution, seconds. 1 ms is finer than any hit window and cheap. */
const ENV_HOP_S = 0.001;
/** Smoothing window for the amplitude envelope, seconds. */
const ENV_WINDOW_S = 0.003;
/** How far before / after the detection to look, seconds. */
const SEARCH_BEFORE_S = 0.03;
const SEARCH_AFTER_S = 0.03;
/** A refinement larger than this is the wrong event; keep the detection. */
const MAX_SHIFT_S = 0.025;
/** The onset is where the envelope crosses this fraction of its rise. */
const RISE_FRACTION = 0.2;

/**
 * Refine one onset time against the waveform. Returns the input unchanged when
 * the signal is too quiet or too flat around it to tell.
 */
export function refineAttackTime(samples: Float32Array, sampleRate: number, approx: number): number {
  const hop = Math.max(1, Math.round(ENV_HOP_S * sampleRate));
  const win = Math.max(2, Math.round(ENV_WINDOW_S * sampleRate));
  const from = Math.max(0, Math.floor((approx - SEARCH_BEFORE_S) * sampleRate));
  const to = Math.min(samples.length - win - 1, Math.ceil((approx + SEARCH_AFTER_S) * sampleRate));
  if (to - from < hop * 8) return approx;

  const count = Math.floor((to - from) / hop);
  const env = new Float32Array(count);
  let peak = 0;
  let peakIndex = 0;
  for (let j = 0; j < count; j++) {
    const start = from + j * hop;
    // The rectified first difference, not the raw amplitude: it keeps the
    // transient and discards a bass note or pad sounding underneath, which would
    // otherwise raise the floor and hide the rise.
    let sum = 0;
    for (let k = 1; k <= win; k++) sum += Math.abs(samples[start + k] - samples[start + k - 1]);
    const value = sum / win;
    env[j] = value;
    if (value > peak) {
      peak = value;
      peakIndex = j;
    }
  }
  if (!(peak > 1e-4)) return approx;

  // The floor is the quietest stretch before the peak.
  let floor = Infinity;
  for (let j = 0; j <= peakIndex; j++) floor = Math.min(floor, env[j]);
  if (!(peak > floor * 1.8)) return approx; // no clear rise to locate

  const threshold = floor + (peak - floor) * RISE_FRACTION;
  let j = peakIndex;
  while (j > 0 && env[j - 1] >= threshold) j--;
  const refined = (from + j * hop + win / 2) / sampleRate;
  return Math.abs(refined - approx) <= MAX_SHIFT_S ? refined : approx;
}

/**
 * Refine every onset in place and return the median shift applied, seconds
 * (negative when the detector ran early). Callers move the beat grid by the same
 * amount, so notes snap to a grid that is in the same time base as they are.
 */
export function refineOnsetTimes(
  onsets: { time: number }[],
  samples: Float32Array,
  sampleRate: number,
): number {
  if (onsets.length === 0) return 0;
  const shifts: number[] = [];
  for (const onset of onsets) {
    const refined = refineAttackTime(samples, sampleRate, onset.time);
    shifts.push(refined - onset.time);
    onset.time = refined;
  }
  shifts.sort((a, b) => a - b);
  return shifts[Math.floor(shifts.length / 2)];
}
