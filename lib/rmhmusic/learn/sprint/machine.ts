/**
 * The sight reading game ("Sprint") as one explicit machine — pure, `{ initial, step }` like
 * `machines/session.ts`:
 *
 *   ready → countdown (three quiet beats) → asking ⇄ feedback → complete | saving → saved |
 *   failed (Retry) | signed-out
 *
 * Timing. Every time is the note event's own `time` (the hub's `performance.now()` clock, MIDI's
 * `timeStamp`), never a clock read in a handler, so UI latency never pollutes a score. A prompt is
 * timed from `shown` (the frame it was drawn) to the note that completes the answer. A prompt
 * cannot be answered before it is drawn: until `shown` every note is ignored, and so is any note
 * timed before it (an event queued from the previous prompt). Note-offs never answer, so a key
 * held from the previous prompt answers nothing; a key must be struck again.
 *
 * Answers. One note (or an accidental): the first note struck, right on the exact sounding
 * pitch. A chord: the notes struck after the drawing collect in a window of `CHORD_WINDOW_MS` from
 * the first (the same window as `input/chord-window.ts`, without its carried-over held keys —
 * here a key from the previous prompt must be struck again); right the moment the collected pitch
 * classes are exactly the chord's (any octave or inversion), timed to that note. When the window
 * closes (`close` from the screen's timer, or a later note) three or more pitch classes are a wrong
 * attempt; fewer are a lone tap, not graded (the prompt stays, the clock keeps running). A bar:
 * its notes in order, each timed from the one before; a wrong note ends the prompt (no retry); a
 * repeat of the note just played (a doubled event) is ignored, since a bar never repeats a note.
 *
 * The microphone hears one note at a time: it answers notes, accidentals and bars, never a chord.
 * While the input is the microphone, chord prompts are skipped (recorded as `skipped`, never
 * wrong, left out of the score), and a mic note on a chord prompt is ignored.
 *
 * Exactly one `complete` effect per run, after the last prompt's feedback. A scored run then saves
 * (`save`, carrying its attempt; a stale answer is ignored; Retry is a new attempt). An unscored
 * run (a daily challenge replayed the same day: practice) ends at `complete`. `again` starts a new
 * run from any finished state; in daily mode it is never scored.
 */
import { CHORD_WINDOW_MS } from '../input/chord-window';
import type { NoteEvent } from '../input/events';
import type { CompleteOutcome } from '../machines/learn-data';
import type { Machine } from '../machines/runner';
import type { Instrument } from '../schemas';
import {
  isChordAttempt,
  pitchClasses,
} from '../theory/chords';
import {
  promptMidis,
  type SprintPrompt,
} from './generate';
import { micAllowed } from './levels';
import {
  promptPoints,
  summarizeRun,
  type PromptResult,
  type RunSummary,
} from './scoring';

export type SprintMode =
  | 'freeplay'
  | 'daily';

/** What every state carries: the run and what has been answered so far. */
interface Run {
  mode: SprintMode;
  prompts: readonly SprintPrompt[];
  /** Each prompt's sounding pitches on the learner's instrument. */
  targets: readonly (readonly number[])[];
  instrument: Instrument;
  /** Whether this run's result is saved (false: a daily replay, practice). */
  scored: boolean;
  /** The input is the microphone (chords are skipped). */
  mic: boolean;
  results: readonly PromptResult[];
}

export type SprintState =
  | (Run & {
      kind: 'ready';
    })
  | (Run & {
      kind: 'countdown';
      beat:
        | 0
        | 1
        | 2;
    })
  | (Run & {
      kind: 'asking';
      index: number;
      /** When the prompt was drawn; null until then (nothing answers). */
      shownAt:
        | number
        | null;
      /** Chord: the notes in the open window. Bar: the notes played right so far. */
      got: readonly number[];
      /** Bar: when each note in `got` was played. */
      times: readonly number[];
      /** Chord: when the open window opened; null when none is open. */
      windowAt:
        | number
        | null;
      /** Chord: windows closed with too few notes on this prompt. */
      tooFew: number;
    })
  | (Run & {
      kind: 'feedback';
      index: number;
      result: PromptResult;
      played: readonly number[];
    })
  | (Run & {
      kind: 'complete';
      summary: RunSummary;
    })
  | (Run & {
      kind: 'saving';
      summary: RunSummary;
      attempt: number;
    })
  | (Run & {
      kind: 'saved';
      summary: RunSummary;
    })
  | (Run & {
      kind: 'failed';
      summary: RunSummary;
      attempt: number;
    })
  | (Run & {
      kind: 'signed-out';
      summary: RunSummary;
    });

