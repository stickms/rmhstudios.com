import {
  describe,
  expect,
  it,
} from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import { SPRINT_LEVELS } from './sprint/levels';
import { makeRun } from './sprint/generate';
import {
  BAR_X,
  CARD_H,
  CARD_LOW_H,
  CARD_LOW_MIN_STEP,
  CARD_NOTE_X,
  CARD_TOP,
  CARD_W,
  HEAD_RX,
  cardLayout,
  sheetLayout,
} from './staff-card-layout';

const n =
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

describe('sheet layout (the sight reading game)', () => {
  it('draws one natural exactly where the flashcard draws it', () => {
    for (const midi of [
      60,
      64,
      67,
      72,
      77,
      81,
    ]) {
      const sheet =
        sheetLayout(
          'treble',
          [
            n(
              midi,
            ),
          ],
          'chord',
        );
      const card =
        cardLayout(
          'treble',
          midi,
        );
      expect(
        sheet.heads,
      ).toEqual(
        [
          {
            x: CARD_NOTE_X,
            y: card.noteY,
            step: card.step,
          },
        ],
      );
      expect(
        sheet.stems,
      ).toEqual(
        [
          card.stem,
        ],
      );
      expect(
        sheet.ledgers.map(
          (
            l,
          ) =>
            l.y,
        ),
      ).toEqual(
        card.ledgerYs,
      );
      expect(
        sheet.accidentals,
      ).toEqual(
        [],
      );
      expect(
        sheet.now,
      ).toBeNull();
    }
  });

  it('prints a sharp or a flat to the left of its note, on its line', () => {
    const sharp =
      sheetLayout(
        'treble',
        [
          n(
            65,
            1,
          ),
        ],
        'chord',
      );
    expect(
      sharp.accidentals,
    ).toHaveLength(
      1,
    );
    expect(
      sharp
        .accidentals[0]
        ?.kind,
    ).toBe(
      'sharp',
    );
    expect(
      sharp
        .accidentals[0]
        ?.y,
    ).toBe(
      sharp
        .heads[0]
        ?.y,
    );
    expect(
      sharp
        .accidentals[0]!
        .x,
    ).toBeLessThan(
      CARD_NOTE_X -
        HEAD_RX,
    );
    const flat =
      sheetLayout(
        'bass',
        [
          n(
            52,
            -1,
          ),
        ],
        'chord',
      );
    expect(
      flat
        .accidentals[0]
        ?.kind,
    ).toBe(
      'flat',
    );
  });

  it('stacks a triad on one stem', () => {
    const s =
      sheetLayout(
        'treble',
        [
          n(
            60,
          ),
          n(
            64,
          ),
          n(
            67,
          ),
        ],
        'chord',
      );
    expect(
      s.heads.map(
        (
          h,
        ) =>
          h.x,
      ),
    ).toEqual(
      [
        CARD_NOTE_X,
        CARD_NOTE_X,
        CARD_NOTE_X,
      ],
    );
    expect(
      s.stems,
    ).toHaveLength(
      1,
    );
    const ys =
      s.heads.map(
        (
          h,
        ) =>
          h.y,
      );
    const stem =
      s
        .stems[0]!;
    // Stem up (the chord sits low): from the lowest head past the highest.
    expect(
      stem.y1,
    ).toBeGreaterThan(
      Math.max(
        ...ys,
      ) -
        2,
    );
    expect(
      stem.y2,
    ).toBeLessThan(
      Math.min(
        ...ys,
      ),
    );
  });

  it('offsets the upper note of a second to the right of an up stem', () => {
    const s =
      sheetLayout(
        'treble',
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
        ],
        'chord',
      );
    expect(
      s.heads.map(
        (
          h,
        ) =>
          h.x >
          CARD_NOTE_X,
      ),
    ).toEqual(
      [
        false,
        true,
        false,
      ],
    );
    // Its ledger line reaches under the offset head too.
    const c4 =
      s.ledgers.find(
        (
          l,
        ) =>
          Math.abs(
            l.y -
              s
                .heads[0]!
                .y,
          ) <
          0.01,
      );
    expect(
      c4,
    ).toBeDefined();
  });

  it('offsets the lower note of a second to the left of a down stem', () => {
    const s =
      sheetLayout(
        'treble',
        [
          n(
            76,
          ),
          n(
            77,
          ),
        ],
        'chord',
      );
    expect(
      s.heads.map(
        (
          h,
        ) =>
          h.x <
          CARD_NOTE_X,
      ),
    ).toEqual(
      [
        true,
        false,
      ],
    );
  });

  it('staggers accidentals that would touch', () => {
    const s =
      sheetLayout(
        'treble',
        [
          n(
            64,
            -1,
          ),
          n(
            67,
            -1,
          ),
          n(
            71,
            -1,
          ),
        ],
        'chord',
      );
    const xs =
      s.accidentals.map(
        (
          a,
        ) =>
          a.x,
      );
    expect(
      new Set(
        xs,
      )
        .size,
    ).toBeGreaterThan(
      1,
    );
    // Columns far enough apart that a sharp (9.2 units wide, plus its stroke) never touches the next.
    const cols =
      [
        ...new Set(
          xs,
        ),
      ].sort(
        (
          a,
          b,
        ) =>
          a -
          b,
      );
    for (
      let i = 1;
      i <
      cols.length;
      i++
    )
      expect(
        cols[
          i
        ]! -
          cols[
            i -
              1
          ]!,
      ).toBeGreaterThanOrEqual(
        11,
      );
    // Far apart ones share a column.
    const far =
      sheetLayout(
        'treble',
        [
          n(
            60,
            1,
          ),
          n(
            72,
            1,
          ),
        ],
        'chord',
      );
    expect(
      new Set(
        far.accidentals.map(
          (
            a,
          ) =>
            a.x,
        ),
      )
        .size,
    ).toBe(
      1,
    );
  });

  it('draws a bar as notes left to right, each with its stem, and a now mark', () => {
    const s =
      sheetLayout(
        'treble',
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
        ],
        'bar',
        2,
      );
    expect(
      s.heads.map(
        (
          h,
        ) =>
          h.x,
      ),
    ).toEqual(
      [
        ...BAR_X,
      ],
    );
    expect(
      s.stems,
    ).toHaveLength(
      4,
    );
    expect(
      s
        .now
        ?.x,
    ).toBe(
      BAR_X[2],
    );
    expect(
      sheetLayout(
        'treble',
        [
          n(
            60,
          ),
          n(
            62,
          ),
        ],
        'bar',
      )
        .now,
    ).toBeNull();
  });

  it.each(
    [
      [
        'piano',
        CARD_H,
        undefined,
      ],
      [
        'guitar',
        CARD_LOW_H,
        CARD_LOW_MIN_STEP,
      ],
    ] as const,
  )(
    'fits every %s sprint prompt inside its card box (one height per sheet)',
    (
      instrument,
      h,
      minStep,
    ) => {
      for (const level of SPRINT_LEVELS) {
        for (const p of makeRun(
          level.id,
          300,
          mulberry32(
            5,
          ),
          instrument,
        )) {
          const s =
            sheetLayout(
              p.clef,
              p.notes,
              p.kind ===
                'bar'
                ? 'bar'
                : 'chord',
              p.kind ===
                'bar'
                ? 3
                : undefined,
              minStep,
            );
          // Nothing is clamped: every note lands on its own step.
          expect(
            s.heads.every(
              (
                hd,
              ) =>
                hd.step >=
                (minStep ??
                  -4),
            ),
          ).toBe(
            true,
          );
          const ys =
            [
              ...s.heads.map(
                (
                  hd,
                ) =>
                  hd.y,
              ),
              ...s.stems.flatMap(
                (
                  t,
                ) => [
                  t.y1,
                  t.y2,
                ],
              ),
              ...s.accidentals.flatMap(
                (
                  a,
                ) => [
                  a.y -
                    12,
                  a.y +
                    10,
                ],
              ),
            ];
          for (const y of ys) {
            expect(
              y,
            ).toBeGreaterThanOrEqual(
              0,
            );
            expect(
              y,
            ).toBeLessThanOrEqual(
              h,
            );
          }
          // The now mark sits above the staff, clear of every note and stem.
          if (
            s.now
          ) {
            expect(
              s
                .now
                .y -
                5,
            ).toBeGreaterThanOrEqual(
              0,
            );
            expect(
              s
                .now
                .y,
            ).toBeLessThan(
              CARD_TOP -
                15,
            );
            expect(
              Math.min(
                ...ys,
              ),
            ).toBeGreaterThan(
              s
                .now
                .y +
                1,
            );
          }
          const xs =
            [
              ...s.heads.map(
                (
                  h,
                ) =>
                  h.x,
              ),
              ...s.accidentals.map(
                (
                  a,
                ) =>
                  a.x,
              ),
            ];
          for (const x of xs) {
            expect(
              x,
            ).toBeGreaterThan(
              46,
            );
            expect(
              x,
            ).toBeLessThan(
              CARD_W -
                4,
            );
          }
        }
      }
    },
  );
});
