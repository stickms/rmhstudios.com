import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BAR_NOTES,
  DAILY_LEVELS,
  DAILY_PROMPTS_PER_LEVEL,
  parMs,
  sprintLevel,
  type SprintLevelId,
} from './levels';
import {
  CLOCK_SLACK_MS,
  judgeDailyRun,
  needsReview,
  REVIEW_AVG_MS,
  sumPlayedMs,
} from './plausible';
import type { PromptResult } from './scoring';

/** A small deterministic jitter, so a "human" run is not even. */
function jitter(
  i: number,
): number {
  return (
    ((i *
      7919) %
      97) /
    97
  ); // 0..1, scattered
}

/**
 * A real-shaped daily run (the shape of the S6 / Phase 5 smoke runs): right answers between
 * roughly 0.6 and 2.6 times a quick reader's time, a wrong one now and then, bars played note by
 * note with human gaps. `skipChords` is a microphone or voice run.
 */
function humanRun({
  scale = 1,
  skipChords = false,
} = {}): PromptResult[] {
  let i = 0;
  return DAILY_LEVELS.flatMap(
    (
      level: SprintLevelId,
    ) =>
      Array.from(
        {
          length:
            DAILY_PROMPTS_PER_LEVEL,
        },
        (): PromptResult => {
          i++;
          const kind =
            sprintLevel(
              level,
            )
              ?.kind ??
            'note';
          if (
            skipChords &&
            kind ===
              'chord'
          ) {
            return {
              level,
              kind,
              correct: false,
              ms: null,
              noteMs:
                [],
              points: 0,
              skipped: true,
            };
          }
          const base =
            {
              note: 650,
              accidental: 900,
              chord: 1400,
              bar: 600,
            }[
              kind
            ] *
            scale;
          if (
            kind ===
            'bar'
          ) {
            const noteMs =
              [
                base +
                  400 *
                    jitter(
                      i,
                    ),
                350 +
                  300 *
                    jitter(
                      i +
                        1,
                    ),
                280 +
                  250 *
                    jitter(
                      i +
                        2,
                    ),
                300 +
                  400 *
                    jitter(
                      i +
                        3,
                    ),
              ].map(
                Math.round,
              );
            const ms =
              noteMs.reduce(
                (
                  a,
                  b,
                ) =>
                  a +
                  b,
                0,
              );
            return {
              level,
              kind,
              correct: true,
              ms,
              noteMs,
              points: 100,
              skipped: false,
            };
          }
          const ms =
            Math.round(
              base +
                base *
                  1.6 *
                  jitter(
                    i,
                  ),
            );
          return {
            level,
            kind,
            correct:
              i %
                9 !==
              0,
            ms,
            noteMs:
              [
                ms,
              ],
            points: 100,
            skipped: false,
          };
        },
      ),
  );
}

/** A scripted run: every answer takes `fraction` of its par, or a flat `ms` (bars split evenly). */
function flatRun(
  time:
    | number
    | {
        fraction: number;
      },
): PromptResult[] {
  return DAILY_LEVELS.flatMap(
    (
      level,
    ) =>
      Array.from(
        {
          length:
            DAILY_PROMPTS_PER_LEVEL,
        },
        (): PromptResult => {
          const kind =
            sprintLevel(
              level,
            )
              ?.kind ??
            'note';
          const par =
            parMs(
              kind,
              kind ===
                'bar'
                ? BAR_NOTES
                : 1,
            );
          const ms =
            typeof time ===
            'number'
              ? time
              : Math.round(
                  par *
                    time.fraction,
                );
          const noteMs =
            kind ===
            'bar'
              ? [
                  ms /
                    4,
                  ms /
                    4,
                  ms /
                    4,
                  ms /
                    4,
                ]
              : [
                  ms,
                ];
          return {
            level,
            kind,
            correct: true,
            ms,
            noteMs,
            points: 100,
            skipped: false,
          };
        },
      ),
  );
}

const roomy =
  (
    run: readonly PromptResult[],
  ) =>
    sumPlayedMs(
      run,
    ) +
    30_000;

