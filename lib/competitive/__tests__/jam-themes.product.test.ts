import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  MAX_THEME_MARKS,
  normaliseMarks,
  resolveVoteOpensAt,
  revealNoticeText,
  themeVotingPhase,
  validateCandidates,
  winnerOf,
} from '@/lib/competitive/jam-themes';

const cands =
  [
    {
      id: 'a',
      position: 0,
    },
    {
      id: 'b',
      position: 1,
    },
    {
      id: 'c',
      position: 2,
    },
  ];

describe('winnerOf', () => {
  it('takes the most marks', () => {
    expect(
      winnerOf(
        cands,
        new Map(
          [
            [
              'b',
              2,
            ],
            [
              'c',
              5,
            ],
          ],
        ),
      ),
    ).toBe(
      'c',
    );
    expect(
      winnerOf(
        cands,
        {
          a: 1,
          b: 3,
          c: 2,
        },
      ),
    ).toBe(
      'b',
    );
  });
  it('gives a tie to the candidate listed first, whatever the input order', () => {
    expect(
      winnerOf(
        cands,
        {
          b: 2,
          c: 2,
        },
      ),
    ).toBe(
      'b',
    );
    expect(
      winnerOf(
        [
          ...cands,
        ].reverse(),
        {
          b: 2,
          c: 2,
          a: 2,
        },
      ),
    ).toBe(
      'a',
    );
  });
  it('gives no marks at all to the first candidate, and an empty list to nobody', () => {
    expect(
      winnerOf(
        cands,
        new Map(),
      ),
    ).toBe(
      'a',
    );
    expect(
      winnerOf(
        [],
        new Map(),
      ),
    ).toBeNull();
  });
});

describe('validateCandidates', () => {
  it('accepts 3 to 12 trimmed, unique themes', () => {
    expect(
      validateCandidates(
        [
          ' A ',
          'B',
          'C',
        ],
      ),
    ).toEqual(
      {
        ok: true,
        texts:
          [
            'A',
            'B',
            'C',
          ],
      },
    );
    expect(
      validateCandidates(
        Array.from(
          {
            length: 12,
          },
          (
            _,
            i,
          ) =>
            `t${i}`,
        ),
      )
        .ok,
    ).toBe(
      true,
    );
  });
  it('refuses a wrong count, an empty theme, a long one and a duplicate ignoring case', () => {
    expect(
      validateCandidates(
        [
          'A',
          'B',
        ],
      ),
    ).toEqual(
      {
        ok: false,
        problem:
          'count',
      },
    );
    expect(
      validateCandidates(
        Array.from(
          {
            length: 13,
          },
          (
            _,
            i,
          ) =>
            `t${i}`,
        ),
      ),
    ).toEqual(
      {
        ok: false,
        problem:
          'count',
      },
    );
    expect(
      validateCandidates(
        [
          'A',
          ' ',
          'C',
        ],
      ),
    ).toEqual(
      {
        ok: false,
        problem:
          'empty',
      },
    );
    expect(
      validateCandidates(
        [
          'A',
          'B',
          'x'.repeat(
            121,
          ),
        ],
      ),
    ).toEqual(
      {
        ok: false,
        problem:
          'length',
      },
    );
    expect(
      validateCandidates(
        [
          'Sea',
          'sea',
          'C',
        ],
      ),
    ).toEqual(
      {
        ok: false,
        problem:
          'duplicate',
      },
    );
    expect(
      validateCandidates(
        [
          'A',
          'B',
          'x'.repeat(
            120,
          ),
        ],
      )
        .ok,
    ).toBe(
      true,
    );
  });
});

describe('themeVotingPhase', () => {
  const startsAt =
    new Date(
      '2026-12-02T00:00:00Z',
    );
  const opens =
    new Date(
      '2026-12-01T00:00:00Z',
    );
  const jam =
    {
      themeVoting: true,
      themeVoteOpensAt:
        opens,
      startsAt,
    };
  it('runs before, open, closed around the opening and start times', () => {
    expect(
      themeVotingPhase(
        jam,
        new Date(
          '2026-11-30T23:59:59Z',
        ),
      ),
    ).toBe(
      'before',
    );
    expect(
      themeVotingPhase(
        jam,
        opens,
      ),
    ).toBe(
      'open',
    );
    expect(
      themeVotingPhase(
        jam,
        new Date(
          '2026-12-01T23:59:59Z',
        ),
      ),
    ).toBe(
      'open',
    );
    expect(
      themeVotingPhase(
        jam,
        startsAt,
      ),
    ).toBe(
      'closed',
    );
  });
  it('is none for a jam without voting', () => {
    expect(
      themeVotingPhase(
        {
          ...jam,
          themeVoting: false,
        },
        opens,
      ),
    ).toBe(
      'none',
    );
  });
});

describe('marks and the opening time', () => {
  it('de-duplicates marks and refuses more than the cap', () => {
    expect(
      normaliseMarks(
        [
          'a',
          'a',
          'b',
        ],
      ),
    ).toEqual(
      {
        ok: true,
        ids: [
          'a',
          'b',
        ],
      },
    );
    expect(
      normaliseMarks(
        [
          'a',
          'b',
          'c',
          'd',
        ],
      )
        .ok,
    ).toBe(
      false,
    );
    expect(
      MAX_THEME_MARKS,
    ).toBe(
      3,
    );
  });
  it('opens now by default and must be before the start', () => {
    const now =
      new Date(
        '2026-12-01T00:00:00Z',
      );
    const starts =
      new Date(
        '2026-12-02T00:00:00Z',
      );
    expect(
      resolveVoteOpensAt(
        undefined,
        starts,
        now,
      ),
    ).toEqual(
      now,
    );
    expect(
      resolveVoteOpensAt(
        new Date(
          '2026-12-01T12:00:00Z',
        ),
        starts,
        now,
      )?.toISOString(),
    ).toBe(
      '2026-12-01T12:00:00.000Z',
    );
    expect(
      resolveVoteOpensAt(
        starts,
        starts,
        now,
      ),
    ).toBeNull();
    expect(
      resolveVoteOpensAt(
        undefined,
        now,
        now,
      ),
    ).toBeNull();
  });
  it('words the reveal notice', () => {
    expect(
      revealNoticeText(
        'Jam One',
        'Sea',
      ),
    ).toBe(
      'The theme of Jam One is Sea',
    );
  });
});
