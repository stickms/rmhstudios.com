import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  findInPage,
  joinHyphenated,
  normalise,
  snippet,
  toParagraphOffset,
  type FindOptions,
} from '../find';

const DEFAULTS: FindOptions =
  {
    matchCase: false,
    wholeWords: false,
  };

function matchedText(
  text: string,
  query: string,
  options: Partial<FindOptions> = {},
): string[] {
  return findInPage(
    text,
    query,
    {
      ...DEFAULTS,
      ...options,
    },
  ).map(
    (
      r,
    ) =>
      text.slice(
        r.start,
        r.end,
      ),
  );
}

describe('findInPage', () => {
  it('ignores case by default and respects it with Match case', () => {
    const text =
      'Apple apple APPLE';
    expect(
      matchedText(
        text,
        'apple',
      ),
    ).toEqual(
      [
        'Apple',
        'apple',
        'APPLE',
      ],
    );
    expect(
      matchedText(
        text,
        'apple',
        {
          matchCase: true,
        },
      ),
    ).toEqual(
      [
        'apple',
      ],
    );
    expect(
      matchedText(
        text,
        'Apple',
        {
          matchCase: true,
        },
      ),
    ).toEqual(
      [
        'Apple',
      ],
    );
  });

  it('ignores diacritics in both directions', () => {
    expect(
      matchedText(
        'A naïve plan, naive too.',
        'naive',
      ),
    ).toEqual(
      [
        'naïve',
        'naive',
      ],
    );
    expect(
      matchedText(
        'A naïve plan, naive too.',
        'naïve',
      ),
    ).toEqual(
      [
        'naïve',
        'naive',
      ],
    );
    expect(
      matchedText(
        'Crème brûlée',
        'creme brulee',
      ),
    ).toEqual(
      [
        'Crème brûlée',
      ],
    );
  });

  it('keeps diacritics ignored when Match case is on', () => {
    expect(
      matchedText(
        'Naïve and naive',
        'Naive',
        {
          matchCase: true,
        },
      ),
    ).toEqual(
      [
        'Naïve',
      ],
    );
  });

  it('matches whole words only when asked', () => {
    const text =
      'cat concatenate cat. cats Cat';
    expect(
      matchedText(
        text,
        'cat',
      ),
    ).toHaveLength(
      5,
    );
    expect(
      matchedText(
        text,
        'cat',
        {
          wholeWords: true,
        },
      ),
    ).toEqual(
      [
        'cat',
        'cat',
        'Cat',
      ],
    );
  });

  it('treats digits and non-Latin letters as word characters', () => {
    expect(
      matchedText(
        'abc123 abc 123abc',
        'abc',
        {
          wholeWords: true,
        },
      ),
    ).toEqual(
      [
        'abc',
      ],
    );
    expect(
      matchedText(
        'быть небыть быть',
        'быть',
        {
          wholeWords: true,
        },
      ),
    ).toEqual(
      [
        'быть',
        'быть',
      ],
    );
  });

  it('only checks the boundary on a side where the query is a word', () => {
    expect(
      matchedText(
        'use c++ or c+',
        'c++',
        {
          wholeWords: true,
        },
      ),
    ).toEqual(
      [
        'c++',
      ],
    );
  });

  it('finds a phrase split by a line-end hyphen and reports original offsets', () => {
    const text =
      'a very exam-\nple of wrapping';
    const [
      range,
    ] =
      findInPage(
        text,
        'exam ple',
        DEFAULTS,
      );
    expect(
      range,
    ).toBeUndefined();
    const found =
      findInPage(
        text,
        'example of',
        DEFAULTS,
      );
    expect(
      found,
    ).toHaveLength(
      1,
    );
    expect(
      text.slice(
        found[0]!
          .start,
        found[0]!
          .end,
      ),
    ).toBe(
      'exam-\nple of',
    );
  });

  it('joins a soft hyphen and still finds the word', () => {
    expect(
      matchedText(
        'un­believable',
        'unbelievable',
      ),
    ).toEqual(
      [
        'un­believable',
      ],
    );
  });

  it('does not join a hyphen that is not at a line end', () => {
    expect(
      matchedText(
        'well-known fact',
        'wellknown',
      ),
    ).toEqual(
      [],
    );
    expect(
      matchedText(
        'well-known fact',
        'well-known',
      ),
    ).toEqual(
      [
        'well-known',
      ],
    );
  });

  it('treats any run of whitespace as one space', () => {
    expect(
      matchedText(
        'red \n\t  fox',
        'red fox',
      ),
    ).toEqual(
      [
        'red \n\t  fox',
      ],
    );
    expect(
      matchedText(
        'red fox',
        'red   fox',
      ),
    ).toEqual(
      [
        'red fox',
      ],
    );
  });

  it('matches Arabic text, with or without vowel marks', () => {
    const text =
      'قَرَأَ الطالب الكتابَ كل يوم';
    expect(
      matchedText(
        text,
        'الكتاب',
      ),
    ).toEqual(
      [
        'الكتاب',
      ],
    );
    expect(
      matchedText(
        text,
        'قرأ',
      ),
    ).toEqual(
      [
        'قَرَأ',
      ],
    );
    expect(
      matchedText(
        'الكتاب جميل',
        'الكتابَ',
        {
          wholeWords: true,
        },
      ),
    ).toEqual(
      [
        'الكتاب',
      ],
    );
  });

  it('does not overlap matches', () => {
    expect(
      matchedText(
        'aaaa',
        'aa',
      ),
    ).toEqual(
      [
        'aa',
        'aa',
      ],
    );
  });

  it('returns nothing for an empty or whitespace query', () => {
    expect(
      findInPage(
        'text',
        '',
        DEFAULTS,
      ),
    ).toEqual(
      [],
    );
    expect(
      findInPage(
        'text',
        '   ',
        DEFAULTS,
      ),
    ).toEqual(
      [],
    );
  });

  it('maps a ligature match back to the original character', () => {
    expect(
      matchedText(
        'the ﬁnal offer',
        'final',
      ),
    ).toEqual(
      [
        'ﬁnal',
      ],
    );
  });

  it('uses the document language when lower-casing', () => {
    expect(
      findInPage(
        'IĞDIR',
        'ığdır',
        {
          ...DEFAULTS,
          locale:
            'tr',
        },
      ).map(
        (
          r,
        ) => [
          r.start,
          r.end,
        ],
      ),
    ).toEqual(
      [
        [
          0,
          5,
        ],
      ],
    );
  });
});

