import {
  describe,
  expect,
  it,
} from 'vitest';
import type { NoteEvent } from '../input/events';
import type { SprintPrompt } from './generate';
import {
  initial,
  step,
  type SprintEvent,
  type SprintState,
  type SprintEffect,
} from './machine';

const note =
  (
    written: number,
    accidental:
      | -1
      | 0
      | 1 = 0,
  ) => ({
    written,
    accidental,
  });
const P =
  {
    c4: {
      level:
        'note',
      kind: 'note',
      clef: 'treble',
      notes:
        [
          note(
            60,
          ),
        ],
    } as SprintPrompt,
    e4: {
      level:
        'note',
      kind: 'note',
      clef: 'treble',
      notes:
        [
          note(
            64,
          ),
        ],
    } as SprintPrompt,
    fs4: {
      level:
        'accidental',
      kind: 'accidental',
      clef: 'treble',
      notes:
        [
          note(
            65,
            1,
          ),
        ],
    } as SprintPrompt,
    cmaj: {
      level:
        'triad',
      kind: 'chord',
      clef: 'treble',
      notes:
        [
          note(
            60,
          ),
          note(
            64,
          ),
          note(
            67,
          ),
        ],
    } as SprintPrompt,
    bar: {
      level:
        'bar',
      kind: 'bar',
      clef: 'treble',
      notes:
        [
          note(
            60,
          ),
          note(
            62,
          ),
          note(
            64,
          ),
          note(
            65,
          ),
        ],
    } as SprintPrompt,
  };

const on =
  (
    midi: number,
    time: number,
    source: NoteEvent['source'] = 'midi',
  ): SprintEvent => ({
    type: 'note',
    note: {
      type: 'on',
      midi,
      time,
      source,
    },
  });
const off =
  (
    midi: number,
    time: number,
  ): SprintEvent => ({
    type: 'note',
    note: {
      type: 'off',
      midi,
      time,
      source:
        'midi',
    },
  });

function run(
  s: SprintState,
  events: SprintEvent[],
): {
  state: SprintState;
  effects: SprintEffect[];
} {
  let state =
    s;
  const effects: SprintEffect[] =
    [];
  for (const e of events) {
    const r =
      step(
        state,
        e,
      );
    state =
      r.state;
    effects.push(
      ...r.effects,
    );
  }
  return {
    state,
    effects,
  };
}

/** Ready → countdown (three beats) → the first prompt, drawn at `at`. */
function started(
  prompts: SprintPrompt[],
  opts: {
    at?: number;
    mic?: boolean;
    scored?: boolean;
    mode?:
      | 'freeplay'
      | 'daily';
  } = {},
) {
  const s =
    initial(
      {
        prompts,
        mode:
          opts.mode ??
          'freeplay',
        scored:
          opts.scored ??
          true,
        mic:
          opts.mic ??
          false,
      },
    );
  return run(
    s,
    [
      {
        type: 'start',
      },
      {
        type: 'tick',
      },
      {
        type: 'tick',
      },
      {
        type: 'tick',
      },
      {
        type: 'shown',
        at:
          opts.at ??
          1000,
      },
    ],
  )
    .state;
}

