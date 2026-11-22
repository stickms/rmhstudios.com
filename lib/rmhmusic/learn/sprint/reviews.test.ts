import {
  describe,
  expect,
  it,
} from 'vitest';
import { MAX_REVIEWS_PER_BATCH } from '../schemas';
import { isKnownItemId } from '../srs/items';
import type { SprintPrompt } from './generate';
import {
  itemIdOf,
  reviewsOfRun,
} from './reviews';
import type { PromptResult } from './scoring';

const n =
  (
    written: number,
    accidental:
      | -1
      | 0
      | 1 = 0,
    clef:
      | 'treble'
      | 'bass' = 'treble',
  ): SprintPrompt => ({
    level:
      'note',
    kind: accidental
      ? 'accidental'
      : 'note',
    clef,
    notes:
      [
        {
          written,
          accidental,
        },
      ],
  });
const triad =
  (
    notes: [
      number,
      number,
      (
        | -1
        | 0
        | 1
      ),
    ][],
  ): SprintPrompt => ({
    level:
      'triad',
    kind: 'chord',
    clef: 'treble',
    notes:
      notes.map(
        ([
          written,
          ,
          accidental,
        ]) => ({
          written,
          accidental,
        }),
      ),
  });
const res =
  (
    correct: boolean,
    ms:
      | number
      | null,
    extra: Partial<PromptResult> = {},
  ): PromptResult => ({
    level:
      'note',
    kind: 'note',
    correct,
    ms,
    noteMs:
      [],
    points:
      correct
        ? 100
        : 0,
    skipped: false,
    ...extra,
  });

describe('itemIdOf', () => {
  it('makes a valid item id for notes, accidentals and triads, and none for a bar', () => {
    const ids =
      [
        itemIdOf(
          n(
            64,
          ),
        ),
        itemIdOf(
          n(
            69,
            -1,
            'bass',
          ),
        ),
        itemIdOf(
          triad(
            [
              [
                60,
                0,
                0,
              ],
              [
                64,
                0,
                0,
              ],
              [
                67,
                0,
                0,
              ],
            ],
          ),
        ),
        itemIdOf(
          triad(
            [
              [
                60,
                0,
                0,
              ],
              [
                64,
                0,
                -1,
              ],
              [
                67,
                0,
                0,
              ],
            ],
          ),
        ),
      ];
    expect(
      ids,
    ).toEqual(
      [
        'sprint:note:treble:64:0',
        'sprint:note:bass:69:-1',
        'sprint:chord:treble:60:major',
        'sprint:chord:treble:60:minor',
      ],
    );
    for (const id of ids)
      expect(
        isKnownItemId(
          id!,
        ),
      ).toBe(
        true,
      );
    expect(
      itemIdOf(
        {
          level:
            'bar',
          kind: 'bar',
          clef: 'treble',
          notes:
            [
              64,
              65,
              67,
              69,
            ].map(
              (
                w,
              ) => ({
                written:
                  w,
                accidental:
                  0 as const,
              }),
            ),
        },
      ),
    ).toBeNull();
  });

  it('tells an inversion from the root position by its lowest written note', () => {
    const root =
      itemIdOf(
        triad(
          [
            [
              60,
              0,
              0,
            ],
            [
              64,
              0,
              0,
            ],
            [
              67,
              0,
              0,
            ],
          ],
        ),
      );
    const first =
      itemIdOf(
        triad(
          [
            [
              64,
              0,
              0,
            ],
            [
              67,
              0,
              0,
            ],
            [
              72,
              0,
              0,
            ],
          ],
        ),
      );
    expect(
      first,
    ).not.toBe(
      root,
    );
  });
});

describe('reviewsOfRun', () => {
  it('grades each prompt from its first attempt and its speed', () => {
    const prompts =
      [
        n(
          60,
        ),
        n(
          62,
        ),
        n(
          64,
        ),
        n(
          65,
        ),
      ];
    const results =
      [
        res(
          true,
          900,
        ),
        res(
          true,
          3000,
        ),
        res(
          true,
          6000,
        ),
        res(
          false,
          800,
        ),
      ];
    expect(
      reviewsOfRun(
        prompts,
        results,
      ),
    ).toEqual(
      [
        {
          cardId:
            'sprint:note:treble:60:0',
          grade:
            'easy',
        },
        {
          cardId:
            'sprint:note:treble:62:0',
          grade:
            'good',
        },
        {
          cardId:
            'sprint:note:treble:64:0',
          grade:
            'hard',
        },
        {
          cardId:
            'sprint:note:treble:65:0',
          grade:
            'again',
        },
      ],
    );
  });

  it('skips skipped prompts, bars and prompts never reached', () => {
    const bar: SprintPrompt =
      {
        level:
          'bar',
        kind: 'bar',
        clef: 'treble',
        notes:
          [
            64,
            65,
            67,
            69,
          ].map(
            (
              w,
            ) => ({
              written:
                w,
              accidental:
                0 as const,
            }),
          ),
      };
    const prompts =
      [
        triad(
          [
            [
              60,
              0,
              0,
            ],
            [
              64,
              0,
              0,
            ],
            [
              67,
              0,
              0,
            ],
          ],
        ),
        bar,
        n(
          60,
        ),
        n(
          62,
        ),
      ];
    const results =
      [
        res(
          false,
          null,
          {
            skipped: true,
            kind: 'chord',
          },
        ),
        res(
          true,
          2000,
          {
            kind: 'bar',
          },
        ),
        res(
          true,
          1000,
        ),
      ];
    expect(
      reviewsOfRun(
        prompts,
        results,
      ),
    ).toEqual(
      [
        {
          cardId:
            'sprint:note:treble:60:0',
          grade:
            'easy',
        },
      ],
    );
  });

  it('keeps the worse grade when an item comes up twice', () => {
    const prompts =
      [
        n(
          60,
        ),
        n(
          62,
        ),
        n(
          60,
        ),
      ];
    const results =
      [
        res(
          true,
          900,
        ),
        res(
          true,
          900,
        ),
        res(
          false,
          900,
        ),
      ];
    expect(
      reviewsOfRun(
        prompts,
        results,
      ),
    ).toEqual(
      [
        {
          cardId:
            'sprint:note:treble:60:0',
          grade:
            'again',
        },
        {
          cardId:
            'sprint:note:treble:62:0',
          grade:
            'easy',
        },
      ],
    );
  });

  it('never exceeds the batch limit', () => {
    const naturals =
      Array.from(
        {
          length: 88,
        },
        (
          _,
          i,
        ) =>
          21 +
          i,
      ).filter(
        (
          m,
        ) =>
          [
            0,
            2,
            4,
            5,
            7,
            9,
            11,
          ].includes(
            m %
              12,
          ),
      );
    const prompts =
      [
        ...naturals.map(
          (
            m,
          ) =>
            n(
              m,
            ),
        ),
        ...naturals.map(
          (
            m,
          ) =>
            n(
              m,
              0,
              'bass',
            ),
        ),
      ];
    const results =
      prompts.map(
        () =>
          res(
            true,
            1000,
          ),
      );
    expect(
      prompts.length,
    ).toBeGreaterThan(
      MAX_REVIEWS_PER_BATCH,
    );
    expect(
      reviewsOfRun(
        prompts,
        results,
      ),
    ).toHaveLength(
      MAX_REVIEWS_PER_BATCH,
    );
  });
});
