import {
  describe,
  expect,
  it,
} from 'vitest';
import { mulberry32 } from '@/lib/core/rng';
import type { CardRow } from '../content/practice';
import {
  BIAS_SHARE,
  dealRun,
} from './deal';
import {
  makeRun,
  type SprintPrompt,
} from './generate';
import { itemIdOf } from './reviews';
import type { SprintLevelId } from './levels';

const NOW =
  Date.UTC(
    2026,
    10,
    22,
    12,
  );
const DAY = 86_400_000;

const row =
  (
    cardId: string,
    dueInDays: number,
    reps = 3,
  ): CardRow => ({
    cardId,
    due: new Date(
      NOW +
        dueInDays *
          DAY,
    ).toISOString(),
    lastReviewAt:
      new Date(
        NOW +
          (dueInDays -
            4) *
            DAY,
      ).toISOString(),
    stability: 4,
    difficulty: 5,
    reps,
    lapses: 0,
  });

const deal =
  (
    level: SprintLevelId,
    seed: number,
    rows: CardRow[],
  ) =>
    dealRun(
      level,
      20,
      mulberry32(
        seed,
      ),
      'piano',
      undefined,
      rows,
      NOW,
    );
const ids =
  (
    ps: SprintPrompt[],
  ) =>
    ps.map(
      (
        p,
      ) =>
        itemIdOf(
          p,
        ),
    );

describe('dealRun', () => {
  it('is exactly makeRun with no stored Sprint item', () => {
    for (const level of [
      'note',
      'note-both',
      'accidental',
      'triad',
      'inversion',
      'bar',
    ] as const) {
      expect(
        deal(
          level,
          7,
          [],
        ),
      ).toEqual(
        makeRun(
          level,
          20,
          mulberry32(
            7,
          ),
          'piano',
        ),
      );
    }
    // Practice's own staff cards are not Sprint items.
    expect(
      deal(
        'note',
        7,
        [
          row(
            'treble:64',
            -1,
          ),
        ],
      ),
    ).toEqual(
      makeRun(
        'note',
        20,
        mulberry32(
          7,
        ),
        'piano',
      ),
    );
  });

  it('is deterministic: the same seed and cards deal the same run', () => {
    const rows =
      [
        row(
          'sprint:note:treble:64:0',
          -3,
        ),
        row(
          'sprint:note:treble:67:0',
          -1,
        ),
      ];
    expect(
      deal(
        'note',
        11,
        rows,
      ),
    ).toEqual(
      deal(
        'note',
        11,
        rows,
      ),
    );
    expect(
      deal(
        'note',
        11,
        rows,
      ),
    ).not.toEqual(
      deal(
        'note',
        12,
        rows,
      ),
    );
  });

  it('puts the due items in the run, most overdue among them, and keeps its length', () => {
    const due =
      [
        'sprint:note:treble:64:0',
        'sprint:note:treble:67:0',
        'sprint:note:treble:72:0',
      ];
    const rows =
      due.map(
        (
          id,
          i,
        ) =>
          row(
            id,
            -(
              i +
              1
            ),
          ),
      );
    for (
      let seed = 1;
      seed <=
      25;
      seed++
    ) {
      const run =
        deal(
          'note',
          seed,
          rows,
        );
      expect(
        run,
      ).toHaveLength(
        20,
      );
      for (const id of due)
        expect(
          ids(
            run,
          ),
        ).toContain(
          id,
        );
    }
  });

  it('leaves a remembered, not-yet-due item out of the bias', () => {
    const rows =
      [
        row(
          'sprint:note:treble:64:0',
          +30,
        ),
      ];
    let appearances = 0;
    let plain = 0;
    for (
      let seed = 1;
      seed <=
      40;
      seed++
    ) {
      appearances +=
        ids(
          deal(
            'note',
            seed,
            rows,
          ),
        ).filter(
          (
            i,
          ) =>
            i ===
            'sprint:note:treble:64:0',
        ).length;
      plain +=
        ids(
          makeRun(
            'note',
            20,
            mulberry32(
              seed,
            ),
            'piano',
          ),
        ).filter(
          (
            i,
          ) =>
            i ===
            'sprint:note:treble:64:0',
        ).length;
    }
    // It may still turn up as today's dealing has it, but never more often than that.
    expect(
      appearances,
    ).toBeLessThanOrEqual(
      plain,
    );
  });

  it('biases at most its share of a run toward what is due or new', () => {
    const rows =
      Array.from(
        {
          length: 12,
        },
        (
          _,
          i,
        ) =>
          row(
            `sprint:note:treble:${[60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79][i]}:0`,
            -2,
          ),
      );
    const run =
      deal(
        'note',
        3,
        rows,
      );
    expect(
      run,
    ).toHaveLength(
      20,
    );
    expect(
      new Set(
        ids(
          run,
        ).filter(
          (
            i,
          ) =>
            rows.some(
              (
                r,
              ) =>
                r.cardId ===
                i,
            ),
        ),
      )
        .size,
    ).toBeGreaterThanOrEqual(
      Math.floor(
        20 *
          BIAS_SHARE,
      ),
    );
  });

  it('never repeats a prompt back to back, and stays inside the level', () => {
    const rows =
      [
        row(
          'sprint:note:treble:64:0',
          -2,
        ),
      ];
    for (
      let seed = 1;
      seed <=
      60;
      seed++
    ) {
      const run =
        deal(
          'note',
          seed,
          rows,
        );
      run.forEach(
        (
          p,
          i,
        ) => {
          expect(
            p.level,
          ).toBe(
            'note',
          );
          expect(
            p.clef,
          ).toBe(
            'treble',
          );
          if (
            i >
            0
          )
            expect(
              JSON.stringify(
                p.notes,
              ) +
                p.clef,
            ).not.toBe(
              JSON.stringify(
                run[
                  i -
                    1
                ]!
                  .notes,
              ) +
                run[
                  i -
                    1
                ]!
                  .clef,
            );
        },
      );
    }
  });

  it('deals a level with no items (the bar) as makeRun does', () => {
    expect(
      deal(
        'bar',
        5,
        [
          row(
            'sprint:note:treble:64:0',
            -1,
          ),
        ],
      ),
    ).toEqual(
      makeRun(
        'bar',
        20,
        mulberry32(
          5,
        ),
        'piano',
      ),
    );
  });

  it('keeps a triad level to triads, due ones included', () => {
    const rows =
      [
        row(
          'sprint:chord:treble:60:major',
          -2,
        ),
      ];
    const run =
      deal(
        'triad',
        9,
        rows,
      );
    expect(
      run.every(
        (
          p,
        ) =>
          p.kind ===
          'chord',
      ),
    ).toBe(
      true,
    );
  });
});