export type SprintNoteEvent =
  Pick<
    NoteEvent,
    | 'type'
    | 'midi'
    | 'time'
    | 'source'
  >;

export type SprintEvent =
  | {
      type: 'start';
    }
  | {
      type: 'tick';
    }
  | {
      type: 'shown';
      at: number;
    }
  | {
      type: 'note';
      note: SprintNoteEvent;
    }
  | {
      type: 'close';
      at: number;
    }
  | {
      type: 'input';
      mic: boolean;
    }
  | {
      type: 'next';
    }
  | {
      type: 'answered';
      attempt: number;
      outcome: CompleteOutcome;
    }
  | {
      type: 'retry';
    }
  | {
      type: 'again';
      prompts: readonly SprintPrompt[];
    };

export type SprintEffect =
  | {
      type: 'complete';
      mode: SprintMode;
      scored: boolean;
      summary: RunSummary;
    }
  | {
      type: 'save';
      mode: SprintMode;
      attempt: number;
      summary: RunSummary;
      results: readonly PromptResult[];
    };

type Step =
  {
    state: SprintState;
    effects: SprintEffect[];
  };

function runOf(
  s: SprintState,
): Run {
  return {
    mode: s.mode,
    prompts:
      s.prompts,
    targets:
      s.targets,
    instrument:
      s.instrument,
    scored:
      s.scored,
    mic: s.mic,
    results:
      s.results,
  };
}

export function initial(opts: {
  prompts: readonly SprintPrompt[];
  mode: SprintMode;
  scored: boolean;
  mic: boolean;
  instrument?: Instrument;
}): SprintState {
  const instrument =
    opts.instrument ??
    'piano';
  return {
    kind: 'ready',
    mode: opts.mode,
    prompts:
      opts.prompts,
    targets:
      opts.prompts.map(
        (
          p,
        ) =>
          promptMidis(
            p,
            instrument,
          ),
      ),
    instrument,
    scored:
      opts.scored,
    mic: opts.mic,
    results:
      [],
  };
}

const same =
  (
    state: SprintState,
  ): Step => ({
    state,
    effects:
      [],
  });

const skippedResult =
  (
    p: SprintPrompt,
  ): PromptResult => ({
    level:
      p.level,
    kind: p.kind,
    correct: false,
    ms: null,
    noteMs:
      [],
    points: 0,
    skipped: true,
  });

/**
 * Ask prompt `index` — or, while the input is the microphone, skip the chords from there on —
 * or end the run past the last prompt.
 */
function askFrom(
  run: Run,
  index: number,
): Step {
  let i =
    index;
  let results =
    run.results;
  for (;;) {
    const p =
      run
        .prompts[
        i
      ];
    if (
      !p ||
      !run.mic ||
      micAllowed(
        p.kind,
      )
    )
      break;
    results =
      [
        ...results,
        skippedResult(
          p,
        ),
      ];
    i += 1;
  }
  const next: Run =
    {
      ...run,
      results,
    };
  if (
    i <
    run
      .prompts
      .length
  ) {
    return {
      state:
        {
          ...next,
          kind: 'asking',
          index:
            i,
          shownAt:
            null,
          got: [],
          times:
            [],
          windowAt:
            null,
          tooFew: 0,
        },
      effects:
        [],
    };
  }
  const summary =
    summarizeRun(
      results,
    );
  const complete: SprintEffect =
    {
      type: 'complete',
      mode: run.mode,
      scored:
        run.scored,
      summary,
    };
  if (
    !run.scored
  )
    return {
      state:
        {
          ...next,
          kind: 'complete',
          summary,
        },
      effects:
        [
          complete,
        ],
    };
  return {
    state:
      {
        ...next,
        kind: 'saving',
        summary,
        attempt: 1,
      },
    effects:
      [
        complete,
        {
          type: 'save',
          mode: run.mode,
          attempt: 1,
          summary,
          results,
        },
      ],
  };
}

type Asking =
  Extract<
    SprintState,
    {
      kind: 'asking';
    }
  >;

