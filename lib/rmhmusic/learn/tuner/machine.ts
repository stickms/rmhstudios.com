/**
 * The tuner as one explicit machine — pure, `{ initial, step }` like `machines/*.ts`:
 *
 *   silent → listening → locked(target, cents) → silent;  any → muted (its own reference tone)
 *
 * One event per microphone frame (the mic polls every {@link FRAME_MS}): the frequency YIN heard
 * (or null), its clarity and the frame's level. A frame counts only above a level floor
 * ({@link MIN_RMS}) and a clarity floor ({@link MIN_CLARITY}); anything else is a gap. A frame
 * whose time is not finite is ignored outright.
 *
 * The reading is the LOWER median of the last {@link WINDOW} voiced frames, in fractional MIDI —
 * always a value that was heard, so an even window never averages two notes into a third — and a
 * lone octave slip or a slight vibrato does not move it.
 *
 * Targets. `chromatic`: the nearest semitone. `guitar`: the six strings of standard tuning, each
 * compared with the reading FOLDED by octaves onto it (an E3 or E4 heard while tuning the low E —
 * its 12th fret, or an octave slip of the detector — is the low E, and its cents are the folded
 * ones); on a tie (E2 / E4) the string nearer in absolute pitch, then the lower one. More than
 * {@link FAR_CENTS} from every string (after folding) the reading is `far`: the screen names the
 * note actually heard ({@link shownNote}) and gives no direction; it stays far until within
 * {@link FAR_EXIT_CENTS}.
 *
 * It locks after {@link LOCK_FRAMES} frames agree; a target changes only when the reading is at
 * least {@link HYSTERESIS_ST} semitone nearer another — and, once locked, for {@link SWITCH_FRAMES}
 * frames running — so the name never flickers between neighbours. Advice has hysteresis too:
 * "hold" (in the ±{@link IN_TUNE_CENTS} band, not yet held) or "in tune" (held
 * {@link IN_TUNE_HOLD_MS}) is entered at {@link IN_TUNE_CENTS} and left only past
 * {@link IN_TUNE_EXIT_CENTS}, so "Almost" and "Tune up" never trade places at the edge. A gap of
 * {@link HOLD_MS} returns to silent (a plucked string's decay holds the last reading meanwhile).
 *
 * `reference` (the screen played a reference tone ending at `end`): the microphone, which runs
 * with no echo cancellation, would hear the speaker, so frames are ignored until `end` +
 * `ECHO_TAIL_MS`, and the reading then starts from nothing.
 *
 * A step that changes nothing returns the same state object, so a screen can skip work.
 */
import { ECHO_TAIL_MS } from '../input/echo-window';
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
/** Once in the band ("hold" or "in tune"), it is left only this many cents off. */
export const IN_TUNE_EXIT_CENTS = 8;
/** How long a reading must sit in the band before it is called in tune. */
export const IN_TUNE_HOLD_MS = 300;
/** A gap this long returns to silent. */
export const HOLD_MS = 400;
/** Guitar: further than this (cents, folded) from every string is "not near a string". */
export const FAR_CENTS = 100;
/** Guitar: once far, it is near a string again only this close. */
export const FAR_EXIT_CENTS = 90;

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

/** What to tell the player: tune up, tune down, hold (in the band, not yet held), in tune, or far. */
export type TunerAdvice =
  | 'up'
  | 'down'
  | 'hold'
  | 'in-tune'
  | 'far';