describe('normalise', () => {
  it('keeps an index back to the original text', () => {
    const n =
      normalise(
        'Ca  fé',
        {
          matchCase: false,
        },
      );
    expect(
      n.text,
    ).toBe(
      'ca fe',
    );
    expect(
      n
        .starts[2],
    ).toBe(
      2,
    );
    expect(
      n
        .ends[2],
    ).toBe(
      4,
    );
    expect(
      n
        .starts[4],
    ).toBe(
      5,
    );
    expect(
      n
        .ends[4],
    ).toBe(
      6,
    );
  });
});

describe('joinHyphenated', () => {
  it('joins a word broken at a line end', () => {
    expect(
      joinHyphenated(
        'exam-\nple and exam- \r\n ple',
      ),
    ).toBe(
      'example and example',
    );
  });

  it('leaves other hyphens alone', () => {
    expect(
      joinHyphenated(
        'well-known, 3-\n4 and - \nx',
      ),
    ).toBe(
      'well-known, 3-\n4 and - \nx',
    );
  });
});

describe('snippet', () => {
  it('splits the context around the match', () => {
    const text = `${'x'.repeat(100)} needle ${'y'.repeat(100)}`;
    const start =
      text.indexOf(
        'needle',
      );
    const s =
      snippet(
        text,
        {
          start,
          end:
            start +
            6,
        },
      );
    expect(
      s.match,
    ).toBe(
      'needle',
    );
    expect(
      s
        .before
        .length,
    ).toBeLessThanOrEqual(
      40,
    );
    expect(
      s
        .after
        .length,
    ).toBeLessThanOrEqual(
      40,
    );
    expect(
      s.cutBefore,
    ).toBe(
      true,
    );
    expect(
      s.cutAfter,
    ).toBe(
      true,
    );
  });

  it('does not cut when the whole text fits', () => {
    const s =
      snippet(
        'short needle text',
        {
          start: 6,
          end: 12,
        },
      );
    expect(
      s,
    ).toEqual(
      {
        before:
          'short ',
        match:
          'needle',
        after:
          ' text',
        cutBefore: false,
        cutAfter: false,
      },
    );
  });

  it('never splits a surrogate pair', () => {
    const emoji =
      '😀';
    const text = `${emoji.repeat(30)}needle${emoji.repeat(30)}`;
    const start =
      text.indexOf(
        'needle',
      );
    for (const radius of [
      1,
      2,
      3,
      5,
      39,
      40,
      41,
    ]) {
      const s =
        snippet(
          text,
          {
            start,
            end:
              start +
              6,
          },
          radius,
        );
      for (const part of [
        s.before,
        s.after,
      ]) {
        expect(
          part,
        ).not.toMatch(
          /(^[\udc00-\udfff])|([\ud800-\udbff]$)/,
        );
      }
    }
  });

  it('keeps combining marks with their letter', () => {
    const text = `${'é'.repeat(20)}needle${'é'.repeat(20)}`;
    const start =
      text.indexOf(
        'needle',
      );
    const s =
      snippet(
        text,
        {
          start,
          end:
            start +
            6,
        },
        3,
      );
    expect(
      s.before.startsWith(
        '́',
      ),
    ).toBe(
      false,
    );
    expect(
      s.after.endsWith(
        '́',
      ),
    ).toBe(
      true,
    );
  });

  it('shows a hyphenated break joined and whitespace squashed', () => {
    const text =
      'before exam-\nple\n\nafter';
    const s =
      snippet(
        text,
        {
          start: 7,
          end: 16,
        },
      );
    expect(
      s.match,
    ).toBe(
      'example',
    );
    expect(
      s.after,
    ).toBe(
      ' after',
    );
  });
});

describe('toParagraphOffset', () => {
  it('drops the extra newline of each paragraph break', () => {
    const text =
      'one\n\ntwo\n\nthree';
    expect(
      toParagraphOffset(
        text,
        text.indexOf(
          'two',
        ),
      ),
    ).toBe(
      'one\ntwo'.indexOf(
        'two',
      ),
    );
    expect(
      toParagraphOffset(
        text,
        text.indexOf(
          'three',
        ),
      ),
    ).toBe(
      'one\ntwo\nthree'.indexOf(
        'three',
      ),
    );
    expect(
      toParagraphOffset(
        text,
        1,
      ),
    ).toBe(
      1,
    );
  });

  it('collapses a longer run of newlines to one', () => {
    const text =
      'a\n\n\nb';
    expect(
      toParagraphOffset(
        text,
        4,
      ),
    ).toBe(
      2,
    );
  });
});
