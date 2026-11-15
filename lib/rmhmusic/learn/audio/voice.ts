/**
 * The learner's own notes and every question the lessons play, made audible. One entry for every
 * pitched sound: callers say what to play (and, through `PlayOptions.instrument`, with which sound),
 * never how it sounds.
 *
 * A note is voiced by the sampled instrument (`instruments/engine.ts`) when that instrument is
 * loaded and reaches the note, and inside a lesson's sound session only once the session chose the
 * samples; otherwise by the synth below: one triangle-wave oscillator per note through a short gain
 * envelope. MIDI keyboards have their own sound and the mic is the learner's instrument, so callers
 * sound only `screen` / `keys` notes.
 *
 * Client-only: the shared context comes from `getAudioContext()` inside `playNote`, never at
 * module load, so SSR is safe. Without Web Audio (or while the context cannot run) a note is a
 * silent no-op.
 */
import { getAudioContext } from '@/lib/shared/platform';
import { midiToFreq } from '../pitch/notes';
import { INSTRUMENT_CATALOG } from './instruments/catalog';
import {
  currentSession,
  instrumentFor,
  onInstrumentChange,
} from './instruments/engine';
import type { InstrumentId } from './instruments/types';
import { resumeAudio } from './resume';

const ATTACK_S = 0.01;
const RELEASE_S = 0.25;
/**
 * How long a released SYNTH note keeps sounding (ms). A sampled instrument has its own release, so
 * code that needs the number for the sound actually in use asks {@link soundReleaseMs}.
 */
export const RELEASE_MS =
  RELEASE_S *
  1000;
/** Peak gain at full velocity; low enough that a six-note chord does not clip. */
const PEAK = 0.18;
/**
 * The most voices any sound keeps at once (the piano's 12); `useNoteSound` keeps its own
 * bookkeeping within it. The synth caps itself at {@link SYNTH_VOICES}.
 */
export const MAX_VOICES = 12;
/** Synth voices sounding at once; the oldest is released to make room. */
const SYNTH_VOICES = 6;

/**
 * How long a note of the sound `opts` names can keep sounding after release (ms): the longer of
 * the instrument's own release and the synth's, since a lesson's session may hand its notes to
 * either. The mic echo guard waits this out.
 */
export function soundReleaseMs(
  opts: PlayOptions = {},
): number {
  return opts.instrument
    ? Math.max(
        RELEASE_MS,
        INSTRUMENT_CATALOG[
          opts
            .instrument
        ]
          .releaseMs,
      )
    : RELEASE_MS;
}

interface Voice {
  release(): void;
}

/** How a note is voiced. */
export interface PlayOptions {
  /** 0..1. */
  velocity?: number;
  /** The sampled instrument to voice the note with; the synth when absent or not ready. */
  instrument?: InstrumentId;
  /** How many notes start together (a chord): each is trimmed by `1/sqrt(n)`. */
  chordOf?: number;
  /** Start this many seconds late (a strummed chord's later strings). */
  delayS?: number;
  /**
   * Called once when the note actually begins to sound, never if it is released first. Sequences
   * take their hold and gap timers, and "this has been heard", from this and never from the moment
   * of asking.
   */
  onStart?: () => void;
}

/**
 * Whether sound can be made now: `ready`; `asleep` (the audio context exists but is suspended
 * until a tap, or is still waking); `none` (no Web Audio, or the context is closed); `loading` (a
 * lesson's sound session is still waiting for its samples, at most `LOAD_WAIT_MS`).
 *
 * `failed` is part of the type for the lessons' rows, but the engine never reports it: samples that
 * fail hand the session to the synth, which is `ready`.
 */
export type SoundStatus =
  | 'ready'
  | 'asleep'
  | 'none'
  | 'loading'
  | 'failed';

export function soundStatus(): SoundStatus {
  const ctx =
    getAudioContext();
  if (
    !ctx ||
    ctx.state ===
      'closed'
  )
    return 'none';
  if (
    ctx.state !==
    'running'
  )
    return 'asleep';
  return currentSession()
    ?.choice
    .kind ===
    'pending'
    ? 'loading'
    : 'ready';
}

/**
 * Wake sound from a tap: true once it is ready, false if it cannot start (no Web Audio, closed, or
 * the context never resumed in time). Call inside the gesture.
 */
export async function wakeSound(): Promise<boolean> {
  const ctx =
    getAudioContext();
  if (
    !ctx
  )
    return false;
  return resumeAudio(
    ctx,
  );
}

/**
 * Run `fn` when sound becomes ready or asleep again, or a lesson's samples arrive or are given up
 * on; returns the unsubscribe.
 */
