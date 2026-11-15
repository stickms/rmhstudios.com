/**
 * The tuner as one explicit machine — pure, `{ initial, step }` like `machines/*.ts`:
 *
 *   silent → listening → locked(target, cents) → silent
 *
 * One event per microphone frame (the mic polls every {@link FRAME_MS}): the frequency YIN heard
 * (or null), its clarity and the frame's level. A frame counts only above a level floor
 * ({@link MIN_RMS}) and a clarity floor ({@link MIN_CLARITY}); anything else is a gap.
 *
 * The reading is the MEDIAN of the last {@link WINDOW} voiced frames, in fractional MIDI, so a
 * lone octave slip or a slight vibrato does not move it. The target is the nearest note
 * (`chromatic`) or the nearest string of standard tuning (`guitar`). It locks after
 * {@link LOCK_FRAMES} frames agree, and once locked it moves only when the reading is at least
 * {@link HYSTERESIS_ST} semitone nearer another target for {@link SWITCH_FRAMES} frames running
 * (in chromatic mode: 70 cents off the locked note), so the name never flickers between
 * neighbours. "In tune" means within ±{@link IN_TUNE_CENTS} cents for {@link IN_TUNE_HOLD_MS};
 * once in tune it stays so until {@link IN_TUNE_EXIT_CENTS} off. A gap of {@link HOLD_MS} goes
 * back to silent (a plucked string's decay holds the last reading meanwhile).
 *
 * A step that changes nothing returns the same state object, so a screen can skip work.
 */
import { freqToMidi } from '../pitch/notes';
import { STANDARD_TUNING } from '../theory/fretboard';
import type { Machine } from '../machines/runner';

/** The microphone's analysis period (`input/mic.ts` POLL_MS). */
export const FRAME_MS = 25;
/** Frames quieter than this RMS are gaps (the detector's own silence floor). */
export const MIN_RMS = 0.01;
/** Frames YIN is less sure of than this are gaps. */
export const MIN_CLARITY = 0.9;
/** Voiced frames the reading is the median of (~225 ms). */
export const WINDOW = 9;
/** Frames that must agree on a target before the tuner locks. */
export const LOCK_FRAMES = 3;
/** Frames running a nearer target must win before a locked tuner moves to it. */
export const SWITCH_FRAMES = 4;
/** How much nearer (semitones) another target must be before it can win. */
export const HYSTERESIS_ST = 0.4;
/** The in-tune band, in cents either side. */
export const IN_TUNE_CENTS = 5;
/** Once in tune, it stays so until this many cents off. */
export const IN_TUNE_EXIT_CENTS = 8;
/** How long a reading must sit in the band before it is called in tune. */
export const IN_TUNE_HOLD_MS = 300;
/** A gap this long returns to silent. */
export const HOLD_MS = 400;

export type TunerPreset =
  | 'chromatic'
  | 'guitar';

export interface TunerFrame {
  /** `performance.now()` of the frame. */
  time: number;
  /** The fundamental YIN heard, Hz; null for none. */
  freq:
    | number
    | null;
  /** YIN's confidence, 0..1. */
  clarity: number;
  /** The frame's level (RMS, 0..1). */
  rms: number;
}

export type TunerState =
  | {
      kind: 'silent';
      preset: TunerPreset;
    }
  | {
      kind: 'listening';
      preset: TunerPreset;
      recent: readonly number[];
      candidate: number;
      streak: number;
      lastVoiced: number;
    }
  | {
      kind: 'locked';
      preset: TunerPreset;
      recent: readonly number[];
      /** The note or string being tuned to (MIDI). */
      target: number;
      /** The reading's distance from `target` in cents; negative is flat. */
      cents: number;
      inTune: boolean;
      /** When the reading entered the in-tune band (null while outside it). */
      bandSince:
        | number
        | null;
      challenger:
        | number
        | null;
      challengerStreak: number;
      lastVoiced: number;
    };

export type TunerEvent =
  | {
      type: 'frame';
      frame: TunerFrame;
    }
  | {
      type: 'preset';
      preset: TunerPreset;
    }
  | {
      type: 'reset';
    };

/** What to tell the player: tune up (flat), tune down (sharp), hold (in the band, not yet held), in tune. */
export type TunerAdvice =
  | 'up'
  | 'down'
  | 'hold'
  | 'in-tune';

export function tunerInitial(
  preset: TunerPreset,
): TunerState {
  return {
    kind: 'silent',
    preset,
  };
}

/** The preset's fixed targets (MIDI), or null when every semitone is one. */
export function tunerTargets(
  preset: TunerPreset,
):
  | readonly number[]
  | null {
  return preset ===
    'guitar'
    ? STANDARD_TUNING
    : null;
}

function nearestTarget(
  preset: TunerPreset,
  midi: number,
): number {
  const targets =
    tunerTargets(
      preset,
    );
  if (
    !targets
  )
    return Math.round(
      midi,
    );
  let best =
    targets[0] ??
    Math.round(
      midi,
    );
  for (const t of targets)
    if (
      Math.abs(
        midi -
          t,
      ) <
      Math.abs(
        midi -
          best,
      )
    )
      best =
        t;
  return best;
}

function median(
  values: readonly number[],
): number {
  const sorted =
    [
      ...values,
    ].sort(
      (
        a,
        b,
      ) =>
        a -
        b,
    );
  const mid =
    sorted.length >>
    1;
  const hi =
    sorted[
      mid
    ] ??
    0;
  return sorted.length %
    2
    ? hi
    : ((sorted[
        mid -
          1
      ] ??
        hi) +
        hi) /
        2;
}