function answer(
  s: Asking,
  correct: boolean,
  at: number,
  noteMs: readonly number[],
  played: readonly number[],
): Step {
  const p =
    s
      .prompts[
      s
        .index
    ];
  if (
    !p ||
    s.shownAt ===
      null
  )
    return same(
      s,
    );
  const ms =
    Math.max(
      0,
      at -
        s.shownAt,
    );
  const result: PromptResult =
    {
      level:
        p.level,
      kind: p.kind,
      correct,
      ms,
      noteMs,
      points:
        promptPoints(
          p.kind,
          ms,
          correct,
          p
            .notes
            .length,
        ),
      skipped: false,
    };
  return {
    state:
      {
        ...runOf(
          s,
        ),
        results:
          [
            ...s.results,
            result,
          ],
        kind: 'feedback',
        index:
          s.index,
        result,
        played,
      },
    effects:
      [],
  };
}

/** Close the chord window at `at`: an attempt is graded (it was not the chord); too few is not. */
function closeWindow(
  s: Asking,
  at: number,
): Step {
  if (
    isChordAttempt(
      s.got,
    )
  )
    return answer(
      s,
      false,
      at,
      [],
      s.got,
    );
  return {
    state:
      {
        ...s,
        got: [],
        windowAt:
          null,
        tooFew:
          s.tooFew +
          1,
      },
    effects:
      [],
  };
}

function onNote(
  s: Asking,
  e: SprintNoteEvent,
): Step {
  const p =
    s
      .prompts[
      s
        .index
    ];
  const target =
    s
      .targets[
      s
        .index
    ];
  if (
    !p ||
    !target
  )
    return same(
      s,
    );
  if (
    e.type !==
      'on' ||
    !Number.isFinite(
      e.midi,
    ) ||
    !Number.isFinite(
      e.time,
    )
  )
    return same(
      s,
    );
  if (
    s.shownAt ===
      null ||
    e.time <
      s.shownAt
  )
    return same(
      s,
    );
  if (
    e.source ===
      'mic' &&
    !micAllowed(
      p.kind,
    )
  )
    return same(
      s,
    );
  const at =
    e.time;
  switch (
    p.kind
  ) {
    case 'note':
    case 'accidental':
      return answer(
        s,
        e.midi ===
          target[0],
        at,
        [
          at -
            s.shownAt,
        ],
        [
          e.midi,
        ],
      );
    case 'bar': {
      const last =
        s
          .got[
          s
            .got
            .length -
            1
        ];
      if (
        last ===
        e.midi
      )
        return same(
          s,
        );
      const shownAt =
        s.shownAt;
      const times =
        [
          ...s.times,
          at,
        ];
      const noteMs =
        times.map(
          (
            t,
            i,
          ) =>
            t -
            (times[
              i -
                1
            ] ??
              shownAt),
        );
      if (
        e.midi !==
        target[
          s
            .got
            .length
        ]
      ) {
        return answer(
          s,
          false,
          at,
          noteMs.slice(
            0,
            -1,
          ),
          [
            ...s.got,
            e.midi,
          ],
        );
      }
      const got =
        [
          ...s.got,
          e.midi,
        ];
      if (
        got.length <
        target.length
      )
        return {
          state:
            {
              ...s,
              got,
              times,
            },
          effects:
            [],
        };
      return answer(
        s,
        true,
        at,
        noteMs,
        got,
      );
    }
    case 'chord': {
      let cur: Asking =
        s;
      if (
        cur.windowAt !==
          null &&
        at -
          cur.windowAt >=
          CHORD_WINDOW_MS
      ) {
        const closed =
          closeWindow(
            cur,
            cur.windowAt +
              CHORD_WINDOW_MS,
          );
        if (
          closed
            .state
            .kind !==
          'asking'
        )
          return closed;
        cur =
          closed.state;
      }
      const got =
        cur.got.includes(
          e.midi,
        )
          ? cur.got
          : [
              ...cur.got,
              e.midi,
            ];
      const windowAt =
        cur.windowAt ??
        at;
      const want =
        pitchClasses(
          target,
        );
      const have =
        pitchClasses(
          got,
        );
      if (
        want.length ===
          have.length &&
        want.every(
          (
            pc,
            i,
          ) =>
            pc ===
            have[
              i
            ],
        )
      ) {
        return answer(
          {
            ...cur,
            got,
            windowAt,
          },
          true,
          at,
          [],
          got,
        );
      }
      return {
        state:
          {
            ...cur,
            got,
            windowAt,
          },
        effects:
          [],
      };
    }
    default:
      return unreachable(
        p.kind,
      );
  }
}

