import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  FINGER_OF,
  KEYBOARD_LAYOUT,
  LESSONS,
  UNITS,
  drillFor,
  fingerFor,
  lessonById,
  recommendedNext,
  shiftFingerFor,
  starsFor,
} from '@/lib/rmhtype/lessons';

const SEEDS =
  [
    0,
    1,
    42,
    2024,
    0xffffffff,
  ];
const stars =
  (
    n: number,
  ) =>
    new Map(
      [
        [
          `l${String(n).padStart(2, '0')}`,
          {
            stars: 1,
          },
        ],
      ],
    );

describe('curriculum', () => {
  it('has six units and about two dozen lessons, a review ending each unit', () => {
    expect(
      UNITS,
    ).toHaveLength(
      6,
    );
    expect(
      LESSONS.length,
    ).toBeGreaterThanOrEqual(
      22,
    );
    expect(
      LESSONS.length,
    ).toBeLessThanOrEqual(
      28,
    );
    for (const unit of UNITS) {
      expect(
        lessonById(
          unit.lessonIds.at(
            -1,
          ) as string,
        )
          ?.review,
      ).toBe(
        true,
      );
    }
  });

  it('introduces every key the course covers in exactly one lesson', () => {
    const introduced =
      LESSONS.flatMap(
        (
          lesson,
        ) =>
          lesson.newKeys,
      );
    expect(
      new Set(
        introduced,
      )
        .size,
    ).toBe(
      introduced.length,
    );
    const expected =
      [
        ...'abcdefghijklmnopqrstuvwxyz',
        ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        ...'0123456789',
        ...';,./\'"-?!:()',
      ];
    expect(
      [
        ...introduced,
      ].sort(),
    ).toEqual(
      [
        ...expected,
      ].sort(),
    );
  });

  it('puts the keyboard drawing and the finger map in step with the course', () => {
    for (const key of KEYBOARD_LAYOUT.join(
      '',
    ))
      expect(
        fingerFor(
          key,
        ),
      ).not.toBeNull();
    for (const lesson of LESSONS) {
      for (const key of lesson.allowedKeys)
        expect(
          FINGER_OF[
            key
          ],
          key,
        ).toBeDefined();
    }
  });

  it('names Shift on the opposite hand', () => {
    expect(
      shiftFingerFor(
        'A',
      ),
    ).toBe(
      'right-pinky',
    );
    expect(
      shiftFingerFor(
        'J',
      ),
    ).toBe(
      'left-pinky',
    );
    expect(
      shiftFingerFor(
        '?',
      ),
    ).toBe(
      'left-pinky',
    );
    expect(
      shiftFingerFor(
        'a',
      ),
    ).toBeNull();
    expect(
      fingerFor(
        'A',
      ),
    ).toBe(
      'left-pinky',
    );
  });

  it('has ascending star targets and allowed keys that only grow', () => {
    let previous = 0;
    for (const lesson of LESSONS) {
      const [
        one,
        two,
        three,
      ] =
        lesson
          .targets
          .wpm;
      expect(
        one,
      ).toBeLessThan(
        two,
      );
      expect(
        two,
      ).toBeLessThan(
        three,
      );
      expect(
        lesson
          .allowedKeys
          .length,
      ).toBeGreaterThanOrEqual(
        previous,
      );
      previous =
        lesson
          .allowedKeys
          .length;
      for (const key of lesson.newKeys)
        expect(
          lesson.allowedKeys,
        ).toContain(
          key,
        );
    }
  });
});

