/**
 * On-screen keys: the piano/fretboard UI calls `press` and `release`, and the
 * adapter turns that into note events. There is nothing to open, so `start()`
 * is a no-op; whether anyone hears the events is the hub's business (it only
 * forwards started sources). Client-safe and touches no browser API but the
 * clock, read inside functions.
 */
import type {
  InputAdapter,
  NoteEvent,
  NoteListener,
} from './events';

const DEFAULT_VELOCITY = 0.8;

export function createScreenInput(): InputAdapter & {
  press(
    midi: number,
    velocity?: number,
  ): void;
  release(
    midi: number,
  ): void;
} {
  const listeners =
    new Set<NoteListener>();
  const emit =
    (
      e: NoteEvent,
    ) => {
      for (const l of [
        ...listeners,
      ])
        l(
          e,
        );
    };
  /** Notes currently down: ignores duplicate presses, lets stop() release all. */
  const held =
    new Set<number>();

  const release =
    (
      midi: number,
    ) => {
      if (
        !held.delete(
          midi,
        )
      )
        return;
      emit(
        {
          type: 'off',
          midi,
          velocity: 0,
          time: performance.now(),
          source:
            'screen',
        },
      );
    };

  return {
    source:
      'screen',

    async start() {},

    stop() {
      for (const midi of [
        ...held,
      ])
        release(
          midi,
        );
    },

    subscribe(
      l,
    ) {
      listeners.add(
        l,
      );
      return () => {
        listeners.delete(
          l,
        );
      };
    },

    press(
      midi,
      velocity = DEFAULT_VELOCITY,
    ) {
      if (
        held.has(
          midi,
        )
      )
        return;
      held.add(
        midi,
      );
      emit(
        {
          type: 'on',
          midi,
          velocity:
            Math.min(
              1,
              Math.max(
                0,
                velocity,
              ),
            ),
          time: performance.now(),
          source:
            'screen',
        },
      );
    },

    release,
  };
}
