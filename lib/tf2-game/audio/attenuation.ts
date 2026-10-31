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
 * ## Falloff profiles (CS:GO)
 *
 * TF2, HL2 and Portal attenuate by the curve alone. CS:GO's sound entries are
 * `"soundentry_version" "2"`: their distance behaviour comes from operator stacks
 * (`scripts/sound_operator_stacks.txt`, imported per entry), which the sound exporter does not
 * evaluate — scripts/tf2-game/sounds.py keeps only each entry's `soundlevel` (gunfire 79 dB,
 * footsteps and bounces 75, foley 60–65). On the plain curve those levels carry far too far for
 * the quiet sounds: a 75 dB footstep is still at −14 dB at 1000 units and only silent past
 * ~40 000, so a whole map of footsteps is audible. A `FalloffProfile` therefore multiplies the
 * curve by a smooth fade to silence for sounds at or under a level (`FalloffBand`), chosen per
 * game (`falloffProfileFor`). CSGO_FALLOFF's numbers are tuned to the ranges players measure in
 * CS:GO, not read from Valve data: footsteps fade between 600 and 1100 units, foley (draws,
 * reloads, pins) between 350 and 800; gunfire (79 dB) and louder keep the plain curve, so a shot
 * is heard across the map but clearly quieter with distance (−10 dB at 1000 units, −22 dB at
 * 4000).
 *
 * `soundlevelForRadius` is ambient_generic's radius → level (ComputeSoundlevel in the SDK's
 * game/server/sound.cpp: 40 dB at the radius), for raw wave paths that have no script level.
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
    const fade = 2 - relative * SND_GAIN_MIN;
    // At audibleRadius() the fade is 0 in exact arithmetic but ~1e-16 in doubles;
    // snap it so a voice at the edge is culled rather than kept at an inaudible gain.
    gain = fade > 1e-9 ? SND_GAIN_MIN * fade : 0;
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

/** soundlevel_t from an ambient_generic radius (SDK ComputeSoundlevel): 40 dB at `radius` units. */
export function soundlevelForRadius(radius: number, everywhere = false): number {
  if (!(radius > 0) || everywhere) return SNDLVL_NONE;
  return Math.trunc(40 + 20 * Math.log10(radius / SND_REFDIST));
}

/** A fade to silence between two distances for sounds at or under a level (see the header). */
export interface FalloffBand {
  /** The band covers sounds of at most this level (dB); the first matching band applies. */
  readonly maxSoundlevel: number;
  /** Units: full curve gain up to here… */
  readonly fadeStart: number;
  /** …and silent from here. */
  readonly fadeEnd: number;
}

export interface FalloffProfile {
  /** Ascending by `maxSoundlevel`; louder sounds than every band keep the plain curve. */
  readonly bands: readonly FalloffBand[];
}

/** The plain Source curve (TF2, HL2, Portal). */
export const SOURCE_FALLOFF: FalloffProfile = { bands: [] };

/** CS:GO's operator-stack falloff, approximated (see the header): quiet sounds stop carrying. */
export const CSGO_FALLOFF: FalloffProfile = {
  bands: [
    // Foley: weapon draws, reloads, bolt pulls, pin pulls, item pickups (60–65 dB).
    { maxSoundlevel: 70, fadeStart: 350, fadeEnd: 800 },
    // Footsteps, ladder steps, grenade bounces, landings (75 dB).
    { maxSoundlevel: 77, fadeStart: 600, fadeEnd: 1100 },
  ],
};

/** The profile a game's sounds attenuate by. */
export function falloffProfileFor(game: string): FalloffProfile {
  return game === 'csgo' ? CSGO_FALLOFF : SOURCE_FALLOFF;
}

function bandFor(profile: FalloffProfile, soundlevel: number): FalloffBand | null {
  if (!soundlevel) return null;
  for (const b of profile.bands) if (soundlevel <= b.maxSoundlevel) return b;
  return null;
}

/** The profile's extra factor (0..1) at `dist`: 1 before the band's fade, 0 after it. */
export function falloffFade(profile: FalloffProfile, soundlevel: number, dist: number): number {
  const b = bandFor(profile, soundlevel);
  if (!b || dist <= b.fadeStart) return 1;
  if (dist >= b.fadeEnd) return 0;
  // Smoothstep: no corner in loudness where the fade begins or ends.
  const t = (dist - b.fadeStart) / (b.fadeEnd - b.fadeStart);
  return 1 - t * t * (3 - 2 * t);
}

/** The distance gain under a profile: the Source curve times the profile's fade. */
export function profileDistanceGain(
  profile: FalloffProfile,
  soundlevel: number,
  dist: number,
): number {
  const g = distanceGain(soundlevel, dist);
  return g > 0 ? g * falloffFade(profile, soundlevel, dist) : 0;
}

/** Distance past which a sound is silent under a profile (units). */
export function profileAudibleRadius(profile: FalloffProfile, soundlevel: number): number {
  const b = bandFor(profile, soundlevel);
  const r = audibleRadius(soundlevel);
  return b ? Math.min(r, b.fadeEnd) : r;
}
