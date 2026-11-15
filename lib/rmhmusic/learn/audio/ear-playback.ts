/**
 * The ear lessons' decisions about sound, apart from React so they can be tested: which sentence
 * the sound row shows, what a tap on it does, when a question plays by itself, and the one object
 * that carries out a question's sound and tells the lesson when it has been HEARD. Pure (the
 * sound itself is handed in); client-safe.
 *
 * "Heard" means every note of the question has started (`PlayingSequence`'s `onAllStarted`): an
 * interval's second note sounds a gap after its first, so the first note alone is not enough. The
 * lesson answers `played` to the machine only then, and only for the sound that is still current:
 * a sequence that was cancelled, replaced, or left behind by Next, Retry or a dialog reports
 * nothing even if its last note was already on the way.
 */
import type { EarKind } from '../machines/ear';
import type { PlayingSequence } from './sequence';
import type { SoundStatus } from './voice';

/** What the sound row shows. */
export type SoundRow =
  | 'ready'
  | 'asleep'
  | 'waking'
  | 'failed'
  | 'loading'
  | 'none';

/** A tap on the row that is waiting for the browser to wake sound. */
export type Waking =
  | 'idle'
  | 'waking'
  | 'failed';

/**
 * The row for the audio's status and the state of a tap that tried to wake it. `loading` (a
 * sampled instrument's samples are on the way) and `failed` come from the sound engine; the synth
 * is never either.
 */
export function soundRowOf(
  status: SoundStatus,
  waking: Waking,
): SoundRow {
  switch (
    status
  ) {
    case 'ready':
    case 'none':
    case 'loading':
    case 'failed':
      return status;
    case 'asleep':
      return waking ===
        'idle'
        ? 'asleep'
        : waking;
  }
}

/** What a tap on "Hear it again" / the sound problem does. */
export type HearAction =
  /** A dialog is open over the lesson: sound stops, nothing starts. */
  | 'stop'
  /** A tap is already waiting. */
  | 'ignore'
  | 'none'
  | 'replay'
  /** Samples are loading: nothing to do but wait; the lesson plays when they are ready. */
  | 'wait'
  | 'wake';

export function hearAction({
  status,
  waiting,
  paused,
}: {
  status: SoundStatus;
  waiting: boolean;
  paused: boolean;
}): HearAction {
  if (
    paused
  )
    return 'stop';
  if (
    waiting
  )
    return 'ignore';
  switch (
    status
  ) {
    case 'none':
      return 'none';
    case 'ready':
      return 'replay';
    case 'loading':
      return 'wait';
    case 'asleep':
    case 'failed':
      return 'wake';
  }
}

/**
 * Whether the question on screen plays by itself now. `sentFor` is the question index it already
 * played for (so React's StrictMode, which runs an effect twice, plays once); it is forgotten
 * whenever the conditions lapse (a dialog opens, sound goes to sleep), so a question that was cut
 * off plays again when they return.
 */
export function autoPlay({
  askingUnheard,
  paused,
  shown,
  live,
  index,
  sentFor,
}: {
  askingUnheard: boolean;
  paused: boolean;
  /** The sound row's last known status. */
  shown: SoundStatus;
  /** The audio's status right now. */
  live: SoundStatus;
  index: number;
  sentFor:
    | number
    | null;
}): {
  play: boolean;
  sentFor:
    | number
    | null;
} {
  if (
    !askingUnheard ||
    paused ||
    shown !==
      'ready' ||
    live !==
      'ready'
  ) {
    return {
      play: false,
      sentFor:
        null,
    };
  }
  if (
    sentFor ===
    index
  )
    return {
      play: false,
      sentFor,
    };
  return {
    play: true,
    sentFor:
      index,
  };
}

export interface EarPlayback {
  /**
   * Sound question `index` (cancelling the one before). Returns whether it started at all (false:
   * sound is not ready; nothing will be heard). `onHeard(index)` follows once every note has
   * started, unless this sound is cancelled or replaced first.
   */
  start(
    index: number,
    kind: EarKind,
    notes: readonly number[],
  ): boolean;
  /** Stop the current sound and make sure it never reports. Safe to call twice. */
  cancel(): void;
}

export function createEarPlayback({
  play,
  onHeard,
}: {
  /** Carries the sound out; `onAllStarted` is `PlayingSequence`'s. */
  play: (
    kind: EarKind,
    notes: readonly number[],
    hooks: {
      onAllStarted: () => void;
    },
  ) => PlayingSequence;
  onHeard: (
    index: number,
  ) => void;
}): EarPlayback {
  let current: PlayingSequence | null =
    null;
  /** Bumped by every start and cancel: a report from an older one is stale. */
  let token = 0;
  return {
    start(
      index,
      kind,
      notes,
    ) {
      current?.cancel();
      current =
        null;
      const mine =
        ++token;
      const seq =
        play(
          kind,
          notes,
          {
            onAllStarted:
              () => {
                if (
                  mine ===
                  token
                )
                  onHeard(
                    index,
                  );
              },
          },
        );
      // A chord reports during the call, before `seq` is back; that is still this sound.
      if (
        mine ===
        token
      )
        current =
          seq;
      return seq.started;
    },
    cancel() {
      token++;
      current?.cancel();
      current =
        null;
    },
  };
}
