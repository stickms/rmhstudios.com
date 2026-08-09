/**
 * Slice It — the reactive backdrop.
 *
 * `V3` (a spectrum envelope persisted with the chart) and `V7` (stage backdrops
 * driven by run state). Both exist to make the background carry information
 * without costing frames, and both are pure so the canvas can call them per
 * frame without allocating.
 *
 * The unifying decision: **nothing here runs an FFT or reads the audio graph at
 * runtime.** The analyser already computes a full STFT while charting and then
 * throws the spectrogram away; persisting a few kilobytes of it is free, and an
 * `AnalyserNode` on the audio path is the one thing in this feature that would
 * actually cost the player frames.
 */

import { envelopePeak } from './beatmap/envelope';

/* ─── V3 — the persisted spectrum envelope ───────────────────────────────── */

/** Frames per second in a stored envelope. */
export const ENVELOPE_HZ = 30;
/** Bands per frame. */
export const ENVELOPE_BANDS = 8;

/**
 * Downsample a log-frequency filterbank into a byte-per-band envelope.
 *
 * `bands[frame][band]` in, `Uint8Array` out, laid out frame-major so a renderer
 * reads one contiguous run of 8 bytes per frame.
 *
 * Uint8 rather than Float32 is the whole reason this is shippable: a 4-minute
 * track is ~57 KB at 30 Hz × 8 bands, which is smaller than its cover image. At
 * Float32 it would be 230 KB and nobody would agree to send it.
 *
 * @param frames  Per-analysis-frame magnitudes, already log-frequency binned.
 * @param frameHz The analyser's own frame rate (hop rate), not the target.
 */
export function spectrumEnvelope(frames: Float32Array[], frameHz: number): Uint8Array {
  if (frames.length === 0 || frameHz <= 0) return new Uint8Array(0);

  const outFrames = Math.max(1, Math.round((frames.length / frameHz) * ENVELOPE_HZ));
  const out = new Uint8Array(outFrames * ENVELOPE_BANDS);

  // Peak, not mean, when several analysis frames collapse into one output
  // frame. A mean smears transients into mush, and transients are the only
  // thing a backdrop at 30 Hz can actually show.
  const peaks = new Float32Array(outFrames * ENVELOPE_BANDS);
  for (let i = 0; i < frames.length; i++) {
    const target = Math.min(outFrames - 1, Math.floor((i / frameHz) * ENVELOPE_HZ));
    const frame = frames[i];
    const bandWidth = frame.length / ENVELOPE_BANDS;
    for (let band = 0; band < ENVELOPE_BANDS; band++) {
      const from = Math.floor(band * bandWidth);
      const to = Math.max(from + 1, Math.floor((band + 1) * bandWidth));
      let peak = 0;
      for (let bin = from; bin < to && bin < frame.length; bin++) {
        const value = frame[bin];
        if (value > peak) peak = value;
      }
      const index = target * ENVELOPE_BANDS + band;
      if (peak > peaks[index]) peaks[index] = peak;
    }
  }

  // Normalised against the track's own maximum rather than an absolute scale.
  // A quiet master and a loud one should both fill the backdrop; the envelope
  // describes the shape of this song, not its mastering level.
  let max = 0;
  for (const value of peaks) if (value > max) max = value;
  if (max <= 0) return out;
  for (let i = 0; i < peaks.length; i++) out[i] = Math.round((peaks[i] / max) * 255);
  return out;
}

/**
 * Read one frame out of an envelope at a playback time.
 *
 * Returns a fixed-length view into the caller's scratch array rather than
 * allocating, because this is called once per rendered frame and the allocation
 * would be the visible cost of the whole feature.
 *
 * Out-of-range times produce silence rather than clamping to the last frame: a
 * backdrop frozen on the final chord through a 10-second outro reads as the
 * renderer having died.
 */
export function sampleEnvelope(
  envelope: Uint8Array,
  seconds: number,
  into: Uint8Array = new Uint8Array(ENVELOPE_BANDS),
): Uint8Array {
  into.fill(0);
  if (envelope.length === 0 || seconds < 0) return into;
  const frame = Math.floor(seconds * ENVELOPE_HZ);
  const offset = frame * ENVELOPE_BANDS;
  if (offset + ENVELOPE_BANDS > envelope.length) return into;
  for (let band = 0; band < ENVELOPE_BANDS; band++) into[band] = envelope[offset + band];
  return into;
}

