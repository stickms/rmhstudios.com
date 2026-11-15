import {
  describe,
  expect,
  it,
} from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import {
  CARD_LOW_MIN_STEP,
  CARD_MAX_STEP,
  CARD_MIN_STEP,
} from '../staff-card-layout';
import {
  chordQuality,
  pitchClasses,
} from '../theory/chords';
import { clefStep } from '../theory/clef';
import {
  BAR_NOTES,
  DAILY_LEVELS,
  DAILY_PROMPTS_PER_LEVEL,
  FREEPLAY_PROMPTS,
  PAR_MS,
  SPRINT_LEVELS,
  SPRINT_MAX_STEP,
  SPRINT_MIN_STEP,
  isSprintLevelId,
  micAllowed,
  parMs,
  sprintLevel,
} from './levels';
import {
  dailyRun,
  dailySeed,
  makePrompt,
  makeRun,
  noteMidi,
  promptMidis,
  utcDate,
  type SprintPrompt,
} from './generate';
import {
  promptPoints,
  summarizeRun,
  type PromptResult,
} from './scoring';

const NATURAL_PCS =
  [
    0,
    2,
    4,
    5,
    7,
    9,
    11,
  ];
const isNatural =
  (
    m: number,
  ) =>
    NATURAL_PCS.includes(
      ((m %
        12) +
        12) %
        12,
    );

function stepsOf(
  p: SprintPrompt,
): number[] {
  return p.notes.map(
    (
      n,
    ) =>
      clefStep(
        p.clef,
        n.written,
      ),
  );
}

describe('levels', () => {
  it('lists the six levels, each with a kind and at least one clef', () => {
    expect(
      SPRINT_LEVELS.map(
        (
          l,
        ) =>
          l.id,
      ),
    ).toEqual(
      [
        'note',
        'note-both',
        'accidental',
        'triad',
        'inversion',
        'bar',
      ],
    );
    for (const l of SPRINT_LEVELS)
      expect(
        l
          .clefs
          .length,
      ).toBeGreaterThan(
        0,
      );
    expect(
      sprintLevel(
        'triad',
      )
        ?.kind,
    ).toBe(
      'chord',
    );
    expect(
      sprintLevel(
        'nope' as never,
      ),
    ).toBeUndefined();
    expect(
      isSprintLevelId(
        'bar',
      ),
    ).toBe(
      true,
    );
    expect(
      isSprintLevelId(
        'chord',
      ),
    ).toBe(
      false,
    );
  });

  it('pars: one note 1.2 s, accidental 1.6 s, chord 2.4 s, bar 2.0 s + 0.7 s per extra note', () => {
    expect(
      PAR_MS,
    ).toEqual(
      {
        note: 1200,
        accidental: 1600,
        chord: 2400,
        bar: 2000,
      },
    );
    expect(
      parMs(
        'note',
      ),
    ).toBe(
      1200,
    );
    expect(
      parMs(
        'chord',
        3,
      ),
    ).toBe(
      2400,
    );
    expect(
      parMs(
        'bar',
        4,
      ),
    ).toBe(
      2000 +
        3 *
          700,
    );
    expect(
      parMs(
        'bar',
        1,
      ),
    ).toBe(
      2000,
    );
  });

  it('allows the microphone for one note at a time only', () => {
    expect(
      micAllowed(
        'note',
      ),
    ).toBe(
      true,
    );
    expect(
      micAllowed(
        'accidental',
      ),
    ).toBe(
      true,
    );
    expect(
      micAllowed(
        'bar',
      ),
    ).toBe(
      true,
    );
    expect(
      micAllowed(
        'chord',
      ),
    ).toBe(
      false,
    );
  });

  it('keeps the sprint range inside what a card can draw', () => {
    expect(
      SPRINT_MIN_STEP,
    ).toBeGreaterThanOrEqual(
      CARD_MIN_STEP,
    );
    expect(
      SPRINT_MAX_STEP,
    ).toBeLessThanOrEqual(
      CARD_MAX_STEP,
    );
  });

  it('runs: freeplay 20 prompts, the daily 6 levels of 5', () => {
    expect(
      FREEPLAY_PROMPTS,
    ).toBe(
      20,
    );
    expect(
      DAILY_LEVELS,
    ).toEqual(
      [
        'note',
        'note-both',
        'accidental',
        'triad',
        'inversion',
        'bar',
      ],
    );
    expect(
      DAILY_PROMPTS_PER_LEVEL,
    ).toBe(
      5,
    );
  });
});