describe('judgeDailyRun — the board checks', () => {
  it('passes every real-shaped run: keyboard, a quick MIDI reader, a microphone and a voice run', () => {
    for (const run of [
      humanRun(),
      humanRun(
        {
          scale: 0.7,
        },
      ),
      humanRun(
        {
          skipChords: true,
        },
      ),
      humanRun(
        {
          scale: 1.8,
          skipChords: true,
        },
      ),
    ]) {
      expect(
        judgeDailyRun(
          run,
          roomy(
            run,
          ),
        ),
      ).toEqual(
        {
          ranked: true,
          reason:
            null,
        },
      );
    }
  });

  it('a run whose start never reached the server is no-start', () => {
    const run =
      humanRun();
    expect(
      judgeDailyRun(
        run,
        null,
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'no-start',
      },
    );
  });

  it('answer times that add up to more than the time between start and save fail the clock', () => {
    const run =
      humanRun();
    const sum =
      sumPlayedMs(
        run,
      );
    expect(
      judgeDailyRun(
        run,
        sum -
          CLOCK_SLACK_MS,
      )
        .ranked,
    ).toBe(
      true,
    );
    expect(
      judgeDailyRun(
        run,
        sum -
          CLOCK_SLACK_MS -
          1,
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'clock',
      },
    );
  });

  it('tolerates two too-fast answers and fails three (one glitch is not a run)', () => {
    const run =
      humanRun();
    const notes =
      run.flatMap(
        (
          r,
          i,
        ) =>
          r.kind ===
            'note' &&
          r.correct
            ? [
                i,
              ]
            : [],
      );
    const fast =
      (
        n: number,
      ) =>
        run.map(
          (
            r,
            i,
          ) =>
            notes
              .slice(
                0,
                n,
              )
              .includes(
                i,
              )
              ? {
                  ...r,
                  ms: 120,
                  noteMs:
                    [
                      120,
                    ],
                }
              : r,
        );
    expect(
      judgeDailyRun(
        fast(
          2,
        ),
        roomy(
          fast(
            2,
          ),
        ),
      )
        .ranked,
    ).toBe(
      true,
    );
    expect(
      judgeDailyRun(
        fast(
          3,
        ),
        roomy(
          fast(
            3,
          ),
        ),
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'too-fast',
      },
    );
  });

  it('a wrong answer is never too fast (a slip is not a cheat)', () => {
    const run =
      humanRun().map(
        (
          r,
          i,
        ) =>
          i <
            4 &&
          !r.skipped
            ? {
                ...r,
                correct: false,
                ms: 90,
                noteMs:
                  [
                    90,
                  ],
              }
            : r,
      );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      )
        .ranked,
    ).toBe(
      true,
    );
  });

  /** The run's bars, with `noteMs` replaced by `f(noteMs)` for every bar. */
  function withBars(
    run: PromptResult[],
    f: (
      noteMs: readonly number[],
      n: number,
    ) => number[],
  ): PromptResult[] {
    let n = 0;
    return run.map(
      (
        r,
      ) => {
        if (
          r.kind !==
          'bar'
        )
          return r;
        const noteMs =
          f(
            r.noteMs,
            n++,
          );
        return {
          ...r,
          noteMs,
          ms: noteMs.reduce(
            (
              x,
              y,
            ) =>
              x +
              y,
            0,
          ),
        };
      },
    );
  }

  it('two notes merged by a main-thread stall (a 1 ms gap) on every bar stay ranked', () => {
    // The stall delivers a queued note-on a millisecond after the one before it; the next gap
    // carries the time the merged note lost.
    const run =
      withBars(
        humanRun(),
        (
          ms,
        ) => [
          ms[0]!,
          1,
          ms[1]! +
            ms[2]!,
          ms[3]!,
        ],
      );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      ),
    ).toEqual(
      {
        ranked: true,
        reason:
          null,
      },
    );
  });

  it('fast, honest bars (stepwise at 12 to 16 notes a second) stay ranked', () => {
    const run =
      withBars(
        humanRun(),
        (
          ms,
          n,
        ) => [
          ms[0]!,
          62 +
            n,
          70 +
            2 *
              n,
          83 -
            n,
        ],
      );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      ),
    ).toEqual(
      {
        ranked: true,
        reason:
          null,
      },
    );
  });

  it('microphone times quantised to its 25 ms poll stay ranked', () => {
    const q =
      (
        ms: number,
      ) =>
        Math.round(
          ms /
            25,
        ) *
        25;
    const run =
      withBars(
        humanRun(
          {
            skipChords: true,
          },
        ).map(
          (
            r,
          ) =>
            r.kind ===
              'bar' ||
            r.ms ===
              null
              ? r
              : {
                  ...r,
                  ms: q(
                    r.ms,
                  ),
                  noteMs:
                    [
                      q(
                        r.ms,
                      ),
                    ],
                },
        ),
        // A quick stepwise bar heard by the mic: one gap lands a single poll after the last.
        (
          ms,
        ) => [
          q(
            ms[0]!,
          ),
          75,
          25,
          100,
        ],
      );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      ),
    ).toEqual(
      {
        ranked: true,
        reason:
          null,
      },
    );
  });

  it('bars whose gaps are mostly under the floor fail, on several prompts only', () => {
    const scripted =
      (
        count: number,
      ) =>
        withBars(
          humanRun(),
          (
            ms,
            n,
          ) =>
            n <
            count
              ? [
                  ms[0]!,
                  10,
                  12,
                  ms[3]!,
                ]
              : [
                  ...ms,
                ],
        );
    expect(
      judgeDailyRun(
        scripted(
          2,
        ),
        roomy(
          scripted(
            2,
          ),
        ),
      )
        .ranked,
    ).toBe(
      true,
    );
    expect(
      judgeDailyRun(
        scripted(
          3,
        ),
        roomy(
          scripted(
            3,
          ),
        ),
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'too-fast',
      },
    );
  });

  it("a bar's first note keeps its reaction floor", () => {
    const run =
      withBars(
        humanRun(),
        (
          ms,
          n,
        ) =>
          n <
          3
            ? [
                120,
                ...ms.slice(
                  1,
                ),
              ]
            : [
                ...ms,
              ],
      );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'too-fast',
      },
    );
  });

  it('a run of the same time on every prompt is too even; 14 right answers do not trigger it', () => {
    const even =
      flatRun(
        {
          fraction: 0.8,
        },
      );
    expect(
      judgeDailyRun(
        even,
        roomy(
          even,
        ),
      ),
    ).toEqual(
      {
        ranked: false,
        reason:
          'too-even',
      },
    );
    // Only 14 right answers: the spread check needs 15.
    const few =
      even.map(
        (
          r,
          i,
        ) =>
          i >=
          14
            ? {
                ...r,
                correct: false,
              }
            : r,
      );
    expect(
      judgeDailyRun(
        few,
        roomy(
          few,
        ),
      )
        .ranked,
    ).toBe(
      true,
    );
  });

  it('30 answers of 100 ms (a fabricated POST) fail', () => {
    const fake =
      flatRun(
        100,
      );
    expect(
      judgeDailyRun(
        fake,
        roomy(
          fake,
        ),
      )
        .ranked,
    ).toBe(
      false,
    );
  });

  it('skipped chords are ignored by every check', () => {
    const run =
      humanRun(
        {
          skipChords: true,
        },
      );
    expect(
      run.filter(
        (
          r,
        ) =>
          r.skipped,
      ),
    ).toHaveLength(
      10,
    );
    expect(
      sumPlayedMs(
        run,
      ),
    ).toBe(
      run.reduce(
        (
          a,
          r,
        ) =>
          a +
          (r.ms ??
            0),
        0,
      ),
    );
    expect(
      judgeDailyRun(
        run,
        roomy(
          run,
        ),
      )
        .ranked,
    ).toBe(
      true,
    );
  });
});

describe('needsReview — a perfect run is looked at, never punished', () => {
  it('flags 100 with a mean under the review time', () => {
    expect(
      needsReview(
        {
          score: 100,
          avgMs:
            REVIEW_AVG_MS -
            1,
        },
        1,
      ),
    ).toBe(
      true,
    );
    expect(
      needsReview(
        {
          score: 100,
          avgMs:
            REVIEW_AVG_MS,
        },
        1,
      ),
    ).toBe(
      false,
    );
    expect(
      needsReview(
        {
          score: 99,
          avgMs: 300,
        },
        1,
      ),
    ).toBe(
      false,
    );
  });

  it('flags the third ranked 100 in seven days, not the second', () => {
    expect(
      needsReview(
        {
          score: 100,
          avgMs: 900,
        },
        2,
      ),
    ).toBe(
      false,
    );
    expect(
      needsReview(
        {
          score: 100,
          avgMs: 900,
        },
        3,
      ),
    ).toBe(
      true,
    );
    expect(
      needsReview(
        {
          score: 98,
          avgMs: 900,
        },
        3,
      ),
    ).toBe(
      false,
    );
  });
});