export function step(
  s: SprintState,
  e: SprintEvent,
): Step {
  switch (
    e.type
  ) {
    case 'start':
      if (
        s.kind !==
        'ready'
      )
        return same(
          s,
        );
      return {
        state:
          {
            ...runOf(
              s,
            ),
            kind: 'countdown',
            beat: 0,
          },
        effects:
          [],
      };
    case 'tick':
      if (
        s.kind !==
        'countdown'
      )
        return same(
          s,
        );
      if (
        s.beat <
        2
      )
        return {
          state:
            {
              ...s,
              beat: (s.beat +
                1) as
                | 1
                | 2,
            },
          effects:
            [],
        };
      return askFrom(
        runOf(
          s,
        ),
        0,
      );
    case 'shown':
      if (
        s.kind !==
          'asking' ||
        s.shownAt !==
          null ||
        !Number.isFinite(
          e.at,
        )
      )
        return same(
          s,
        );
      return {
        state:
          {
            ...s,
            shownAt:
              e.at,
          },
        effects:
          [],
      };
    case 'note':
      return s.kind ===
        'asking'
        ? onNote(
            s,
            e.note,
          )
        : same(
            s,
          );
    case 'close': {
      if (
        s.kind !==
          'asking' ||
        s.windowAt ===
          null ||
        !Number.isFinite(
          e.at,
        )
      )
        return same(
          s,
        );
      if (
        e.at -
          s.windowAt <
        CHORD_WINDOW_MS
      )
        return same(
          s,
        );
      return closeWindow(
        s,
        s.windowAt +
          CHORD_WINDOW_MS,
      );
    }
    case 'input': {
      if (
        s.mic ===
        e.mic
      )
        return same(
          s,
        );
      const next =
        {
          ...s,
          mic: e.mic,
        } as SprintState;
      if (
        next.kind ===
          'asking' &&
        e.mic
      ) {
        const p =
          next
            .prompts[
            next
              .index
          ];
        if (
          p &&
          !micAllowed(
            p.kind,
          )
        )
          return askFrom(
            runOf(
              next,
            ),
            next.index,
          );
      }
      return {
        state:
          next,
        effects:
          [],
      };
    }
    case 'next':
      if (
        s.kind !==
        'feedback'
      )
        return same(
          s,
        );
      return askFrom(
        runOf(
          s,
        ),
        s.index +
          1,
      );
    case 'answered': {
      if (
        s.kind !==
          'saving' ||
        s.attempt !==
          e.attempt
      )
        return same(
          s,
        );
      const base =
        {
          ...runOf(
            s,
          ),
          summary:
            s.summary,
        };
      switch (
        e.outcome
      ) {
        case 'saved':
          return {
            state:
              {
                ...base,
                kind: 'saved',
              },
            effects:
              [],
          };
        case 'unauthorized':
          return {
            state:
              {
                ...base,
                kind: 'signed-out',
              },
            effects:
              [],
          };
        case 'failed':
        case 'invalid':
          return {
            state:
              {
                ...base,
                kind: 'failed',
                attempt:
                  s.attempt,
              },
            effects:
              [],
          };
        default:
          return unreachable(
            e.outcome,
          );
      }
    }
    case 'retry': {
      if (
        s.kind !==
        'failed'
      )
        return same(
          s,
        );
      const attempt =
        s.attempt +
        1;
      return {
        state:
          {
            ...runOf(
              s,
            ),
            kind: 'saving',
            summary:
              s.summary,
            attempt,
          },
        effects:
          [
            {
              type: 'save',
              mode: s.mode,
              attempt,
              summary:
                s.summary,
              results:
                s.results,
            },
          ],
      };
    }
    case 'again': {
      if (
        s.kind !==
          'complete' &&
        s.kind !==
          'saved' &&
        s.kind !==
          'failed' &&
        s.kind !==
          'signed-out'
      ) {
        return same(
          s,
        );
      }
      return {
        state:
          {
            ...runOf(
              s,
            ),
            kind: 'countdown',
            beat: 0,
            prompts:
              e.prompts,
            targets:
              e.prompts.map(
                (
                  p,
                ) =>
                  promptMidis(
                    p,
                    s.instrument,
                  ),
              ),
            scored:
              s.mode ===
              'daily'
                ? false
                : s.scored,
            results:
              [],
          },
        effects:
          [],
      };
    }
    default:
      return unreachable(
        e,
      );
  }
}

/** One run's machine, in the shape `createRunner` / `useMachine` take. */
export function createSprintMachine(
  opts: Parameters<
    typeof initial
  >[0],
): Machine<
  SprintState,
  SprintEvent,
  SprintEffect
> {
  return {
    initial:
      initial(
        opts,
      ),
    step,
  };
}

function unreachable(
  x: never,
): never {
  throw new Error(
    `sprint: unhandled ${JSON.stringify(x)}`,
  );
}