describe('sprint machine: the run', () => {
  it('ready → countdown of three quiet beats → asking', () => {
    let s =
      initial(
        {
          prompts:
            [
              P.c4,
            ],
          mode: 'freeplay',
          scored: true,
          mic: false,
        },
      );
    expect(
      s.kind,
    ).toBe(
      'ready',
    );
    s =
      step(
        s,
        {
          type: 'start',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'countdown',
        beat: 0,
      },
    );
    s =
      step(
        s,
        {
          type: 'tick',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'countdown',
        beat: 1,
      },
    );
    s =
      step(
        s,
        {
          type: 'tick',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'countdown',
        beat: 2,
      },
    );
    s =
      step(
        s,
        {
          type: 'tick',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 0,
        shownAt:
          null,
      },
    );
  });

  it('a prompt cannot be answered before it is drawn', () => {
    let s =
      initial(
        {
          prompts:
            [
              P.c4,
            ],
          mode: 'freeplay',
          scored: true,
          mic: false,
        },
      );
    s =
      run(
        s,
        [
          {
            type: 'start',
          },
          {
            type: 'tick',
          },
          {
            type: 'tick',
          },
          {
            type: 'tick',
          },
        ],
      ).state;
    s =
      step(
        s,
        on(
          60,
          900,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        shownAt:
          null,
      },
    );
    s =
      step(
        s,
        {
          type: 'shown',
          at: 1000,
        },
      ).state;
    // A note timed before the drawing (queued from the previous prompt) is stale.
    s =
      step(
        s,
        on(
          60,
          999,
        ),
      ).state;
    expect(
      s.kind,
    ).toBe(
      'asking',
    );
    s =
      step(
        s,
        on(
          60,
          1500,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
            ms: 500,
            points: 100,
          },
      },
    );
  });

  it('a second shown does not restart the clock', () => {
    let s =
      started(
        [
          P.c4,
        ],
        {
          at: 1000,
        },
      );
    s =
      step(
        s,
        {
          type: 'shown',
          at: 3000,
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        shownAt: 1000,
      },
    );
  });

  it('ignores note-offs, and notes outside asking', () => {
    let s =
      started(
        [
          P.c4,
          P.e4,
        ],
      );
    s =
      step(
        s,
        off(
          60,
          1100,
        ),
      ).state;
    expect(
      s.kind,
    ).toBe(
      'asking',
    );
    s =
      step(
        s,
        on(
          62,
          1200,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: false,
            points: 0,
          },
        played:
          [
            62,
          ],
      },
    );
    // A double event (two inputs, a bounce) finds nothing to answer.
    const again =
      step(
        s,
        on(
          60,
          1201,
        ),
      );
    expect(
      again.state,
    ).toBe(
      s,
    );
  });

  it('a held key from the previous prompt does not answer the next', () => {
    let s =
      started(
        [
          P.c4,
          {
            ...P.c4,
          },
        ],
        {
          at: 1000,
        },
      );
    s =
      step(
        s,
        on(
          60,
          1400,
        ),
      ).state;
    s =
      step(
        s,
        {
          type: 'next',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 1,
        shownAt:
          null,
      },
    );
    // The key is still down; a repeat or a queued event arrives before the prompt is drawn.
    s =
      step(
        s,
        on(
          60,
          1500,
        ),
      ).state;
    s =
      step(
        s,
        {
          type: 'shown',
          at: 1600,
        },
      ).state;
    s =
      step(
        s,
        on(
          60,
          1590,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 1,
      },
    );
  });

  it('scores an accidental by its sounding pitch', () => {
    let s =
      started(
        [
          P.fs4,
        ],
        {
          at: 0,
        },
      );
    s =
      step(
        s,
        on(
          66,
          2000,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
            ms: 2000,
          },
      },
    );
    if (
      s.kind !==
      'feedback'
    )
      throw new Error();
    expect(
      s
        .result
        .points,
    ).toBeGreaterThan(
      0,
    );
    expect(
      s
        .result
        .points,
    ).toBeLessThan(
      100,
    );
  });

  it('guitar: targets an octave below the written treble note', () => {
    let s =
      initial(
        {
          prompts:
            [
              P.e4,
            ],
          mode: 'freeplay',
          scored: true,
          mic: false,
          instrument:
            'guitar',
        },
      );
    s =
      run(
        s,
        [
          {
            type: 'start',
          },
          {
            type: 'tick',
          },
          {
            type: 'tick',
          },
          {
            type: 'tick',
          },
          {
            type: 'shown',
            at: 0,
          },
        ],
      ).state;
    s =
      step(
        s,
        on(
          52,
          100,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
          },
      },
    );
  });
});