describe('makePrompt', () => {
  const many =
    (
      id: Parameters<
        typeof makePrompt
      >[0],
      seed = 7,
      n = 400,
    ) => {
      const rand =
        mulberry32(
          seed,
        );
      return Array.from(
        {
          length:
            n,
        },
        () =>
          makePrompt(
            id,
            rand,
          ),
      );
    };

  it('one note: a natural on the treble staff, inside the ledger-line limit', () => {
    const ps =
      many(
        'note',
      );
    for (const p of ps) {
      expect(
        p.kind,
      ).toBe(
        'note',
      );
      expect(
        p.clef,
      ).toBe(
        'treble',
      );
      expect(
        p.notes,
      ).toHaveLength(
        1,
      );
      expect(
        p
          .notes[0]
          ?.accidental,
      ).toBe(
        0,
      );
      expect(
        isNatural(
          p
            .notes[0]!
            .written,
        ),
      ).toBe(
        true,
      );
      const [
        s,
      ] =
        stepsOf(
          p,
        );
      expect(
        s,
      ).toBeGreaterThanOrEqual(
        SPRINT_MIN_STEP,
      );
      expect(
        s,
      ).toBeLessThanOrEqual(
        SPRINT_MAX_STEP,
      );
    }
    // Reaches both ends of the range over many prompts.
    const steps =
      new Set(
        ps.flatMap(
          stepsOf,
        ),
      );
    expect(
      steps.has(
        SPRINT_MIN_STEP,
      ),
    ).toBe(
      true,
    );
    expect(
      steps.has(
        SPRINT_MAX_STEP,
      ),
    ).toBe(
      true,
    );
  });

  it('more notes: both clefs appear', () => {
    const clefs =
      new Set(
        many(
          'note-both',
        ).map(
          (
            p,
          ) =>
            p.clef,
        ),
      );
    expect(
      [
        ...clefs,
      ].sort(),
    ).toEqual(
      [
        'bass',
        'treble',
      ],
    );
  });

  it('accidentals: a sharp or a flat on a natural, never E#, B#, Cb or Fb', () => {
    const ps =
      many(
        'accidental',
      );
    const seen =
      new Set<number>();
    for (const p of ps) {
      const n =
        p
          .notes[0]!;
      expect(
        isNatural(
          n.written,
        ),
      ).toBe(
        true,
      );
      expect(
        [
          -1,
          1,
        ],
      ).toContain(
        n.accidental,
      );
      seen.add(
        n.accidental,
      );
      const pc =
        ((n.written %
          12) +
          12) %
        12;
      if (
        n.accidental ===
        1
      )
        expect(
          [
            4,
            11,
          ],
        ).not.toContain(
          pc,
        );
      if (
        n.accidental ===
        -1
      )
        expect(
          [
            0,
            5,
          ],
        ).not.toContain(
          pc,
        );
      const [
        s,
      ] =
        stepsOf(
          p,
        );
      expect(
        s,
      ).toBeGreaterThanOrEqual(
        SPRINT_MIN_STEP,
      );
      expect(
        s,
      ).toBeLessThanOrEqual(
        SPRINT_MAX_STEP,
      );
    }
    expect(
      [
        ...seen,
      ].sort(),
    ).toEqual(
      [
        -1,
        1,
      ],
    );
  });

  it('triads: three notes stacked in thirds, a major or minor chord, inside the limit', () => {
    for (const p of many(
      'triad',
    )) {
      expect(
        p.kind,
      ).toBe(
        'chord',
      );
      expect(
        p.notes,
      ).toHaveLength(
        3,
      );
      const steps =
        stepsOf(
          p,
        );
      expect(
        steps[1]! -
          steps[0]!,
      ).toBe(
        2,
      );
      expect(
        steps[2]! -
          steps[1]!,
      ).toBe(
        2,
      );
      expect(
        [
          'major',
          'minor',
        ],
      ).toContain(
        chordQuality(
          promptMidis(
            p,
          ),
        ),
      );
      for (const s of steps) {
        expect(
          s,
        ).toBeGreaterThanOrEqual(
          SPRINT_MIN_STEP,
        );
        expect(
          s,
        ).toBeLessThanOrEqual(
          SPRINT_MAX_STEP,
        );
      }
      for (const n of p.notes)
        expect(
          Math.abs(
            n.accidental,
          ),
        ).toBeLessThanOrEqual(
          1,
        );
    }
  });

  it('inversions: first or second inversion, same chord, inside the limit', () => {
    const shapes =
      new Set<string>();
    for (const p of many(
      'inversion',
    )) {
      const steps =
        stepsOf(
          p,
        );
      const shape = `${steps[1]! - steps[0]!}-${steps[2]! - steps[1]!}`;
      shapes.add(
        shape,
      );
      expect(
        [
          '2-3',
          '3-2',
        ],
      ).toContain(
        shape,
      );
      expect(
        [
          'major',
          'minor',
        ],
      ).toContain(
        chordQuality(
          promptMidis(
            p,
          ),
        ),
      );
      expect(
        pitchClasses(
          promptMidis(
            p,
          ),
        ),
      ).toHaveLength(
        3,
      );
      for (const s of steps) {
        expect(
          s,
        ).toBeGreaterThanOrEqual(
          SPRINT_MIN_STEP,
        );
        expect(
          s,
        ).toBeLessThanOrEqual(
          SPRINT_MAX_STEP,
        );
      }
    }
    expect(
      [
        ...shapes,
      ].sort(),
    ).toEqual(
      [
        '2-3',
        '3-2',
      ],
    );
  });

  it('bars: four naturals in order, small moves, inside the limit, not all the same', () => {
    for (const p of many(
      'bar',
    )) {
      expect(
        p.kind,
      ).toBe(
        'bar',
      );
      expect(
        p.notes,
      ).toHaveLength(
        BAR_NOTES,
      );
      const steps =
        stepsOf(
          p,
        );
      for (const s of steps) {
        expect(
          s,
        ).toBeGreaterThanOrEqual(
          SPRINT_MIN_STEP,
        );
        expect(
          s,
        ).toBeLessThanOrEqual(
          SPRINT_MAX_STEP,
        );
      }
      for (
        let i = 1;
        i <
        steps.length;
        i++
      ) {
        const d =
          Math.abs(
            steps[
              i
            ]! -
              steps[
                i -
                  1
              ]!,
          );
        expect(
          d,
        ).toBeGreaterThan(
          0,
        );
        expect(
          d,
        ).toBeLessThanOrEqual(
          3,
        );
      }
      for (const n of p.notes)
        expect(
          n.accidental,
        ).toBe(
          0,
        );
    }
  });

  it('noteMidi adds the accidental; promptMidis writes guitar treble an octave up', () => {
    expect(
      noteMidi(
        {
          written: 60,
          accidental: 1,
        },
      ),
    ).toBe(
      61,
    );
    expect(
      noteMidi(
        {
          written: 64,
          accidental:
            -1,
        },
      ),
    ).toBe(
      63,
    );
    const p: SprintPrompt =
      {
        level:
          'note',
        kind: 'note',
        clef: 'treble',
        notes:
          [
            {
              written: 64,
              accidental: 0,
            },
          ],
      };
    expect(
      promptMidis(
        p,
      ),
    ).toEqual(
      [
        64,
      ],
    );
    expect(
      promptMidis(
        p,
        'guitar',
      ),
    ).toEqual(
      [
        52,
      ],
    );
    expect(
      promptMidis(
        {
          ...p,
          clef: 'bass',
        },
        'guitar',
      ),
    ).toEqual(
      [
        64,
      ],
    );
  });
});

