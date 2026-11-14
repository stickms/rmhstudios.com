/**
 * Who is holding which on-screen piano key. Several pointers (fingers) and
 * keyboard focus (Space/Enter) can hold notes at once, a held pointer slides
 * from key to key (a glissando), and a note sounds while anyone holds it.
 *
 * It replaces three structures the component kept in step by hand (a
 * pointer→note map, a set of pressed pointers, a set of focus-held notes, plus
 * a holder count recomputed from them), and fixes two quirks of that
 * bookkeeping (review finding g): any keyup on a focused key released a note
 * held with Space/Enter, and a mouse dragged off the keyboard, released
 * outside and later dragged back on with the button down sounded a note.
 *
 * The effects are the difference in held notes between two states: `press`
 * for a note that gained its first holder, `release` for one that lost its
 * last. Pure.
 */

export interface State {
  /** pointerId → the note that pointer is holding. */
  pointers: Readonly<
    Record<
      number,
      number
    >
  >;
  /** Pointers pressed on the keyboard and not yet lifted or gone off it (they may slide onto keys). */
  down: readonly number[];
  /** Notes held by keyboard focus. */
  focus: readonly number[];
}

export type Event =
  /** A pointer pressed on a key (`primary`: not a right/middle mouse button). */
  | {
      type: 'pointer-down';
      pointer: number;
      midi: number;
      primary: boolean;
    }
  /** A pointer entered a key; `pressed` is whether its primary button is down. */
  | {
      type: 'pointer-enter';
      pointer: number;
      midi: number;
      pressed: boolean;
    }
  /** A pointer went up, was cancelled or left a key. */
  | {
      type: 'pointer-off';
      pointer: number;
      midi: number;
    }
  /** A pointer went up or was cancelled anywhere on the keyboard. */
  | {
      type: 'pointer-lift';
      pointer: number;
    }
  /** A pointer left the keyboard: it no longer slides back onto it. */
  | {
      type: 'pointer-exit';
      pointer: number;
    }
  | {
      type: 'key-down';
      midi: number;
      key: string;
      repeat: boolean;
    }
  | {
      type: 'key-up';
      midi: number;
      key: string;
    }
  | {
      type: 'blur';
      midi: number;
    }
  /** The keyboard went away: let go of everything. */
  | {
      type: 'release-all';
    };

export type Effect =
  | {
      type: 'press';
      midi: number;
    }
  | {
      type: 'release';
      midi: number;
    };

export const initial: State =
  {
    pointers:
      {},
    down: [],
    focus:
      [],
  };

const PLAY_KEYS =
  new Set(
    [
      ' ',
      'Enter',
    ],
  );

/** Every note held by anyone. */
export function held(
  s: State,
): Set<number> {
  const out =
    new Set<number>(
      s.focus,
    );
  for (const midi of Object.values(
    s.pointers,
  ))
    out.add(
      midi,
    );
  return out;
}

function withPointer(
  s: State,
  pointer: number,
  midi:
    | number
    | null,
): State {
  const pointers =
    {
      ...s.pointers,
    };
  if (
    midi ===
    null
  )
    delete pointers[
      pointer
    ];
  else
    pointers[
      pointer
    ] =
      midi;
  return {
    ...s,
    pointers,
  };
}

function next(
  s: State,
  e: Event,
): State {
  switch (
    e.type
  ) {
    case 'pointer-down':
      if (
        !e.primary
      )
        return s;
      return {
        ...withPointer(
          s,
          e.pointer,
          e.midi,
        ),
        down: s.down.includes(
          e.pointer,
        )
          ? s.down
          : [
              ...s.down,
              e.pointer,
            ],
      };
    case 'pointer-enter':
      // A glissando: only a pointer pressed on the keyboard, and still pressed, plays.
      if (
        !e.pressed ||
        !s.down.includes(
          e.pointer,
        ) ||
        s
          .pointers[
          e
            .pointer
        ] ===
          e.midi
      )
        return s;
      return withPointer(
        s,
        e.pointer,
        e.midi,
      );
    case 'pointer-off':
      return s
        .pointers[
        e
          .pointer
      ] ===
        e.midi
        ? withPointer(
            s,
            e.pointer,
            null,
          )
        : s;
    case 'pointer-lift':
    case 'pointer-exit':
      return s.down.includes(
        e.pointer,
      )
        ? {
            ...s,
            down: s.down.filter(
              (
                p,
              ) =>
                p !==
                e.pointer,
            ),
          }
        : s;
    case 'key-down':
      if (
        !PLAY_KEYS.has(
          e.key,
        ) ||
        e.repeat ||
        s.focus.includes(
          e.midi,
        )
      )
        return s;
      return {
        ...s,
        focus:
          [
            ...s.focus,
            e.midi,
          ],
      };
    case 'key-up':
      // Only the keys that press a note release it: a stray keyup must not let go of a held one.
      if (
        !PLAY_KEYS.has(
          e.key,
        )
      )
        return s;
      return s.focus.includes(
        e.midi,
      )
        ? {
            ...s,
            focus:
              s.focus.filter(
                (
                  m,
                ) =>
                  m !==
                  e.midi,
              ),
          }
        : s;
    case 'blur':
      return s.focus.includes(
        e.midi,
      )
        ? {
            ...s,
            focus:
              s.focus.filter(
                (
                  m,
                ) =>
                  m !==
                  e.midi,
              ),
          }
        : s;
    case 'release-all':
      return initial;
    default:
      return unreachable(
        e,
      );
  }
}

export function step(
  s: State,
  e: Event,
): {
  state: State;
  effects: Effect[];
} {
  const state =
    next(
      s,
      e,
    );
  if (
    state ===
    s
  )
    return {
      state,
      effects:
        [],
    };
  const before =
    held(
      s,
    );
  const after =
    held(
      state,
    );
  const effects: Effect[] =
    [];
  for (const midi of before)
    if (
      !after.has(
        midi,
      )
    )
      effects.push(
        {
          type: 'release',
          midi,
        },
      );
  for (const midi of after)
    if (
      !before.has(
        midi,
      )
    )
      effects.push(
        {
          type: 'press',
          midi,
        },
      );
  return {
    state,
    effects,
  };
}

export function transition(
  s: State,
  e: Event,
): State {
  return step(
    s,
    e,
  )
    .state;
}

export function effects(
  prev: State,
  _next: State,
  e: Event,
): Effect[] {
  return step(
    prev,
    e,
  )
    .effects;
}

export const keyHoldsMachine =
  {
    initial,
    step,
  };

function unreachable(
  x: never,
): never {
  throw new Error(
    `key-holds: unhandled ${JSON.stringify(x)}`,
  );
}
