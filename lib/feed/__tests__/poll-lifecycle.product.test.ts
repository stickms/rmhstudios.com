import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  POLL_MAX_DAYS,
  allowedExtensions,
  authorNoticeText,
  extendedEnd,
  isPollEnded,
  pollEffectiveEnd,
  pollLifecycleView,
  pollWinners,
  votePercent,
  votersAreNotified,
} from '@/lib/feed/poll-lifecycle';

const DAY = 86_400_000;
const created =
  new Date(
    '2026-11-01T12:00:00Z',
  );
const at =
  (
    days: number,
  ) =>
    new Date(
      created.getTime() +
        days *
          DAY,
    );
const poll =
  (
    over: Partial<{
      closesAt: Date | null;
      closedAt: Date | null;
      extendedAt: Date | null;
    }> = {},
  ) => ({
    createdAt:
      created,
    closesAt:
      at(
        1,
      ),
    closedAt:
      null,
    extendedAt:
      null,
    ...over,
  });

describe('the effective end', () => {
  it('is the author closing it, else the scheduled close, else nothing', () => {
    expect(
      pollEffectiveEnd(
        poll(
          {
            closedAt:
              at(
                0.5,
              ),
          },
        ),
      ),
    ).toEqual(
      at(
        0.5,
      ),
    );
    expect(
      pollEffectiveEnd(
        poll(),
      ),
    ).toEqual(
      at(
        1,
      ),
    );
    expect(
      pollEffectiveEnd(
        poll(
          {
            closesAt:
              null,
          },
        ),
      ),
    ).toBeNull();
  });

  it('ends a poll at its end instant, whichever way it ended', () => {
    expect(
      isPollEnded(
        poll(),
        at(
          0.99,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      isPollEnded(
        poll(),
        at(
          1,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isPollEnded(
        poll(
          {
            closedAt:
              at(
                0.5,
              ),
          },
        ),
        at(
          0.6,
        ),
      ),
    ).toBe(
      true,
    );
    expect(
      isPollEnded(
        poll(
          {
            closesAt:
              null,
          },
        ),
        at(
          500,
        ),
      ),
    ).toBe(
      false,
    );
    expect(
      isPollEnded(
        poll(
          {
            closesAt:
              null,
            closedAt:
              at(
                2,
              ),
          },
        ),
        at(
          3,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('is what every serialiser sends: the effective end as closesAt, plus ended and extended', () => {
    const view =
      pollLifecycleView(
        poll(
          {
            closedAt:
              at(
                0.5,
              ),
            extendedAt:
              at(
                0.2,
              ),
          },
        ),
        at(
          0.6,
        ),
      );
    expect(
      view,
    ).toEqual(
      {
        closesAt:
          at(
            0.5,
          ).toISOString(),
        ended: true,
        extended: true,
        extendDays:
          [],
      },
    );
    expect(
      pollLifecycleView(
        poll(),
        at(
          0.1,
        ),
      ),
    ).toMatchObject(
      {
        ended: false,
        extended: false,
        closesAt:
          at(
            1,
          ).toISOString(),
      },
    );
    expect(
      pollLifecycleView(
        poll(
          {
            closesAt:
              null,
          },
        ),
        at(
          5,
        ),
      ),
    ).toMatchObject(
      {
        closesAt:
          null,
        ended: false,
        extendDays:
          [],
      },
    );
  });
});

describe('extension limits', () => {
  it('offers 1, 3 and 7 days to a young poll', () => {
    expect(
      allowedExtensions(
        poll(),
        at(
          0.1,
        ),
      ),
    ).toEqual(
      [
        1,
        3,
        7,
      ],
    );
  });

  it('stops at 30 days from the post', () => {
    // Closing on day 25: 1 and 3 days fit (26, 28), 7 days would be day 32.
    expect(
      allowedExtensions(
        poll(
          {
            closesAt:
              at(
                25,
              ),
          },
        ),
        at(
          1,
        ),
      ),
    ).toEqual(
      [
        1,
        3,
      ],
    );
    // Closing exactly on day 30 leaves no room, and day 29 leaves exactly 1.
    expect(
      allowedExtensions(
        poll(
          {
            closesAt:
              at(
                POLL_MAX_DAYS,
              ),
          },
        ),
        at(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      allowedExtensions(
        poll(
          {
            closesAt:
              at(
                POLL_MAX_DAYS -
                  1,
              ),
          },
        ),
        at(
          1,
        ),
      ),
    ).toEqual(
      [
        1,
      ],
    );
  });

  it('offers nothing to an ended poll or one with no end', () => {
    expect(
      allowedExtensions(
        poll(),
        at(
          2,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      allowedExtensions(
        poll(
          {
            closedAt:
              at(
                0.5,
              ),
          },
        ),
        at(
          0.6,
        ),
      ),
    ).toEqual(
      [],
    );
    expect(
      allowedExtensions(
        poll(
          {
            closesAt:
              null,
          },
        ),
        at(
          1,
        ),
      ),
    ).toEqual(
      [],
    );
  });

  it('moves a 1-day poll extended by 3 days to day 4', () => {
    expect(
      extendedEnd(
        at(
          1,
        ),
        3,
      ),
    ).toEqual(
      at(
        4,
      ),
    );
  });
});

describe('the winner', () => {
  const o =
    (
      id: string,
      voteCount: number,
    ) => ({
      id,
      text: id.toUpperCase(),
      voteCount,
    });

  it('is the option with the most votes', () => {
    expect(
      pollWinners(
        [
          o(
            'a',
            3,
          ),
          o(
            'b',
            7,
          ),
          o(
            'c',
            1,
          ),
        ],
      ).map(
        (
          w,
        ) =>
          w.id,
      ),
    ).toEqual(
      [
        'b',
      ],
    );
  });

  it('names every tied option, and none when nobody voted', () => {
    expect(
      pollWinners(
        [
          o(
            'a',
            4,
          ),
          o(
            'b',
            4,
          ),
          o(
            'c',
            1,
          ),
        ],
      ).map(
        (
          w,
        ) =>
          w.id,
      ),
    ).toEqual(
      [
        'a',
        'b',
      ],
    );
    expect(
      pollWinners(
        [
          o(
            'a',
            0,
          ),
          o(
            'b',
            0,
          ),
        ],
      ),
    ).toEqual(
      [],
    );
  });

  it('rounds the share the way the poll rows do', () => {
    expect(
      votePercent(
        54,
        100,
      ),
    ).toBe(
      54,
    );
    expect(
      votePercent(
        1,
        3,
      ),
    ).toBe(
      33,
    );
    expect(
      votePercent(
        0,
        0,
      ),
    ).toBe(
      0,
    );
  });

  it('writes the author a sentence for a winner, a tie and an empty poll', () => {
    expect(
      authorNoticeText(
        [
          o(
            'a',
            54,
          ),
          o(
            'b',
            46,
          ),
        ],
      ),
    ).toBe(
      'Your poll ended: A won with 54%',
    );
    expect(
      authorNoticeText(
        [
          o(
            'a',
            2,
          ),
          o(
            'b',
            2,
          ),
          o(
            'c',
            1,
          ),
        ],
      ),
    ).toBe(
      'Your poll ended in a tie: A and B with 40% each',
    );
    expect(
      authorNoticeText(
        [
          o(
            'a',
            1,
          ),
          o(
            'b',
            1,
          ),
          o(
            'c',
            1,
          ),
        ],
      ),
    ).toBe(
      'Your poll ended in a tie: A, B, and C with 33% each',
    );
    expect(
      authorNoticeText(
        [
          o(
            'a',
            0,
          ),
          o(
            'b',
            0,
          ),
        ],
      ),
    ).toBe(
      'Your poll ended with no votes',
    );
  });
});

describe('who hears the result', () => {
  it('lets voters hear it up to 2,000 votes and no further', () => {
    expect(
      votersAreNotified(
        0,
      ),
    ).toBe(
      true,
    );
    expect(
      votersAreNotified(
        2000,
      ),
    ).toBe(
      true,
    );
    expect(
      votersAreNotified(
        2001,
      ),
    ).toBe(
      false,
    );
  });
});