describe('makeRun', () => {
  it('is seeded: the same seed gives the same run', () => {
    expect(
      makeRun(
        'accidental',
        20,
        mulberry32(
          3,
        ),
      ),
    ).toEqual(
      makeRun(
        'accidental',
        20,
        mulberry32(
          3,
        ),
      ),
    );
    expect(
      makeRun(
        'accidental',
        20,
        mulberry32(
          3,
        ),
      ),
    ).not.toEqual(
      makeRun(
        'accidental',
        20,
        mulberry32(
          4,
        ),
      ),
    );
  });

  it('never asks the same prompt twice in a row', () => {
    const run =
      makeRun(
        'note',
        500,
        mulberry32(
          11,
        ),
      );
    expect(
      run,
    ).toHaveLength(
      500,
    );
    for (
      let i = 1;
      i <
      run.length;
      i++
    )
      expect(
        run[
          i
        ],
      ).not.toEqual(
        run[
          i -
            1
        ],
      );
  });
});

describe('the daily run', () => {
  it('utcDate is the UTC calendar day', () => {
    expect(
      utcDate(
        Date.UTC(
          2026,
          10,
          9,
          0,
          0,
          0,
        ),
      ),
    ).toBe(
      '2026-11-09',
    );
    expect(
      utcDate(
        Date.UTC(
          2026,
          10,
          9,
          23,
          59,
          59,
          999,
        ),
      ),
    ).toBe(
      '2026-11-09',
    );
    expect(
      utcDate(
        Date.UTC(
          2026,
          10,
          10,
        ),
      ),
    ).toBe(
      '2026-11-10',
    );
    expect(
      utcDate(
        Date.UTC(
          2027,
          0,
          1,
          5,
        ),
      ),
    ).toBe(
      '2027-01-01',
    );
  });

  it('dailySeed is FNV-1a of the date, and rejects anything else', () => {
    // FNV-1a 32-bit of "2026-11-09", pinned: changing it changes every player's daily run.
    expect(
      dailySeed(
        '2026-11-09',
      ),
    ).toBe(
      2032021012,
    );
    expect(
      dailySeed(
        '2026-11-09',
      ),
    ).not.toBe(
      dailySeed(
        '2026-11-10',
      ),
    );
    expect(
      () =>
        dailySeed(
          '09/11/2026',
        ),
    ).toThrow(
      RangeError,
    );
    expect(
      () =>
        dailySeed(
          '2026-13-01',
        ),
    ).toThrow(
      RangeError,
    );
  });

  it('is 6 levels × 5 prompts, escalating in the fixed order', () => {
    const run =
      dailyRun(
        '2026-11-09',
      );
    expect(
      run,
    ).toHaveLength(
      30,
    );
    const levels =
      run.map(
        (
          p,
        ) =>
          p.level,
      );
    for (
      let i = 0;
      i <
      DAILY_LEVELS.length;
      i++
    ) {
      expect(
        levels.slice(
          i *
            5,
          i *
            5 +
            5,
        ),
      ).toEqual(
        Array(
          5,
        ).fill(
          DAILY_LEVELS[
            i
          ],
        ),
      );
    }
  });

  it('is the same for everyone on a date, different the next day', () => {
    expect(
      dailyRun(
        '2026-11-09',
      ),
    ).toEqual(
      dailyRun(
        '2026-11-09',
      ),
    );
    expect(
      dailyRun(
        '2026-11-09',
      ),
    ).not.toEqual(
      dailyRun(
        '2026-11-10',
      ),
    );
  });
});

