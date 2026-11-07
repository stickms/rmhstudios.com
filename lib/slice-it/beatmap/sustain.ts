/**
 * How long a sound is held.
 *
 * A hold note should be there when the music holds a note: a bass line that
 * rings for two beats, a pad under a chorus, a sung vowel. The old measure asked
 * whether the *whole spectrum's* energy stayed above 60% of the attack frame, and
 * on any dense track the drums kept it up, so nothing was ever sustained (and on
 * a sparse one, every reverb tail was).
 *
 * The question that actually separates a held note from a hit is local in
 * frequency: **did the bands this onset lit up stay lit?** A kick lights the
 * lowest bands and they are gone in 100 ms. A bass note lights the same bands and
 * they stay, flat, until the player lifts the string. So this looks only at the
 * bands the attack raised, follows their energy forward, and ends the hold where
 * that energy releases (or where a new note re-attacks in the same bands).
 */

import type { Spectrogram } from './spectrum';

/** An attack must raise its strongest band by at least this much (log units). */
const MIN_RISE = 0.35;
/** A band is part of the note if it rose at least this fraction of the maximum. */
const BAND_RISE_SHARE = 0.6;
/** At most this many bands (plus a neighbour either side) describe one note. */
const MAX_BANDS = 8;
/** Frames after the attack that are the transient and the plateau's settling. */
const SETTLE_FRAMES = 10;
/** The plateau must be this far above the floor to be a note at all. */
const PLATEAU_OVER_FLOOR = 1.6;
/** A band is part of the held note if it is still this strong after the settling window. */
const BAND_PERSISTENCE = 0.45;
/** The hold ends when the energy has fallen under this share of the plateau… */
const RELEASE_FRACTION = 0.4;
/** …for this many consecutive frames. */
const RELEASE_FRAMES = 2;
/** The next onset this close in sound (octaves of centroid) is a new note, and ends the hold. */
const SAME_SOUND_OCTAVES = 0.75;
/** …if it is at least this strong. A faint onset in the same bands is not a new note. */
const NEW_NOTE_STRENGTH = 0.25;
/** Dips shorter than this many frames do not end a hold (beating partials, vibrato). */
const SMOOTH_FRAMES = 3;
/** The low band must be at least this share of the track's loud low end to count. */
const LOW_SIGNIFICANCE = 0.2;
/**
 * The low band must RISE at the onset by at least this factor for the onset to own
 * a bass hold. Without it a snare beside a bass line is credited with the bass
 * note's length — a false hold on every backbeat — because the low band is loud
 * whether or not this onset had anything to do with it.
 */
const LOW_RISE_FACTOR = 1.8;
/** A low-band rise of this factor within two frames is the bass being struck again. */
const LOW_REATTACK_FACTOR = 1.5;

/** Minimal onset shape this needs (the full `Onset` satisfies it). */
export interface SustainOnset {
  frame: number;
  strength?: number;
  centroid?: number;
}

/**
 * Follow one energy trace from an attack at frame `f`.
 *
 * Returns the frame the sound stops sounding at, or `null` if the trace is not a
 * sustained sound at all (nothing above the floor after the attack has settled).
 * The trace is smoothed with a short running maximum before the release test, so
 * the brief dips two nearby partials make as they beat do not end a hold; the
 * lag that smoothing adds is taken back off the answer.
 */
function followTrace(
  energyAt: (g: number) => number,
  f: number,
  last: number,
  floor: number,
  minPlateau = 0,
  reattack = false,
): number | null {
  // A hold that would end inside the settling window is a hit.
  if (last < f + SETTLE_FRAMES + 2) return null;
  const lateStart = f + SETTLE_FRAMES - 2;
  const settle: number[] = [];
  for (let g = lateStart; g <= f + SETTLE_FRAMES + 2; g++) settle.push(energyAt(g));
  settle.sort((a, c) => a - c);
  const plateau = settle[settle.length >> 1];
  if (!(plateau > floor * PLATEAU_OVER_FLOOR) || plateau < minPlateau) return null;

  const smoothed = (g: number): number => {
    let m = 0;
    for (let k = 0; k < SMOOTH_FRAMES; k++) m = Math.max(m, energyAt(g - k));
    return m;
  };

  let low = 0;
  let prev2 = energyAt(f + SETTLE_FRAMES - 1);
  let prev1 = energyAt(f + SETTLE_FRAMES);
  for (let g = f + SETTLE_FRAMES + 1; g <= last; g++) {
    const e = energyAt(g);
    if (reattack && e > prev2 * LOW_REATTACK_FACTOR && e > plateau * 0.9 && e > prev1) return g - 1;
    prev2 = prev1;
    prev1 = e;
    if (smoothed(g) < plateau * RELEASE_FRACTION) {
      low++;
      // `smoothed(g)` is low only when the last SMOOTH_FRAMES raw frames all were,
      // so the release began SMOOTH_FRAMES - 1 frames before the first low `g`.
      if (low >= RELEASE_FRAMES) {
        return Math.max(f + SETTLE_FRAMES, g - RELEASE_FRAMES + 1 - (SMOOTH_FRAMES - 1));
      }
    } else {
      low = 0;
    }
  }
  return last;
}