function isVoiced(
  f: TunerFrame,
): f is TunerFrame & {
  freq: number;
} {
  return (
    f.freq !==
      null &&
    Number.isFinite(
      f.freq,
    ) &&
    f.freq >
      0 &&
    f.clarity >=
      MIN_CLARITY &&
    f.rms >=
      MIN_RMS
  );
}

/** The in-tune flag and band entry time after a reading of `cents` at `time`. */
function tuneHold(
  inTune: boolean,
  bandSince:
    | number
    | null,
  cents: number,
  time: number,
): {
  inTune: boolean;
  bandSince:
    | number
    | null;
} {
  const size =
    Math.abs(
      cents,
    );
  if (
    inTune
  ) {
    if (
      size <=
      IN_TUNE_EXIT_CENTS
    )
      return {
        inTune: true,
        bandSince,
      };
    return {
      inTune: false,
      bandSince:
        null,
    };
  }
  if (
    size >
    IN_TUNE_CENTS
  )
    return {
      inTune: false,
      bandSince:
        null,
    };
  const since =
    bandSince ??
    time;
  return {
    inTune:
      time -
        since >=
      IN_TUNE_HOLD_MS,
    bandSince:
      since,
  };
}

function lockOn(
  preset: TunerPreset,
  recent: readonly number[],
  target: number,
  reading: number,
  time: number,
): TunerState {
  const cents =
    (reading -
      target) *
    100;
  const hold =
    tuneHold(
      false,
      null,
      cents,
      time,
    );
  return {
    kind: 'locked',
    preset,
    recent,
    target,
    cents,
    ...hold,
    challenger:
      null,
    challengerStreak: 0,
    lastVoiced:
      time,
  };
}

function onFrame(
  s: TunerState,
  f: TunerFrame,
): TunerState {
  if (
    !isVoiced(
      f,
    )
  ) {
    if (
      s.kind ===
      'silent'
    )
      return s;
    return f.time -
      s.lastVoiced >=
      HOLD_MS
      ? tunerInitial(
          s.preset,
        )
      : s;
  }
  const exact =
    freqToMidi(
      f.freq,
    );
  const recent =
    s.kind ===
    'silent'
      ? [
          exact,
        ]
      : [
          ...s.recent,
          exact,
        ].slice(
          -WINDOW,
        );
  const reading =
    median(
      recent,
    );
  const nearest =
    nearestTarget(
      s.preset,
      reading,
    );

  if (
    s.kind ===
      'silent' ||
    s.kind ===
      'listening'
  ) {
    // The candidate keeps its place unless another target is clearly nearer (the same margin as
    // a locked target), so a reading on a boundary still locks instead of trading places.
    const keep =
      s.kind ===
        'listening' &&
      Math.abs(
        reading -
          s.candidate,
      ) -
        Math.abs(
          reading -
            nearest,
        ) <
        HYSTERESIS_ST;
    const candidate =
      keep
        ? s.candidate
        : nearest;
    const streak =
      keep
        ? s.streak +
          1
        : 1;
    if (
      streak >=
      LOCK_FRAMES
    )
      return lockOn(
        s.preset,
        recent,
        candidate,
        reading,
        f.time,
      );
    return {
      kind: 'listening',
      preset:
        s.preset,
      recent,
      candidate,
      streak,
      lastVoiced:
        f.time,
    };
  }

  // Locked: another target wins only by a margin, for several frames running.
  const margin =
    Math.abs(
      reading -
        s.target,
    ) -
    Math.abs(
      reading -
        nearest,
    );
  if (
    nearest !==
      s.target &&
    margin >=
      HYSTERESIS_ST
  ) {
    const challengerStreak =
      s.challenger ===
      nearest
        ? s.challengerStreak +
          1
        : 1;
    if (
      challengerStreak >=
      SWITCH_FRAMES
    )
      return lockOn(
        s.preset,
        recent,
        nearest,
        reading,
        f.time,
      );
    const cents =
      (reading -
        s.target) *
      100;
    return {
      ...s,
      recent,
      cents,
      ...tuneHold(
        s.inTune,
        s.bandSince,
        cents,
        f.time,
      ),
      challenger:
        nearest,
      challengerStreak,
      lastVoiced:
        f.time,
    };
  }
  const cents =
    (reading -
      s.target) *
    100;
  return {
    ...s,
    recent,
    cents,
    ...tuneHold(
      s.inTune,
      s.bandSince,
      cents,
      f.time,
    ),
    challenger:
      null,
    challengerStreak: 0,
    lastVoiced:
      f.time,
  };
}

export function tunerStep(
  s: TunerState,
  e: TunerEvent,
): TunerState {
  switch (
    e.type
  ) {
    case 'frame':
      return onFrame(
        s,
        e.frame,
      );
    case 'preset':
      return tunerInitial(
        e.preset,
      );
    case 'reset':
      return s.kind ===
        'silent'
        ? s
        : tunerInitial(
            s.preset,
          );
  }
}

/** The advice for a locked reading (null while silent or listening). */
export function adviceOf(
  s: TunerState,
): TunerAdvice | null {
  if (
    s.kind !==
    'locked'
  )
    return null;
  if (
    s.inTune
  )
    return 'in-tune';
  if (
    s.cents <
    -IN_TUNE_CENTS
  )
    return 'up';
  if (
    s.cents >
    IN_TUNE_CENTS
  )
    return 'down';
  return 'hold';
}

/** The tuner in the shape `createRunner` takes; it has no effects. */
export function createTunerMachine(
  preset: TunerPreset,
): Machine<
  TunerState,
  TunerEvent,
  never
> {
  return {
    initial:
      tunerInitial(
        preset,
      ),
    step: (
      state,
      event,
    ) => ({
      state:
        tunerStep(
          state,
          event,
        ),
      effects:
        [],
    }),
  };
}