describe('promptPoints', () => {
  it('100 at or under par, linear to 0 at 4× par, 0 when wrong', () => {
    expect(
      promptPoints(
        'note',
        0,
        true,
      ),
    ).toBe(
      100,
    );
    expect(
      promptPoints(
        'note',
        1200,
        true,
      ),
    ).toBe(
      100,
    );
    expect(
      promptPoints(
        'note',
        1200 +
          1800,
        true,
      ),
    ).toBe(
      50,
    );
    expect(
      promptPoints(
        'note',
        4800,
        true,
      ),
    ).toBe(
      0,
    );
    expect(
      promptPoints(
        'note',
        9000,
        true,
      ),
    ).toBe(
      0,
    );
    expect(
      promptPoints(
        'note',
        500,
        false,
      ),
    ).toBe(
      0,
    );
    expect(
      promptPoints(
        'bar',
        2000 +
          2100,
        true,
        4,
      ),
    ).toBe(
      100,
    );
    expect(
      promptPoints(
        'chord',
        2400 *
          2.5,
        true,
      ),
    ).toBe(
      50,
    );
  });

  it('a nonsense time scores 0', () => {
    expect(
      promptPoints(
        'note',
        Number.NaN,
        true,
      ),
    ).toBe(
      0,
    );
    expect(
      promptPoints(
        'note',
        -5,
        true,
      ),
    ).toBe(
      0,
    );
    expect(
      promptPoints(
        'note',
        Number.POSITIVE_INFINITY,
        true,
      ),
    ).toBe(
      0,
    );
  });
});

