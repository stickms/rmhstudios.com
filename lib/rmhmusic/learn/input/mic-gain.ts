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

// ─── Cutoff (the level gate) ─────────────────────────────────────────────────

/**
 * The cutoff: sound quieter than this level (RMS, after the gain) is ignored, so a fan, a hum or the
 * room never reads as a note. Like the input-sensitivity slider of a voice-chat app, it is shown over
 * the live level bar. 0.01 is what the detector always used; the slider runs from 0.002 (very
 * sensitive) to 0.2 (only loud notes), logarithmically, ten steps per factor of ten.
 */
export const MIN_MIC_GATE = 0.002;
export const MAX_MIC_GATE = 0.2;
export const DEFAULT_MIC_GATE = 0.01;
export const MIC_GATE_STEPS = 20;

export function clampMicGate(gate: unknown): number {
  if (typeof gate !== 'number' || !Number.isFinite(gate)) return DEFAULT_MIC_GATE;
  return Math.min(MAX_MIC_GATE, Math.max(MIN_MIC_GATE, gate));
}

/** The cutoff a slider position stands for (rounded so it stores and compares cleanly). */
export function gateFromStep(step: number): number {
  const s = Number.isFinite(step) ? Math.min(MIC_GATE_STEPS, Math.max(0, Math.round(step))) : 0;
  return Math.round(MIN_MIC_GATE * 10 ** (s / 10) * 1e5) / 1e5;
}

/** The slider position nearest a cutoff. */
export function stepFromGate(gate: number): number {
  return Math.round(Math.log10(clampMicGate(gate) / MIN_MIC_GATE) * 10);
}

/** A level in decibels relative to full scale, for showing a cutoff (-54 dB … -14 dB). */
export function levelToDb(level: number): number {
  return Math.round(20 * Math.log10(Math.max(level, 1e-6)));
}

// ─── Hum filter ──────────────────────────────────────────────────────────────

/**
 * Mains hum sits at 50 Hz (Europe, most of Asia and Africa) or 60 Hz (the Americas, parts of Asia) and
 * its second harmonic. `off` leaves only the rumble filter, which every setting has.
 */
export const MIC_HUMS = ['off', '50', '60'] as const;
export type MicHum = (typeof MIC_HUMS)[number];
export const DEFAULT_MIC_HUM: MicHum = 'off';

export function isMicHum(v: unknown): v is MicHum {
  return v === 'off' || v === '50' || v === '60';
}

// ─── The whole setting ───────────────────────────────────────────────────────

/**
 * What the microphone chain is told. `auto` lets the level controller (`mic-auto.ts`) choose the gain
 * and the cutoff; off, `gain` and `gate` are used as set.
 */
export interface MicSettings {
  auto: boolean;
  gain: number;
  gate: number;
  hum: MicHum;
}

export const DEFAULT_MIC_AUTO = true;

export const DEFAULT_MIC_SETTINGS: MicSettings = {
  auto: DEFAULT_MIC_AUTO,
  gain: DEFAULT_MIC_GAIN,
  gate: DEFAULT_MIC_GATE,
  hum: DEFAULT_MIC_HUM,
};

/** A setting repaired field by field: anything missing or out of range becomes its default. */
export function normalizeMicSettings(s: Partial<Record<keyof MicSettings, unknown>>): MicSettings {
  return {
    auto: typeof s.auto === 'boolean' ? s.auto : DEFAULT_MIC_AUTO,
    gain: clampMicGain(s.gain),
    gate: clampMicGate(s.gate),
    hum: isMicHum(s.hum) ? s.hum : DEFAULT_MIC_HUM,
  };
}