describe('drillFor', () => {
  it('uses only the allowed keys and spaces, with every new key present', () => {
    for (const lesson of LESSONS) {
      for (const seed of SEEDS) {
        const text =
          drillFor(
            lesson,
            seed,
          );
        const allowed =
          new Set(
            [
              ...lesson.allowedKeys,
              ' ',
            ],
          );
        for (const char of text)
          expect(
            allowed.has(
              char,
            ),
            `${lesson.id} ${char}`,
          ).toBe(
            true,
          );
        for (const key of lesson.newKeys)
          expect(
            text,
            `${lesson.id} ${key}`,
          ).toContain(
            key,
          );
        expect(
          text,
        ).toBe(
          text.trim(),
        );
        expect(
          text,
        ).not.toContain(
          '  ',
        );
      }
    }
  });

  it('gives lesson 1 only f, j and spaces', () => {
    const first =
      LESSONS[0]!;
    const text =
      drillFor(
        first,
        7,
      );
    expect(
      text.replace(
        / /g,
        '',
      ),
    ).toMatch(
      /^[fj]+$/,
    );
  });

  it('is deterministic per seed and varies between seeds', () => {
    for (const lesson of LESSONS) {
      expect(
        drillFor(
          lesson,
          9,
        ),
      ).toBe(
        drillFor(
          lesson,
          9,
        ),
      );
    }
    const lesson =
      lessonById(
        'l06',
      )!;
    expect(
      drillFor(
        lesson,
        1,
      ),
    ).not.toBe(
      drillFor(
        lesson,
        2,
      ),
    );
  });

  it('moves on to real words and phrases once enough letters exist', () => {
    const text =
      drillFor(
        lessonById(
          'l11',
        )!,
        3,
      );
    expect(
      text
        .split(
          ' ',
        )
        .filter(
          (
            w,
          ) =>
            w.length >=
            3,
        )
        .length,
    ).toBeGreaterThan(
      5,
    );
  });

  it('teaches the punctuation and digits a lesson introduces inside phrases', () => {
    expect(
      drillFor(
        lessonById(
          'l20',
        )!,
        5,
      ),
    ).toMatch(
      /[0-9]/,
    );
    expect(
      drillFor(
        lessonById(
          'l24',
        )!,
        5,
      ),
    ).toMatch(
      /[?!:()]/,
    );
  });
});

describe('starsFor', () => {
  it('gives nothing below the accuracy gate and one star per speed target above it', () => {
    const lesson =
      LESSONS[0]!;
    const [
      one,
      two,
      three,
    ] =
      lesson
        .targets
        .wpm;
    expect(
      starsFor(
        100,
        lesson
          .targets
          .accuracy -
          0.1,
        lesson,
      ),
    ).toBe(
      0,
    );
    expect(
      starsFor(
        one -
          1,
        100,
        lesson,
      ),
    ).toBe(
      0,
    );
    expect(
      starsFor(
        one,
        lesson
          .targets
          .accuracy,
        lesson,
      ),
    ).toBe(
      1,
    );
    expect(
      starsFor(
        two,
        100,
        lesson,
      ),
    ).toBe(
      2,
    );
    expect(
      starsFor(
        three,
        100,
        lesson,
      ),
    ).toBe(
      3,
    );
  });

  it('is monotonic in speed and in accuracy', () => {
    for (const lesson of LESSONS) {
      let last = 0;
      for (
        let wpm = 0;
        wpm <=
        60;
        wpm += 1
      ) {
        const value =
          starsFor(
            wpm,
            100,
            lesson,
          );
        expect(
          value,
        ).toBeGreaterThanOrEqual(
          last,
        );
        last =
          value;
      }
      last = 0;
      for (
        let accuracy = 0;
        accuracy <=
        100;
        accuracy += 1
      ) {
        const value =
          starsFor(
            60,
            accuracy,
            lesson,
          );
        expect(
          value,
        ).toBeGreaterThanOrEqual(
          last,
        );
        last =
          value;
      }
    }
  });

  it('treats a non-finite number as no stars', () => {
    expect(
      starsFor(
        Number.NaN,
        100,
        LESSONS[0]!,
      ),
    ).toBe(
      0,
    );
  });
});

describe('recommendedNext', () => {
  it('recommends lesson 1 to a new member', () => {
    expect(
      recommendedNext(
        new Map(),
      ),
    ).toBe(
      'l01',
    );
  });

  it('moves to the first lesson without a star, wherever the gaps are', () => {
    expect(
      recommendedNext(
        stars(
          1,
        ),
      ),
    ).toBe(
      'l02',
    );
    const skipped =
      new Map(
        LESSONS.filter(
          (
            l,
          ) =>
            l.n !==
            3,
        ).map(
          (
            l,
          ) => [
            l.id,
            {
              stars: 1,
            },
          ],
        ),
      );
    expect(
      recommendedNext(
        skipped,
      ),
    ).toBe(
      'l03',
    );
  });

  it('then recommends lessons short of three stars, and null at the end', () => {
    const done =
      new Map(
        LESSONS.map(
          (
            l,
          ) => [
            l.id,
            {
              stars: 1,
            },
          ],
        ),
      );
    expect(
      recommendedNext(
        done,
      ),
    ).toBe(
      'l01',
    );
    const mastered =
      new Map(
        LESSONS.map(
          (
            l,
          ) => [
            l.id,
            {
              stars: 3,
            },
          ],
        ),
      );
    expect(
      recommendedNext(
        mastered,
      ),
    ).toBeNull();
  });
});