describe('sprint machine: chords', () => {
  it('right as soon as the chord is complete inside the window, timed to its last note', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 1000,
        },
      );
    s =
      run(
        s,
        [
          on(
            64,
            2000,
          ),
          on(
            60,
            2030,
          ),
          on(
            67,
            2050,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
            ms: 1050,
            points: 100,
          },
      },
    );
  });

  it('any octave or inversion of the chord is right', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            52,
            100,
          ),
          on(
            55,
            110,
          ),
          on(
            72,
            120,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
          },
      },
    );
  });

  it('a chord split across the window: the window closes, too few is not graded', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            100,
          ),
          on(
            64,
            200,
          ),
        ],
      ).state;
    // The timer closes the window with two pitch classes: a dyad, not an attempt.
    s =
      step(
        s,
        {
          type: 'close',
          at: 700,
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        got: [],
        windowAt:
          null,
        tooFew: 1,
      },
    );
    // The late third note opens a fresh window on its own.
    s =
      step(
        s,
        on(
          67,
          800,
        ),
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        got: [
          67,
        ],
        windowAt: 800,
      },
    );
  });

  it('a note after the window closes it: a dyad then opens a fresh window', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            100,
          ),
          on(
            64,
            200,
          ),
          on(
            67,
            750,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        got: [
          67,
        ],
        windowAt: 750,
        tooFew: 1,
      },
    );
  });

  it('a wrong attempt is graded when the window closes', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            100,
          ),
          on(
            63,
            120,
          ),
          on(
            67,
            140,
          ),
        ],
      ).state;
    expect(
      s.kind,
    ).toBe(
      'asking',
    );
    s =
      step(
        s,
        {
          type: 'close',
          at: 650,
        },
      ).state;
    expect(
      s.kind,
    ).toBe(
      'asking',
    ); // 550 ms after the first note: still open
    s =
      step(
        s,
        {
          type: 'close',
          at: 700,
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: false,
            points: 0,
          },
        played:
          [
            60,
            63,
            67,
          ],
      },
    );
  });

  it('the microphone never answers a chord, and chord prompts are skipped for it, never wrong', () => {
    let s =
      started(
        [
          P.c4,
          P.cmaj,
          P.cmaj,
          P.e4,
        ],
        {
          at: 0,
          mic: true,
        },
      );
    s =
      step(
        s,
        on(
          60,
          100,
          'mic',
        ),
      ).state;
    s =
      step(
        s,
        {
          type: 'next',
        },
      ).state;
    // Both chords skipped: straight on to the next one-note prompt.
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 3,
      },
    );
    if (
      s.kind !==
      'asking'
    )
      throw new Error();
    expect(
      s.results.map(
        (
          r,
        ) =>
          r.skipped,
      ),
    ).toEqual(
      [
        false,
        true,
        true,
      ],
    );
    expect(
      s.results
        .filter(
          (
            r,
          ) =>
            r.skipped,
        )
        .every(
          (
            r,
          ) =>
            !r.correct &&
            r.points ===
              0,
        ),
    ).toBe(
      true,
    );
  });

  it('switching to the microphone while a chord is asked skips it', () => {
    let s =
      started(
        [
          P.cmaj,
          P.c4,
        ],
        {
          at: 0,
        },
      );
    s =
      step(
        s,
        {
          type: 'input',
          mic: true,
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        index: 1,
        shownAt:
          null,
      },
    );
  });

  it('mic notes are ignored on a chord even before the input event lands', () => {
    let s =
      started(
        [
          P.cmaj,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            10,
            'mic',
          ),
          on(
            64,
            20,
            'mic',
          ),
          on(
            67,
            30,
            'mic',
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        got: [],
      },
    );
  });
});

describe('sprint machine: bars', () => {
  it('notes in order, each timed from the one before', () => {
    let s =
      started(
        [
          P.bar,
        ],
        {
          at: 1000,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            1500,
          ),
          off(
            60,
            1600,
          ),
          on(
            62,
            2000,
          ),
          on(
            64,
            2400,
          ),
          on(
            65,
            3000,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: true,
            ms: 2000,
            noteMs:
              [
                500,
                500,
                400,
                600,
              ],
            points: 100,
          },
      },
    );
  });

  it('a wrong note ends the prompt (no retry), even if the right one follows', () => {
    let s =
      started(
        [
          P.bar,
          P.c4,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            100,
          ),
          on(
            63,
            200,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'feedback',
        result:
          {
            correct: false,
            points: 0,
            noteMs:
              [
                100,
              ],
          },
        played:
          [
            60,
            63,
          ],
      },
    );
    const after =
      step(
        s,
        on(
          62,
          250,
        ),
      );
    expect(
      after.state,
    ).toBe(
      s,
    );
  });

  it('a doubled event of the last note is not a wrong note', () => {
    let s =
      started(
        [
          P.bar,
        ],
        {
          at: 0,
        },
      );
    s =
      run(
        s,
        [
          on(
            60,
            100,
          ),
          on(
            60,
            101,
            'keys',
          ),
          on(
            62,
            200,
          ),
        ],
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'asking',
        got: [
          60,
          62,
        ],
      },
    );
  });
});

