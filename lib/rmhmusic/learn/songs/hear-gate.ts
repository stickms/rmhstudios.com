/**
 * Which notes a song screen takes while, and just after, "Hear it" plays a phrase through the
 * speaker — pure. While the phrase sounds nothing is taken (the learner listens). After it ends,
 * or once it is cancelled, the computer keys, the on-screen keys and a MIDI keyboard are taken at
 * once (they cannot hear the speaker); the microphone waits `ECHO_TAIL_MS` more, so the phrase's
 * own ringing is not read as the learner's note. Start waits as long as the learner's input does.
 */
import { ECHO_TAIL_MS } from '../input/echo-window';
import type { InputSource } from '../input/events';

export interface Hearing {
  /** When the phrase started (ms, the note events' clock). */
  startedAt: number;
  /** When it ends on its own. */
  endsAt: number;
  /** When it was cancelled, if it was. */
  cancelledAt:
    | number
    | null;
}

/** Until when notes from `source` are held back (−Infinity: never). */
export function inputBlockedUntil(
  h: Hearing | null,
  source: InputSource,
): number {
  if (
    !h
  )
    return -Infinity;
  const end =
    h.cancelledAt ===
    null
      ? h.endsAt
      : Math.min(
          h.cancelledAt,
          h.endsAt,
        );
  return source ===
    'mic'
    ? end +
        ECHO_TAIL_MS
    : end;
}

export function takesNote(
  h: Hearing | null,
  note: {
    time: number;
    source: InputSource;
  },
): boolean {
  if (
    !h ||
    note.time <
      h.startedAt
  )
    return true;
  return (
    note.time >=
    inputBlockedUntil(
      h,
      note.source,
    )
  );
}
