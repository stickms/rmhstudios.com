/**
 * Recipe data for Harmonic's synthesised sounds. Pure data: no Web Audio, no DOM, runs under Node.
 * A recipe is rendered to PCM by `dsp.ts` (deterministic, seeded) and handed to the browser by
 * `synth.ts`. Everything here is original synthesis — noise, oscillators, filters, modal bells.
 */

/** Envelope: [attack, hold, release] in seconds (smooth attack, exponential release). */
export type Env = readonly [attack: number, hold: number, release: number];

export interface FilterSpec {
  type: 'lp' | 'hp' | 'bp' | 'notch' | 'peak';
  freq: number;
  /** Exponential sweep target over the layer (Hz). */
  freqEnd?: number;
  q: number;
  /** `peak` only. */
  gainDb?: number;
}

export interface Lfo {
  /** Hz. */
  rate: number;
  /** 0..1 (amplitude) or fraction of frequency (pitch). */
  depth: number;
}

interface LayerBase {
  /** Start time within the recipe (s). */
  at: number;
  env: Env;
  /** Linear gain before the recipe is normalised. */
  gain: number;
  filters?: readonly FilterSpec[];
  tremolo?: Lfo;
}

export interface NoiseLayer extends LayerBase {
  kind: 'noise';
  color: 'white' | 'pink' | 'brown';
}

export interface ToneLayer extends LayerBase {
  kind: 'tone';
  wave: 'sine' | 'triangle' | 'saw' | 'square';
  freq: number;
  /** Exponential glide target (Hz) across the layer. */
  freqEnd?: number;
  /** Additive harmonic amplitudes (partial 1, 2, 3…); replaces `wave` when given. */
  partials?: readonly number[];
  /** Two-operator FM: modulator = freq × ratio, depth `index` (→ `indexEnd`). */
  fm?: { ratio: number; index: number; indexEnd?: number };
  vibrato?: Lfo;
}

export interface ModalLayer extends LayerBase {
  kind: 'modal';
  /** Damped partials; `decay` is the time to fall 60 dB. */
  modes: readonly { freq: number; decay: number; gain: number }[];
}

export interface FormantLayer extends LayerBase {
  kind: 'formant';
  f0: number;
  f0End?: number;
  /** Breath noise mixed under the glottal source, 0..1. */
  breath: number;
  formants: readonly { freq: number; q: number; gain: number }[];
  vibrato?: Lfo;
}

export type Layer = NoiseLayer | ToneLayer | ModalLayer | FormantLayer;

export interface Recipe {
  /** Seed for every random choice inside the render. */
  seed: number;
  /** Length in seconds. */
  duration: number;
  /** Render sample rate; low-frequency beds use less. */
  rate: number;
  channels: 1 | 2;
  layers: readonly Layer[];
  /** Peak of the rendered buffer (0..0.95): the renderer normalises to it. */
  peak: number;
  /** A seamless loop: the tail is crossfaded onto the head. */
  loop?: boolean;
}

export type SoundGroup = 'sfx' | 'voice' | 'music' | 'ambient' | 'ui';

export interface SoundDef {
  group: SoundGroup;
  /** How many variations (different seeds / parameter jitter). */
  variants: number;
  build(variant: number): Recipe;
  /** Playback gain (0..1) on top of the normalised buffer. */
  volume: number;
  /** Spatialised when a position is known. */
  positional: boolean;
  /** SNDLVL for the engine's distance curve (higher carries further). */
  soundlevel: number;
  /** Loops until stopped. */
  loop?: boolean;
}