describe('summarizeRun', () => {
  const r =
    (
      over: Partial<PromptResult>,
    ): PromptResult => ({
      level:
        'note',
      kind: 'note',
      correct: true,
      ms: 1000,
      noteMs:
        [
          1000,
        ],
      points: 100,
      skipped: false,
      ...over,
    });

  it('scores the mean of the played prompts, stars by starsFor, mean time of the right ones', () => {
    const s =
      summarizeRun(
        [
          r(
            {},
          ),
          r(
            {
              points: 50,
              ms: 3000,
            },
          ),
          r(
            {
              correct: false,
              points: 0,
              ms: 400,
            },
          ),
        ],
      );
    expect(
      s.score,
    ).toBe(
      50,
    );
    expect(
      s.stars,
    ).toBe(
      0,
    );
    expect(
      s.correct,
    ).toBe(
      2,
    );
    expect(
      s.played,
    ).toBe(
      3,
    );
    expect(
      s.skipped,
    ).toBe(
      0,
    );
    expect(
      s.avgMs,
    ).toBe(
      2000,
    );
  });

  it('leaves skipped prompts out of the score', () => {
    const s =
      summarizeRun(
        [
          r(
            {},
          ),
          r(
            {
              skipped: true,
              correct: false,
              points: 0,
              ms: null,
              noteMs:
                [],
            },
          ),
        ],
      );
    expect(
      s.score,
    ).toBe(
      100,
    );
    expect(
      s.stars,
    ).toBe(
      3,
    );
    expect(
      s.played,
    ).toBe(
      1,
    );
    expect(
      s.skipped,
    ).toBe(
      1,
    );
  });

  it('nothing played: score 0 and no average time', () => {
    expect(
      summarizeRun(
        [],
      ),
    ).toEqual(
      {
        score: 0,
        stars: 0,
        correct: 0,
        played: 0,
        skipped: 0,
        avgMs:
          null,
      },
    );
  });
});

describe('guitar reads the treble staff only', () => {
  it('the daily run is the same prompts for everyone, drawn on treble for guitar', () => {
    const piano =
      dailyRun(
        '2026-11-09',
      );
    const guitar =
      dailyRun(
        '2026-11-09',
        'guitar',
      );
    expect(
      guitar,
    ).toHaveLength(
      piano.length,
    );
    expect(
      guitar.every(
        (
          p,
        ) =>
          p.clef ===
          'treble',
      ),
    ).toBe(
      true,
    );
    for (
      let i = 0;
      i <
      piano.length;
      i++
    ) {
      const p =
        piano[
          i
        ]!;
      const g =
        guitar[
          i
        ]!;
      expect(
        g.level,
      ).toBe(
        p.level,
      );
      // A bass prompt sounds the same pitches on guitar (written an octave up on the treble
      // staff); a treble prompt is the same page, sounding an octave lower as guitar music does.
      if (
        p.clef ===
        'bass'
      )
        expect(
          promptMidis(
            g,
            'guitar',
          ),
        ).toEqual(
          promptMidis(
            p,
            'piano',
          ),
        );
      else
        expect(
          g,
        ).toEqual(
          p,
        );
      for (const s of stepsOf(
        g,
      )) {
        expect(
          s,
        ).toBeGreaterThanOrEqual(
          CARD_LOW_MIN_STEP,
        );
        expect(
          s,
        ).toBeLessThanOrEqual(
          SPRINT_MAX_STEP,
        );
      }
    }
    expect(
      piano.some(
        (
          p,
        ) =>
          p.clef ===
          'bass',
      ),
    ).toBe(
      true,
    );
  });

  it('freeplay for guitar never uses the bass staff', () => {
    for (const level of SPRINT_LEVELS) {
      const run =
        makeRun(
          level.id,
          100,
          mulberry32(
            9,
          ),
          'guitar',
        );
      expect(
        run.every(
          (
            p,
          ) =>
            p.clef ===
            'treble',
        ),
      ).toBe(
        true,
      );
    }
  });
});