describe('sprint machine: completing and saving', () => {
  const finish =
    (
      s: SprintState,
    ) => {
      let st =
        s;
      const effects: SprintEffect[] =
        [];
      for (
        let guard = 0;
        guard <
          100 &&
        (st.kind ===
          'asking' ||
          st.kind ===
            'feedback');
        guard++
      ) {
        if (
          st.kind ===
          'asking'
        ) {
          const at =
            st.shownAt ??
            0;
          const r =
            run(
              st,
              [
                {
                  type: 'shown',
                  at,
                },
                on(
                  st
                    .targets[
                    st
                      .index
                  ]?.[0] ??
                    0,
                  at +
                    100,
                ),
              ],
            );
          st =
            r.state;
        } else {
          const r =
            step(
              st,
              {
                type: 'next',
              },
            );
          st =
            r.state;
          effects.push(
            ...r.effects,
          );
        }
      }
      return {
        state:
          st,
        effects,
      };
    };

  it('one complete per run; a scored run saves once, retry saves again as a new attempt', () => {
    const {
      state,
      effects,
    } =
      finish(
        started(
          [
            P.c4,
            P.e4,
          ],
        ),
      );
    expect(
      effects.filter(
        (
          e,
        ) =>
          e.type ===
          'complete',
      ),
    ).toHaveLength(
      1,
    );
    expect(
      effects.filter(
        (
          e,
        ) =>
          e.type ===
          'save',
      ),
    ).toEqual(
      [
        expect.objectContaining(
          {
            type: 'save',
            attempt: 1,
            summary:
              expect.objectContaining(
                {
                  score: 100,
                },
              ),
          },
        ),
      ],
    );
    expect(
      state,
    ).toMatchObject(
      {
        kind: 'saving',
        attempt: 1,
      },
    );
    // next again does nothing
    expect(
      step(
        state,
        {
          type: 'next',
        },
      )
        .effects,
    ).toEqual(
      [],
    );
    let s =
      step(
        state,
        {
          type: 'answered',
          attempt: 1,
          outcome:
            'failed',
        },
      ).state;
    expect(
      s.kind,
    ).toBe(
      'failed',
    );
    const r =
      step(
        s,
        {
          type: 'retry',
        },
      );
    expect(
      r.state,
    ).toMatchObject(
      {
        kind: 'saving',
        attempt: 2,
      },
    );
    expect(
      r.effects,
    ).toEqual(
      [
        expect.objectContaining(
          {
            type: 'save',
            attempt: 2,
          },
        ),
      ],
    );
    s =
      r.state;
    // A stale answer for attempt 1 is ignored.
    expect(
      step(
        s,
        {
          type: 'answered',
          attempt: 1,
          outcome:
            'saved',
        },
      )
        .state,
    ).toBe(
      s,
    );
    s =
      step(
        s,
        {
          type: 'answered',
          attempt: 2,
          outcome:
            'saved',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'saved',
        summary:
          {
            score: 100,
            stars: 3,
          },
      },
    );
  });

  it('signed out: the result stays, not saved', () => {
    const {
      state,
    } =
      finish(
        started(
          [
            P.c4,
          ],
        ),
      );
    const s =
      step(
        state,
        {
          type: 'answered',
          attempt: 1,
          outcome:
            'unauthorized',
        },
      ).state;
    expect(
      s,
    ).toMatchObject(
      {
        kind: 'signed-out',
        summary:
          {
            correct: 1,
          },
      },
    );
  });

  it('an unscored run (daily practice) completes without saving', () => {
    const {
      state,
      effects,
    } =
      finish(
        started(
          [
            P.c4,
          ],
          {
            scored: false,
            mode: 'daily',
          },
        ),
      );
    expect(
      state,
    ).toMatchObject(
      {
        kind: 'complete',
        scored: false,
      },
    );
    expect(
      effects.map(
        (
          e,
        ) =>
          e.type,
      ),
    ).toEqual(
      [
        'complete',
      ],
    );
  });

  it('again: a daily replay is practice; freeplay stays scored', () => {
    const daily =
      finish(
        started(
          [
            P.c4,
          ],
          {
            mode: 'daily',
          },
        ),
      ).state;
    const saved =
      step(
        daily,
        {
          type: 'answered',
          attempt: 1,
          outcome:
            'saved',
        },
      ).state;
    const replay =
      step(
        saved,
        {
          type: 'again',
          prompts:
            [
              P.e4,
            ],
        },
      ).state;
    expect(
      replay,
    ).toMatchObject(
      {
        kind: 'countdown',
        beat: 0,
        scored: false,
        results:
          [],
      },
    );
    const free =
      finish(
        started(
          [
            P.c4,
          ],
        ),
      ).state;
    const freeAgain =
      step(
        step(
          free,
          {
            type: 'answered',
            attempt: 1,
            outcome:
              'saved',
          },
        )
          .state,
        {
          type: 'again',
          prompts:
            [
              P.e4,
            ],
        },
      ).state;
    expect(
      freeAgain,
    ).toMatchObject(
      {
        kind: 'countdown',
        scored: true,
      },
    );
    // Not while a save is in flight.
    expect(
      step(
        free,
        {
          type: 'again',
          prompts:
            [
              P.e4,
            ],
        },
      )
        .state,
    ).toBe(
      free,
    );
  });
});