export function onSoundChange(
  fn: () => void,
): () => void {
  const off =
    onInstrumentChange(
      fn,
    );
  const ctx =
    getAudioContext();
  if (
    !ctx
  )
    return off;
  ctx.addEventListener(
    'statechange',
    fn,
  );
  return () => {
    off();
    ctx.removeEventListener(
      'statechange',
      fn,
    );
  };
}

const voices: Voice[] =
  [];
const noop =
  () => {};

/**
 * Start a note; returns a function that releases it (safe to call twice).
 * `velocity` (0..1) may be given alone or in `opts`.
 */
export function playNote(
  midi: number,
  opts:
    | number
    | PlayOptions = {},
): () => void {
  const o: PlayOptions =
    typeof opts ===
    'number'
      ? {
          velocity:
            opts,
        }
      : opts;
  const velocity =
    o.velocity ??
    0.8;
  const ctx =
    getAudioContext();
  if (
    !ctx ||
    !Number.isFinite(
      midi,
    )
  )
    return noop;
  // A context starts suspended until a user gesture; notes come from one.
  if (
    ctx.state ===
    'suspended'
  )
    void ctx
      .resume()
      .catch(
        () => {},
      );
  if (
    ctx.state ===
    'closed'
  )
    return noop;
  const delayS =
    Math.max(
      0,
      o.delayS ??
        0,
    );

  const inst =
    instrumentFor(
      o.instrument,
      midi,
    );
  if (
    inst
  ) {
    const handle =
      inst.play(
        midi,
        {
          velocity,
          chordOf:
            o.chordOf,
          when:
            ctx.currentTime +
            delayS,
        },
      );
    let released = false;
    let timer: ReturnType<
      typeof setTimeout
    > | null =
      null;
    // The sample starts on the audio clock at `when`: report it then, not before.
    if (
      o.onStart
    ) {
      if (
        delayS >
        0
      )
        timer =
          setTimeout(
            () => {
              timer =
                null;
              if (
                !released
              )
                o.onStart?.();
            },
            delayS *
              1000,
          );
      else
        o.onStart();
    }
    return () => {
      if (
        released
      )
        return;
      released = true;
      if (
        timer
      )
        clearTimeout(
          timer,
        );
      handle.stop();
    };
  }

  while (
    voices.length >=
    SYNTH_VOICES
  )
    voices[0].release();

  const now =
    ctx.currentTime +
    delayS;
  const osc =
    ctx.createOscillator();
  const gain =
    ctx.createGain();
  osc.type =
    'triangle';
  osc.frequency.value =
    midiToFreq(
      midi,
    );
  const chord =
    o.chordOf &&
    o.chordOf >
      1
      ? 1 /
        Math.sqrt(
          o.chordOf /
            3,
        )
      : 1;
  const peak =
    PEAK *
    Math.min(
      1,
      Math.max(
        0.05,
        velocity,
      ),
    ) *
    Math.min(
      1,
      chord,
    );
  gain.gain.setValueAtTime(
    0,
    now,
  );
  gain.gain.linearRampToValueAtTime(
    peak,
    now +
      ATTACK_S,
  );
  osc.connect(
    gain,
  );
  gain.connect(
    ctx.destination,
  );
  osc.start(
    now,
  );

  let released = false;
  let timer: ReturnType<
    typeof setTimeout
  > | null =
    null;
  const voice: Voice =
    {
      release() {
        if (
          released
        )
          return;
        released = true;
        if (
          timer
        )
          clearTimeout(
            timer,
          );
        const i =
          voices.indexOf(
            voice,
          );
        if (
          i >=
          0
        )
          voices.splice(
            i,
            1,
          );
        const t =
          Math.max(
            ctx.currentTime,
            now,
          );
        // Hold the current level, then fall exponentially-ish to silence.
        gain.gain.cancelScheduledValues(
          t,
        );
        gain.gain.setValueAtTime(
          t >
            ctx.currentTime
            ? 0
            : gain
                .gain
                .value,
          t,
        );
        gain.gain.setTargetAtTime(
          0,
          t,
          RELEASE_S /
            4,
        );
        osc.stop(
          t +
            RELEASE_S,
        );
        osc.onended =
          () => {
            osc.disconnect();
            gain.disconnect();
          };
      },
    };
  voices.push(
    voice,
  );
  if (
    o.onStart
  ) {
    if (
      delayS >
      0
    )
      timer =
        setTimeout(
          () => {
            timer =
              null;
            if (
              !released
            )
              o.onStart?.();
          },
          delayS *
            1000,
        );
    // The synth sounds as it is asked.
    else
      o.onStart();
  }
  return voice.release;
}
