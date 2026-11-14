/**
 * When the microphone must not be believed. Pure: callers pass the times (the events' own
 * `performance.now()` clock) and make the timers, so every decision is a unit test.
 *
 * A lesson that plays sounds (a hint, the notes of the on-screen and computer keys) while the
 * microphone is the input cannot tell its own speaker from the learner: the microphone runs with
 * no echo cancellation, and a sound reaches it a moment after it starts. So mic notes are dropped
 * while the lesson is sounding something and for a short tail after (the room's echo).
 *
 * Dropping is not enough, though. The segmenter reports one `on` per note change, so a learner who
 * starts singing inside the window (along with the hint) and holds the note gets no later `on`.
 * The guard therefore remembers the last dropped `on` and hands it back ({@link EchoGuard.takeReplay})
 * once the window has closed and a moment more has passed ({@link REPLAY_CONFIRM_MS}), if no `off`
 * for that pitch arrived meanwhile: the note was still sounding after the lesson fell silent, so it
 * is the learner's, not an echo.
 */
import type { NoteEvent } from './events';

/** After a sound ends, how long the microphone may still hear its echo. */
export const ECHO_TAIL_MS = 400;
/**
 * A dropped note is replayed only this long after the window closes. An echo that rings on past
 * the tail ends (its `off` arrives) inside this time and is forgotten; a held, sung note does not.
 */
export const REPLAY_CONFIRM_MS = 250;

/** The part of a note event the guard reads. */
export type GuardNote =
  Pick<
    NoteEvent,
    | 'type'
    | 'midi'
    | 'time'
    | 'source'
    | 'cents'
  >;

export interface EchoGuard {
  /**
   * Feed it every note event. True: act on it now. False: a microphone `on` inside the window; it
   * is kept for {@link takeReplay}. Notes from the other sources are always true, and the on-screen
   * and computer keys' own notes (which the lesson sounds) open the window.
   */
  admit(
    e: GuardNote,
  ): boolean;
  /** A hint of `ms` starts sounding at `now`. */
  hint(
    now: number,
    ms: number,
  ): void;
  /** Every hint was released at `now`: only the tail is left of its window. */
  hintStopped(
    now: number,
  ): void;
  /** Forget the dropped note (a new target: it belonged to the last one). */
  forgetPending(): void;
  /**
   * Ms from `now` until a dropped note can be replayed, to arm a timer with; null when nothing is
   * waiting or a key is still held (its `off` re-opens the question).
   */
  waitMs(
    now: number,
  ):
    | number
    | null;
  /** The dropped note to treat as played now, once the window is closed and it is still held. */
  takeReplay(
    now: number,
  ): GuardNote | null;
}

export function createEchoGuard(opts: {
  tailMs?: number;
  confirmMs?: number;
  releaseMs: number;
}): EchoGuard {
  const tail =
    opts.tailMs ??
    ECHO_TAIL_MS;
  const confirm =
    opts.confirmMs ??
    REPLAY_CONFIRM_MS;
  let hintUntil = 0;
  let keysUntil = 0;
  // Keys the lesson is sounding right now, by source and pitch.
  const held =
    new Set<string>();
  let pending: GuardNote | null =
    null;

  const until =
    () =>
      Math.max(
        hintUntil,
        keysUntil,
      );
  const deaf =
    (
      time: number,
    ) =>
      held.size >
        0 ||
      time <
        until();

  return {
    admit(
      e,
    ) {
      if (
        e.source ===
          'screen' ||
        e.source ===
          'keys'
      ) {
        const key = `${e.source}:${e.midi}`;
        if (
          e.type ===
          'on'
        )
          held.add(
            key,
          );
        else {
          held.delete(
            key,
          );
          keysUntil =
            Math.max(
              keysUntil,
              e.time +
                opts.releaseMs +
                tail,
            );
        }
        return true;
      }
      if (
        e.source !==
        'mic'
      )
        return true;
      if (
        e.type ===
        'off'
      ) {
        if (
          pending &&
          pending.midi ===
            e.midi
        )
          pending =
            null;
        return true;
      }
      if (
        deaf(
          e.time,
        )
      ) {
        pending =
          {
            ...e,
          };
        return false;
      }
      pending =
        null;
      return true;
    },
    hint(
      now,
      ms,
    ) {
      hintUntil =
        Math.max(
          hintUntil,
          now +
            ms +
            tail,
        );
    },
    hintStopped(
      now,
    ) {
      hintUntil =
        Math.min(
          hintUntil,
          now +
            tail,
        );
    },
    forgetPending() {
      pending =
        null;
    },
    waitMs(
      now,
    ) {
      if (
        !pending ||
        held.size >
          0
      )
        return null;
      return Math.max(
        0,
        until() +
          confirm -
          now,
      );
    },
    takeReplay(
      now,
    ) {
      if (
        !pending ||
        held.size >
          0 ||
        now <
          until() +
            confirm
      )
        return null;
      const note =
        {
          ...pending,
          time: now,
        };
      pending =
        null;
      return note;
    },
  };
}

/**
 * Whether a Hear it that had to wait for the audio context should still sound: only for the target
 * it was asked for (the learner may have answered and moved on in the meantime), and not after the
 * lesson has gone. `-1` is "no target" (the session is over).
 */
export function hearStillWanted(s: {
  askedIndex: number;
  currentIndex: number;
  mounted: boolean;
}): boolean {
  return (
    s.mounted &&
    s.askedIndex >=
      0 &&
    s.askedIndex ===
      s.currentIndex
  );
}
