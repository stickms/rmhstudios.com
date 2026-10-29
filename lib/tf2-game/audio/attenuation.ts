/**
 * Source's distance attenuation, as the engine mixes it (snd_dma.cpp — not in the SDK, but its
 * constants are cvars): a sound of level L dB is heard at full volume up to a reference
 * distance and falls off as 1/distance beyond it, then fades to silence once it drops under
 * `snd_gain_min`.
 *
 *   dist_mult(L) = (10^(snd_refdb/20) / 10^(L/20)) / snd_refdist        (SNDLVL_TO_DIST_MULT)
 *   gain(d)      = min(snd_gain_max, 1 / (d · dist_mult))                (SND_GetGainFromMult)
 *   under snd_gain_min: gain = snd_gain_min · (2 − d · dist_mult · snd_gain_min), floored at 0
 *
 * with snd_refdb = 60, snd_refdist = 36 units, snd_gain_min = 0.01, snd_gain_max = 1. So a
 * 75 dB sound (SNDLVL_NORM) is at full volume to ≈202 units and loses 6 dB per doubling of
 * distance after that; every 20 dB more multiplies its reach by ten. SNDLVL 0 (SNDLVL_NONE)
 * is not attenuated at all: it plays everywhere, unspatialised.
 *
 * soundflags.h's SNDLVL_TO_ATTN (attn = 20 / (L − 50)) is the GoldSrc-compatible attenuation the
 * scripts' ATTN_* constants are written in; ATTN_TO_SNDLVL turns those into levels (the sound
 * exporter does that), and the curve above is what the engine then applies to the level.
 *
 * Pure: no Web Audio here.
 */

/** snd_refdb: the level (dB) heard at full volume at snd_refdist. */
export const SND_REFDB = 60;
/** snd_refdist: units. */
export const SND_REFDIST = 36;
export const SND_GAIN_MIN = 0.01;
export const SND_GAIN_MAX = 1;

export const SNDLVL_NONE = 0;
export const SNDLVL_NORM = 75;
export const SNDLVL_TALKING = 80;
export const SNDLVL_GUNFIRE = 140;

/** soundflags.h SNDLVL_TO_ATTN. */
export function sndlvlToAttn(soundlevel: number): number {
  return soundlevel > 50 ? 20 / (soundlevel - 50) : 4;
}

/** soundflags.h ATTN_TO_SNDLVL (truncated to an integer, as the macro's cast does). */
export function attnToSndlvl(attn: number): number {
  return attn ? Math.trunc(50 + 20 / attn) : 0;
}

/** SNDLVL_TO_DIST_MULT: 0 for SNDLVL_NONE (no attenuation). */
export function sndlvlToDistMult(soundlevel: number): number {
  if (!soundlevel) return 0;
  return Math.pow(10, SND_REFDB / 20) / Math.pow(10, soundlevel / 20) / SND_REFDIST;
}

/** SND_GetGainFromMult: the distance gain (0..1) of a sound `dist` units away. */
export function gainFromDistMult(distMult: number, dist: number): number {
  if (distMult <= 0) return 1;
  const relative = dist * distMult;
  let gain = relative > 0.1 ? 1 / relative : 10;
  if (gain > SND_GAIN_MAX) gain = SND_GAIN_MAX;
  if (gain < SND_GAIN_MIN) {
    // Sounds under snd_gain_min fall to zero over the distance it took them to get there.
    gain = SND_GAIN_MIN * (2 - relative * SND_GAIN_MIN);
    if (gain <= 0) gain = 0;
  }
  return gain;
}

/** The distance gain of a sound of `soundlevel` dB heard `dist` units away. */
export function distanceGain(soundlevel: number, dist: number): number {
  return gainFromDistMult(sndlvlToDistMult(soundlevel), dist);
}

/** Distance up to which the sound plays at full volume (units); Infinity for SNDLVL_NONE. */
export function fullVolumeRadius(soundlevel: number): number {
  const m = sndlvlToDistMult(soundlevel);
  return m > 0 ? 1 / m : Infinity;
}

/** Distance past which the sound is silent (units); Infinity for SNDLVL_NONE. */
export function audibleRadius(soundlevel: number): number {
  const m = sndlvlToDistMult(soundlevel);
  return m > 0 ? 2 / (SND_GAIN_MIN * m) : Infinity;
}