export type TunerState =
  | {
      kind: 'silent';
      preset: TunerPreset;
    }
  | {
      kind: 'muted';
      preset: TunerPreset;
      until: number;
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
      /** The reading's distance from `target` in cents (folded onto a string); negative is flat. */
      cents: number;
      /** The nearest semitone to the reading itself (what was actually heard). */
      heard: number;
      inTune: boolean;
      /** When the reading entered the in-tune band (null while outside it). */
      bandSince:
        | number
        | null;
      advice: TunerAdvice;
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
  /** A reference tone is sounding until `end` (its release included), on the frames' clock. */
  | {
      type: 'reference';
      end: number;
    }
  | {
      type: 'reset';
    };

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

/** `reading` − `target` in semitones, folded by octaves into −6…6 for a string. */
function offset(
  preset: TunerPreset,
  reading: number,
  target: number,
): number {
  const d =
    reading -
    target;
  return preset ===
    'guitar'
    ? d -
        12 *
          Math.round(
            d /
              12,
          )
    : d;
}

function nearestTarget(
  preset: TunerPreset,
  reading: number,
): number {
  const targets =
    tunerTargets(
      preset,
    );
  if (
    !targets
  )
    return Math.round(
      reading,
    );
  let best =
    targets[0] ??
    Math.round(
      reading,
    );
  for (const t of targets) {
    const a =
      Math.abs(
        offset(
          preset,
          reading,
          t,
        ),
      );
    const b =
      Math.abs(
        offset(
          preset,
          reading,
          best,
        ),
      );
    if (
      a <
        b -
          1e-9 ||
      (Math.abs(
        a -
          b,
      ) <=
        1e-9 &&
        Math.abs(
          reading -
            t,
        ) <
          Math.abs(
            reading -
              best,
          ))
    )
      best =
        t;
  }
  return best;
}

/** The lower median: always one of the values (never the mean of two). */
function lowerMedian(
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
  return (
    sorted[
      (sorted.length -
        1) >>
        1
    ] ??
    0
  );
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

interface Judged {
  inTune: boolean;
  bandSince:
    | number
    | null;
  advice: TunerAdvice;
}

/** In tune, the band and the advice after a reading of `cents` at `time`, with hysteresis. */
function judge(
  preset: TunerPreset,
  prev: Judged | null,
  cents: number,
  time: number,
): Judged {
  const size =
    Math.abs(
      cents,
    );
  const wasFar =
    prev?.advice ===
    'far';
  if (
    preset ===
      'guitar' &&
    (wasFar
      ? size >
        FAR_EXIT_CENTS
      : size >
        FAR_CENTS)
  )
    return {
      inTune: false,
      bandSince:
        null,
      advice:
        'far',
    };
  const wasInBand =
    prev?.advice ===
      'hold' ||
    prev?.advice ===
      'in-tune';
  const inBand =
    wasInBand
      ? size <=
        IN_TUNE_EXIT_CENTS
      : size <=
        IN_TUNE_CENTS;
  if (
    !inBand
  )
    return {
      inTune: false,
      bandSince:
        null,
      advice:
        cents <
        0
          ? 'up'
          : 'down',
    };
  if (
    prev?.inTune
  )
    return {
      inTune: true,
      bandSince:
        prev.bandSince,
      advice:
        'in-tune',
    };
  // Held long enough only counts time spent inside the narrow band.
  const since =
    size <=
    IN_TUNE_CENTS
      ? (prev?.bandSince ??
        time)
      : (prev?.bandSince ??
        null);
  const inTune =
    since !==
      null &&
    time -
      since >=
      IN_TUNE_HOLD_MS;
  return {
    inTune,
    bandSince:
      since,
    advice:
      inTune
        ? 'in-tune'
        : 'hold',
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
    offset(
      preset,
      reading,
      target,
    ) *
    100;
  return {
    kind: 'locked',
    preset,
    recent,
    target,
    cents,
    heard:
      Math.round(
        reading,
      ),
    ...judge(
      preset,
      null,
      cents,
      time,
    ),
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
    !Number.isFinite(
      f.time,
    )
  )
    return s;
  if (
    s.kind ===
    'muted'
  ) {
    if (
      f.time <
      s.until
    )
      return s;
    return onFrame(
      tunerInitial(
        s.preset,
      ),
      f,
    );
  }
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
    lowerMedian(
      recent,
    );
  const nearest =
    nearestTarget(
      s.preset,
      reading,
    );
  const dist =
    (
      t: number,
    ) =>
      Math.abs(
        offset(
          s.preset,
          reading,
          t,
        ),
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
      dist(
        s.candidate,
      ) -
        dist(
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
  let challenger:
    | number
    | null =
    null;
  let challengerStreak = 0;
  if (
    nearest !==
      s.target &&
    dist(
      s.target,
    ) -
      dist(
        nearest,
      ) >=
      HYSTERESIS_ST
  ) {
    challenger =
      nearest;
    challengerStreak =
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
  }
  const cents =
    offset(
      s.preset,
      reading,
      s.target,
    ) *
    100;
  return {
    ...s,
    recent,
    cents,
    heard:
      Math.round(
        reading,
      ),
    ...judge(
      s.preset,
      s,
      cents,
      f.time,
    ),
    challenger,
    challengerStreak,
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
      return s.kind ===
        'muted'
        ? {
            ...s,
            preset:
              e.preset,
          }
        : tunerInitial(
            e.preset,
          );
    case 'reference': {
      const until =
        e.end +
        ECHO_TAIL_MS;
      if (
        s.kind ===
          'muted' &&
        s.until >=
          until
      )
        return s;
      return {
        kind: 'muted',
        preset:
          s.preset,
        until,
      };
    }
    case 'reset':
      return s.kind ===
        'silent'
        ? s
        : tunerInitial(
            s.preset,
          );
  }
}

/** The advice for a locked reading (null otherwise). */
export function adviceOf(
  s: TunerState,
): TunerAdvice | null {
  return s.kind ===
    'locked'
    ? s.advice
    : null;
}

/** The note to name on screen: the target, or what was heard when it is far from every string. */
export function shownNote(
  s: TunerState,
):
  | number
  | null {
  if (
    s.kind !==
    'locked'
  )
    return null;
  return s.advice ===
    'far'
    ? s.heard
    : s.target;
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
