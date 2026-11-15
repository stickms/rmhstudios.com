/**
 * Shared types for the sampled instruments (piano, steel-string guitar, violin, flute). Pure and
 * client-safe; nothing here touches Web Audio. See docs/superpowers/plans/2026-11-09-rmhmusic-instrument-sounds.md.
 */
import type { LoadState } from './load-machine';

/**
 * Extensible: a new instrument is a new id, a catalog entry, a `sources.json` entry, generated
 * zones and files. `'guitar'` means the steel-string acoustic; the zod enum for the learner's
 * `sound` is built from this list.
 */
export const INSTRUMENT_IDS =
  [
    'piano',
    'guitar',
    'violin',
    'flute',
  ] as const;
export type InstrumentId =
  (typeof INSTRUMENT_IDS)[number];

/** How many notes an instrument can sound at once, which decides what it may be asked to play. */
export type Polyphony =
  | 'chord'
  | 'double-stop'
  | 'mono';

/** One credit paragraph per sample source (see `credits.ts`). */
export type CreditId =
  | 'salamander'
  | 'ella-gitauru'
  | 'vsco';

export interface InstrumentMeta {
  id: InstrumentId;
  /** i18n key in `c-rmhmusic` for the instrument's name. */
  labelKey: string;
  /** The SOUNDING MIDI range lessons may ask this instrument for. */
  range: readonly [
    low: number,
    high: number,
  ];
  polyphony: Polyphony;
  /** Voices sounding at once before the oldest is stolen; 1 means monophonic (legato handover). */
  maxVoices: number;
  /** Audible time after `stop()` (ms): a gain ramp we apply, which the mic echo guard waits out. */
  releaseMs: number;
  /** Ms between the strings of a chord strum; 0 is a block chord. */
  strumMs: number;
  /** Trim into the master chain (linear). */
  busGain: number;
  /** The most a recorded zone may be pitch-shifted to reach a note (semitones). */
  maxShift: number;
  /** A one-pole low-pass that darkens soft notes (the piano). */
  softLowpass: boolean;
  credit: CreditId;
}

/** One recorded sample and where it sits on the keyboard. */
export interface Zone {
  /** File name under `public/music/rmhmusic/instruments/<id>/`. */
  file: string;
  /** The MIDI note the recording sounds at, as measured at build time. */
  keyCenter: number;
  /** Cents added to the playback pitch so the note lands exactly in tune (usually small). */
  tuneCents: number;
  /** Loudness trim in dB, so zones differ by under 1 dB. */
  gainDb: number;
  /** Where in the file the note begins (s); the build trims pre-roll, so usually 0. */
  startOffsetS: number;
  /** Length of the encoded sample (s). */
  durationS: number;
  /** SHA-256 of the committed file. */
  sha256?: string;
}

export type ZoneMap =
  readonly Zone[];

export interface PlayOpts {
  /** 0..1. */
  velocity?: number;
  /** AudioContext time (s); default now. */
  when?: number;
  /** Seconds before an automatic release; default until `stop()`. */
  duration?: number;
  /** How many voices start together (a chord); each is trimmed by `1/sqrt(n)`. */
  chordOf?: number;
}

export interface NoteHandle {
  /** Release (idempotent). `when` is an AudioContext time (s). */
  stop(
    when?: number,
  ): void;
  /** Resolves when the note is silent and its nodes are disconnected. */
  readonly done: Promise<void>;
}

export interface Instrument extends InstrumentMeta {
  readonly state: LoadState;
  /** Single-flight; resolves with the state it settles in. */
  load(opts?: {
    user?: boolean;
  }): Promise<LoadState>;
  /** Inside the range and covered by a loaded zone. */
  canPlay(
    midi: number,
  ): boolean;
  /** A silent no-op handle when the instrument is not ready or cannot play `midi`. */
  play(
    midi: number,
    opts?: PlayOpts,
  ): NoteHandle;
  stopAll(): void;
  /** Free decoded buffers; state goes back to idle. */
  dispose(): void;
  /** Run `fn` whenever `state` changes; returns the unsubscribe. */
  subscribe(
    fn: () => void,
  ): () => void;
}
