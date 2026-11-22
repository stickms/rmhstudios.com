/**
 * The microphone's input gain — pure.
 *
 * A quiet microphone (a laptop's, a phone held away, a soft voice) reads below the detector's
 * level gate and the setup meter barely moves. The gain is a linear multiplier applied to the signal
 * before it is measured or analysed, so the meter, the gate and the pitch detector all see the same
 * louder signal. 1 is the microphone as heard (and the default, so nothing changes until it is
 * raised); 16 (+24 dB) is the most, past which a quiet room's noise floor is the only thing left to
 * amplify. The slider is logarithmic: equal steps are equal changes in loudness.
 */

export const MIN_MIC_GAIN = 1;
export const MAX_MIC_GAIN = 16;
export const DEFAULT_MIC_GAIN = 1;
/** Slider positions: 0 (gain 1) to this (gain 16), four steps per doubling. */
export const MIC_GAIN_STEPS = 16;

/** A gain repaired into range; anything that is not a finite number is the default. */
export function clampMicGain(gain: unknown): number {
  if (typeof gain !== 'number' || !Number.isFinite(gain)) return DEFAULT_MIC_GAIN;
  return Math.min(MAX_MIC_GAIN, Math.max(MIN_MIC_GAIN, gain));
}

/** The gain a slider position stands for (log scale, rounded to two decimals). */
export function gainFromStep(step: number): number {
  const s = Number.isFinite(step) ? Math.min(MIC_GAIN_STEPS, Math.max(0, Math.round(step))) : 0;
  return Math.round(2 ** (s / 4) * 100) / 100;
}

/** The slider position nearest a gain. */
export function stepFromGain(gain: number): number {
  return Math.round(Math.log2(clampMicGain(gain)) * 4);
}