/** Base64 for transport — the envelope rides in JSON alongside the chart. */
export function encodeEnvelope(envelope: Uint8Array): string {
  let binary = '';
  for (const byte of envelope) binary += String.fromCharCode(byte);
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(envelope).toString('base64');
}

export function decodeEnvelope(encoded: string | null | undefined): Uint8Array {
  if (!encoded) return new Uint8Array(0);
  try {
    if (typeof atob === 'function') {
      const binary = atob(encoded);
      const out = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(encoded, 'base64'));
  } catch {
    // A corrupt envelope is a missing backdrop, never a failed run.
    return new Uint8Array(0);
  }
}

/* ─── V7 — stage backdrops ───────────────────────────────────────────────── */

export type BackdropId = 'none' | 'pulse' | 'bars' | 'aurora';

export interface BackdropState {
  /** 0–1. Overall brightness/scale of the backdrop treatment. */
  intensity: number;
  /** 0–1. How close to failing the run is; drives the desaturation. */
  danger: number;
}

/**
 * Backdrop state as a pure function of run state.
 *
 * Deliberately has no timeline of its own. A backdrop with its own animation
 * clock can desync from the gauge it is describing, and a decoration that
 * *lies* about how close you are to failing is worse than no decoration.
 *
 * Health dominates (60%) because that is the part the player needs; combo
 * contributes the rest, so a clean run visibly builds even at full health.
 */
export function backdropState(options: {
  health: number;
  healthMax: number;
  combo: number;
  /** False when the gauge is off, which is the default — see `G1`. */
  healthEnabled: boolean;
}): BackdropState {
  const { combo, healthEnabled } = options;
  const healthMax = options.healthMax > 0 ? options.healthMax : 1;
  const health = clamp01(options.health / healthMax);
  const comboTerm = Math.min(1, Math.max(0, combo) / 200);

  // With the gauge off there is no danger to describe, so combo carries the
  // whole signal rather than the backdrop sitting permanently at 60%.
  if (!healthEnabled) return { intensity: comboTerm, danger: 0 };

  return { intensity: health * 0.6 + comboTerm * 0.4, danger: 1 - health };
}

/**
 * Whether a backdrop may draw at all.
 *
 * Three separate switches, all of which have to be on. `A2`'s photosensitivity
 * mode and the theme's glow tier are not suggestions, and a backdrop is exactly
 * the kind of full-screen luminance change that mode exists to stop.
 */
export function backdropVisible(options: {
  backdrop: BackdropId;
  glow: boolean;
  reducedFlash: boolean;
}): boolean {
  return options.backdrop !== 'none' && options.glow && !options.reducedFlash;
}

/**
 * The registry, in the order the settings panel offers them.
 *
 * Same shape as `palettes.ts`'s `LANE_PALETTE_IDS` and `skins.ts`'s
 * `FREE_SKIN_IDS`, and for the same reason: the persisted value is a string
 * from someone's local storage, and every consumer needs one place that turns
 * an arbitrary string back into something drawable.
 */
export const BACKDROP_IDS = ['none', 'pulse', 'bars', 'aurora'] as const;

/** Narrow an arbitrary persisted string back to a backdrop. */
export function resolveBackdrop(id: string | null | undefined): BackdropId {
  if (!id) return 'none';
  return (BACKDROP_IDS as readonly string[]).includes(id) ? (id as BackdropId) : 'none';
}

/* ─── V7 — reading the music the backdrops react to ──────────────────────── */