/**
 * For each onset, the absolute time (seconds) its note stops sounding, or `null`
 * when it is a hit rather than a held note.
 *
 * Two views are taken and the longer plausible answer wins: the bands the attack
 * raised in the spectrogram (a lead, a pad, a vocal), and — because the spectrogram
 * cannot see below ~200 Hz — the low-passed envelope (a bass note).
 */
export function measureSustainEnds(
  spec: Spectrogram,
  onsets: readonly SustainOnset[],
  maxSeconds: number,
  lowEnvelope?: Float32Array,
): (number | null)[] {
  const { data, frames, bands, frameDuration } = spec;
  const maxFrames = Math.max(SETTLE_FRAMES + 4, Math.ceil(maxSeconds / frameDuration));
  const out: (number | null)[] = new Array(onsets.length).fill(null);
  if (frames === 0 || bands === 0) return out;

  // What counts as a loud low end in THIS track, so room hiss and rumble do not
  // register as bass notes.
  let lowLoud = 0;
  if (lowEnvelope && lowEnvelope.length > 0) {
    const sorted = Float32Array.from(lowEnvelope).sort();
    lowLoud = sorted[Math.floor(sorted.length * 0.9)] * LOW_SIGNIFICANCE;
  }

  const bandSet: number[] = [];
  const picked = new Uint8Array(bands);

  for (let i = 0; i < onsets.length; i++) {
    const f = onsets[i].frame;
    if (f < 5 || f + SETTLE_FRAMES + 2 >= frames) continue;
    let last = Math.min(frames - 1, f + maxFrames);
    // A new note of the same sound ends this one where it starts. A drum hit in
    // other bands does not: that is exactly the snare that used to cut every pad
    // that began on a downbeat to one beat long.
    const here = onsets[i];
    for (let j = i + 1; j < onsets.length && onsets[j].frame <= last; j++) {
      const next = onsets[j];
      if ((next.strength ?? 1) < NEW_NOTE_STRENGTH) continue;
      const similar =
        here.centroid === undefined ||
        next.centroid === undefined ||
        Math.abs(next.centroid - here.centroid) <= SAME_SOUND_OCTAVES;
      if (similar) {
        last = Math.min(last, next.frame - 1);
        break;
      }
    }
    let endFrame: number | null = null;

    /* View 1: the bands this attack raised. */
    const before = (f - 4) * bands;
    const after = (f + 2) * bands;
    let maxRise = 0;
    for (let b = 0; b < bands; b++) maxRise = Math.max(maxRise, data[after + b] - data[before + b]);
    if (maxRise >= MIN_RISE) {
      const ranked: { b: number; rise: number }[] = [];
      for (let b = 0; b < bands; b++) {
        const rise = data[after + b] - data[before + b];
        if (rise >= maxRise * BAND_RISE_SHARE && rise >= MIN_RISE * 0.8) ranked.push({ b, rise });
      }
      ranked.sort((a, c) => c.rise - a.rise);
      picked.fill(0);
      for (const { b } of ranked.slice(0, MAX_BANDS)) {
        for (let d = -1; d <= 1; d++) {
          const nb = b + d;
          if (nb >= 0 && nb < bands) picked[nb] = 1;
        }
      }

      /* Of those, the bands still there after the settling window. A note usually
       * starts with a drum (a pad on the downbeat), so the raised bands are a mix
       * of the drum's — gone in 100 ms — and the note's. Averaging all of them
       * makes the drum's decay look like the note releasing. Keeping the bands that
       * persist follows the NOTE. */
      const lateStart = f + SETTLE_FRAMES - 2;
      bandSet.length = 0;
      for (let b = 0; b < bands; b++) {
        if (!picked[b]) continue;
        const floorB = Math.expm1(data[(f - 4) * bands + b]);
        let early = 0;
        for (let g = f + 2; g <= f + 4; g++) early = Math.max(early, Math.expm1(data[g * bands + b]));
        let late = 0;
        for (let g = lateStart; g <= f + SETTLE_FRAMES; g++) late += Math.expm1(data[g * bands + b]);
        late /= f + SETTLE_FRAMES - lateStart + 1;
        if (late >= early * BAND_PERSISTENCE && late > floorB * PLATEAU_OVER_FLOOR) bandSet.push(b);
      }
      if (bandSet.length > 0) {
        const energyAt = (g: number): number => {
          const row = g * bands;
          let sum = 0;
          for (let k = 0; k < bandSet.length; k++) sum += Math.expm1(data[row + bandSet[k]]);
          return sum / bandSet.length;
        };
        const floor = Math.min(energyAt(f - 4), energyAt(f - 3)) + 1e-6;
        endFrame = followTrace(energyAt, f, last, floor);
      }
    }

    /* View 2: the low end, which the bands above cannot resolve. */
    const lowAt = (g: number): number => (lowEnvelope ? lowEnvelope[Math.min(g, lowEnvelope.length - 1)] : 0);
    const lowFloor = Math.min(lowAt(f - 4), lowAt(f - 3)) + 1e-6;
    if (lowEnvelope && lowAt(f + 3) >= lowFloor * LOW_RISE_FACTOR) {
      const lowEnd = followTrace(lowAt, f, last, lowFloor, lowLoud, true);
      if (lowEnd !== null && (endFrame === null || lowEnd > endFrame)) endFrame = lowEnd;
    }

    if (endFrame !== null) out[i] = spec.frameTime(endFrame);
  }

  return out;
}