/**
 * Where a backdrop's audio comes from: the peak envelope already persisted on
 * `analysisData.artefacts`.
 *
 * This is the part that makes V7 shippable without V3's spectrum envelope. The
 * analyser writes a ~200 Hz peak-amplitude curve for every song it charts
 * (`beatmap/envelope.ts` — ~48 KB, on the wire today because the chart editor
 * draws its waveform from it), and it is already in the tab: `useStartRun`
 * hands the whole analysis blob to the engine, and `HUD.tsx` reads
 * `artefacts.sections` off the same object. So a visualiser that samples it
 * costs **one extra consumer of bytes the client already downloaded** — no new
 * column, no bigger payload, no runtime FFT, and it is sample-accurately in
 * sync with the notes because it came out of the same analysis pass they did.
 *
 * A song with no stored artefacts (a legacy row nobody has played since the
 * analyser moved server-side, which `useStartRun` backfills on first play)
 * reads a level of 0 forever. That is deliberate: the backdrop then rides on
 * run state alone — dimmer and calmer, still correct — rather than inventing
 * a signal that has nothing to do with the audio.
 */

/**
 * Seconds of audio one loudness reading covers.
 *
 * 60 ms is a little under four frames at 60 Hz, so consecutive frames overlap
 * and a transient cannot fall between two readings and vanish — which is what
 * point-sampling a 200 Hz curve at 60 Hz does, and it looks like the backdrop
 * randomly ignoring half the kicks.
 */
export const BACKDROP_LEVEL_WINDOW = 0.06;

/**
 * Peak loudness around a playback time, 0–1.
 *
 * Square-rooted on the way out. The stored bytes are linear amplitude, and
 * linear amplitude spends most of its range on the loudest 10% of a track: a
 * backdrop driven by it sits near zero through every verse and only wakes up
 * in a chorus. The curve is a stand-in for a proper dB mapping, which would
 * need a floor to keep silence from mapping to −∞.
 */
export function backdropLevel(envelope: Uint8Array, rate: number, seconds: number): number {
  if (!(seconds >= 0)) return 0;
  const half = BACKDROP_LEVEL_WINDOW / 2;
  return Math.sqrt(envelopePeak(envelope, rate, seconds - half, seconds + half));
}

/**
 * The same reading, spread across a time range — one value per bar.
 *
 * Writes into the caller's array rather than allocating, because this runs once
 * per frame with 64 buckets and the allocation would be the only garbage the
 * draw loop produces.
 *
 * Returns false when there is nothing to draw (no stored envelope, or a
 * degenerate range), so the renderer can skip the pass rather than paint a row
 * of zero-height bars and leave the player looking at a backdrop that appears
 * broken.
 */
export function backdropBars(
  envelope: Uint8Array,
  rate: number,
  fromSeconds: number,
  toSeconds: number,
  into: Float32Array,
): boolean {
  into.fill(0);
  const count = into.length;
  if (count === 0 || envelope.length === 0 || !(rate > 0)) return false;
  if (!(toSeconds > fromSeconds)) return false;

  const step = (toSeconds - fromSeconds) / count;
  for (let i = 0; i < count; i++) {
    const start = fromSeconds + i * step;
    // Peak over the bucket, not the sample at its centre: one bar covers ~47 ms
    // of a 5 ms curve, and nearest-sampling that aliases — the bar field
    // shimmers as it scrolls instead of moving with the music. The same
    // reasoning `envelopePeak` itself documents.
    into[i] = start < 0 ? 0 : Math.sqrt(envelopePeak(envelope, rate, start, start + step));
  }
  return true;
}

/**
 * How fast the drawn level may RISE toward a new peak, and fall away from one.
 *
 * An envelope follower, and the asymmetry is the whole design. A fast attack is
 * what makes a kick land on the frame it happens; a slow release is what stops
 * the gap after it from being a hole. Together they turn a 200 Hz curve full of
 * holes into something that reads as the room breathing.
 *
 * The release also does the accessibility work. A backdrop tracking a 200 BPM
 * track is a 3.3 Hz modulation — inside the band photosensitivity guidance
 * cares about — so the depth is bounded (the renderer never swings more than
 * ~12% alpha of a mid-tone colour, never a full-screen luminance step) and the
 * 0.34 s release damps the trough between beats so consecutive peaks blur into
 * one another rather than strobing. Above that, `backdropVisible` is the real
 * answer: reduced motion, `perf-lite` and A2's photosensitivity mode each turn
 * the whole layer off.
 */
export const BACKDROP_ATTACK_TAU = 0.045;
export const BACKDROP_RELEASE_TAU = 0.34;

/** One frame of envelope following. Frame-rate independent, like {@link approachEnergy}. */
export function approachLevel(current: number, target: number, dt: number): number {
  return lag(current, target, dt, target >= current ? BACKDROP_ATTACK_TAU : BACKDROP_RELEASE_TAU);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Move `current` toward `target` by one frame's worth of first-order lag.
 *
 * Exponential rather than a fixed step so it is frame-rate independent: the
 * same wall-clock second produces the same approach at 60 Hz and at 144 Hz.
 * Shared by the two followers here so there is one definition of what "eases
 * toward" means on this screen rather than two that can drift apart.
 */
function lag(current: number, target: number, dt: number, tau: number): number {
  if (!Number.isFinite(dt) || dt <= 0 || !(tau > 0)) return clamp01(current);
  const k = 1 - Math.exp(-dt / tau);
  return clamp01(current + (clamp01(target) - clamp01(current)) * k);
}

/* ─── V13 — playfield energy ─────────────────────────────────────────────── */

/**
 * The combo at which the curve below has spent ~63% of its range.
 *
 * Picked against the shape of a real run rather than a round number: 50 is
 * "you have started", 200 is "this is going well", 600 is "do not breathe".
 * At 260 those land at 0.17 / 0.54 / 0.90, which keeps visible headroom
 * exactly where the player is still climbing and stops spending it long
 * before a 1000-combo chart runs out of playfield to light up.
 */
export const ENERGY_HALF_COMBO = 260;

/**
 * How lit the playfield is, as a pure function of the current combo. 0 → 1.
 *
 * **Continuous and thresholdless, and that is the entire point.** The combo
 * feedback this replaces was a full-screen colour wash fired at 50/100/250/
 * 500/1000 — five interruptions per song, at the precise moments the player is
 * reading notes, and the most-complained-about thing in the game (removed in
 * `f35a003f`). A smaller flash on the same thresholds would have been the same
 * mistake with a smaller radius.
 *
 * So this is a curve, not a ladder: every note you hit moves it a little, which
 * means the playfield rewards the streak you are *in* rather than announcing
 * the ones you have finished. Nothing here has a timeline, a period or a pulse
 * — the only thing that moves it is the combo, and {@link approachEnergy}
 * bounds how fast it may follow.
 *
 * Saturating rather than linear because the interesting range is the bottom:
 * the difference between 20 and 80 combo is a run finding its feet and should
 * be visible, while the difference between 800 and 900 is not information.
 */
export function comboEnergy(combo: number): number {
  if (!Number.isFinite(combo) || combo <= 0) return 0;
  return 1 - Math.exp(-combo / ENERGY_HALF_COMBO);
}

/** Seconds for the lit state to close ~63% of a gap while the combo climbs. */
export const ENERGY_RISE_TAU = 0.45;

/**
 * The same, falling. Deliberately slower than the rise.
 *
 * A combo break takes {@link comboEnergy} from (say) 0.9 to 0 in one frame. Cut
 * straight, that is a full-playfield luminance step — the exact shape of the
 * flash this feature exists to not be. Draining it over about a second reads as
 * the field going out, which is also the truer description of what happened.
 */
export const ENERGY_FALL_TAU = 0.9;

/**
 * Move `current` toward `target` by one frame's worth of first-order lag.
 *
 * Exponential rather than a fixed step so it is frame-rate independent: the
 * same wall-clock second produces the same approach at 60 Hz and at 144 Hz.
 *
 * This is also what makes the accessibility bound trivially true. A first-order
 * lag has no overshoot and no oscillation, so the lit state cannot flash at any
 * rate — with these taus its steepest excursion is a ~2/s ramp that only
 * happens once per streak. There is no periodic term in THIS feature (no beat
 * pulse, no shimmer): the playfield answers the combo and nothing else. V7's
 * backdrops do carry one, which is why they sit behind their own switch and
 * behind {@link backdropVisible} on top of it.
 */
export function approachEnergy(current: number, target: number, dt: number): number {
  return lag(current, target, dt, target >= current ? ENERGY_RISE_TAU : ENERGY_FALL_TAU);
}
