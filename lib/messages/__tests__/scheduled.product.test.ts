import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  MAX_LEAD_MS,
  MIN_LEAD_MS,
  firstLine,
  isFailCode,
  sendAtProblem,
  sendLaterPresets,
} from '@/lib/messages/scheduled';

const utc =
  (
    y: number,
    mo: number,
    d: number,
    h = 0,
    mi = 0,
  ) =>
    Date.UTC(
      y,
      mo -
        1,
      d,
      h,
      mi,
    );

describe('sendAtProblem', () => {
  const now =
    utc(
      2026,
      11,
      23,
      8,
    );
  it('accepts a minute ahead up to thirty days ahead, inclusive', () => {
    expect(
      sendAtProblem(
        now +
          MIN_LEAD_MS,
        now,
      ),
    ).toBeNull();
    expect(
      sendAtProblem(
        now +
          MAX_LEAD_MS,
        now,
      ),
    ).toBeNull();
  });
  it('refuses anything sooner than a minute, in the past or not a number', () => {
    expect(
      sendAtProblem(
        now +
          MIN_LEAD_MS -
          1,
        now,
      ),
    ).toBe(
      'too-soon',
    );
    expect(
      sendAtProblem(
        now -
          5_000,
        now,
      ),
    ).toBe(
      'too-soon',
    );
    expect(
      sendAtProblem(
        Number.NaN,
        now,
      ),
    ).toBe(
      'too-soon',
    );
  });
  it('refuses anything past thirty days', () => {
    expect(
      sendAtProblem(
        now +
          MAX_LEAD_MS +
          1,
        now,
      ),
    ).toBe(
      'too-far',
    );
  });
});

describe('sendLaterPresets', () => {
  it('offers tomorrow 09:00 and the next Monday 09:00 on a midweek day', () => {
    // Wednesday 2026-11-25 14:00 UTC.
    const p =
      sendLaterPresets(
        utc(
          2026,
          11,
          25,
          14,
        ),
        'UTC',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        26,
        9,
      ),
    );
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        30,
        9,
      ),
    );
  });

  it('never offers today as Monday: on a Monday, Monday is next week', () => {
    // Monday 2026-11-23.
    const p =
      sendLaterPresets(
        utc(
          2026,
          11,
          23,
          6,
        ),
        'UTC',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        24,
        9,
      ),
    );
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        30,
        9,
      ),
    );
  });

  it('on a Sunday, tomorrow and Monday are the same morning', () => {
    // Sunday 2026-11-22.
    const p =
      sendLaterPresets(
        utc(
          2026,
          11,
          22,
          23,
          30,
        ),
        'UTC',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        23,
        9,
      ),
    );
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        23,
        9,
      ),
    );
  });

  it('on a Saturday, Monday is two days out', () => {
    const p =
      sendLaterPresets(
        utc(
          2026,
          11,
          21,
          12,
        ),
        'UTC',
      );
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        23,
        9,
      ),
    );
  });

  it('crosses a month and a year boundary', () => {
    // Thursday 2026-12-31.
    const p =
      sendLaterPresets(
        utc(
          2026,
          12,
          31,
          12,
        ),
        'UTC',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2027,
        1,
        1,
        9,
      ),
    );
    expect(
      p.monday,
    ).toBe(
      utc(
        2027,
        1,
        4,
        9,
      ),
    );
  });

  it('is computed on the sender’s calendar, not UTC', () => {
    // 23:30 Sunday 2026-11-22 in Los Angeles (UTC-8) is already Monday in UTC.
    const now =
      utc(
        2026,
        11,
        23,
        7,
        30,
      );
    const la =
      sendLaterPresets(
        now,
        'America/Los_Angeles',
      );
    expect(
      la.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        23,
        17,
      ),
    ); // Monday 09:00 PST
    expect(
      la.monday,
    ).toBe(
      utc(
        2026,
        11,
        23,
        17,
      ),
    );
    const utcPresets =
      sendLaterPresets(
        now,
        'UTC',
      );
    expect(
      utcPresets.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        24,
        9,
      ),
    );
  });

  it('keeps 09:00 local across the spring-forward change', () => {
    // Saturday 2027-03-13 in New York; DST starts Sunday 2027-03-14 at 02:00.
    const p =
      sendLaterPresets(
        utc(
          2027,
          3,
          13,
          15,
        ),
        'America/New_York',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2027,
        3,
        14,
        13,
      ),
    ); // 09:00 EDT = 13:00 UTC
    expect(
      p.monday,
    ).toBe(
      utc(
        2027,
        3,
        15,
        13,
      ),
    );
    const before =
      sendLaterPresets(
        utc(
          2027,
          3,
          12,
          15,
        ),
        'America/New_York',
      );
    expect(
      before.tomorrow,
    ).toBe(
      utc(
        2027,
        3,
        13,
        14,
      ),
    ); // 09:00 EST = 14:00 UTC
  });

  it('keeps 09:00 local across the fall-back change', () => {
    // Saturday 2026-10-31 in New York; DST ends Sunday 2026-11-01.
    const p =
      sendLaterPresets(
        utc(
          2026,
          10,
          31,
          15,
        ),
        'America/New_York',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        1,
        14,
      ),
    ); // 09:00 EST
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        2,
        14,
      ),
    );
  });

  it('handles a zone ahead of UTC', () => {
    // Tokyo is UTC+9: 20:00 UTC on Tuesday is 05:00 Wednesday there.
    const p =
      sendLaterPresets(
        utc(
          2026,
          11,
          24,
          20,
        ),
        'Asia/Tokyo',
      );
    expect(
      p.tomorrow,
    ).toBe(
      utc(
        2026,
        11,
        26,
        0,
      ),
    ); // Thursday 09:00 JST
    expect(
      p.monday,
    ).toBe(
      utc(
        2026,
        11,
        30,
        0,
      ),
    ); // Monday 09:00 JST
  });
});

describe('small helpers', () => {
  it('firstLine skips blank lines and trims', () => {
    expect(
      firstLine(
        '\n  hello there \nsecond',
      ),
    ).toBe(
      'hello there',
    );
    expect(
      firstLine(
        '',
      ),
    ).toBe(
      '',
    );
  });
  it('isFailCode knows the codes and nothing else', () => {
    expect(
      isFailCode(
        'blocked',
      ),
    ).toBe(
      true,
    );
    expect(
      isFailCode(
        'cannot-message',
      ),
    ).toBe(
      true,
    );
    expect(
      isFailCode(
        'nope',
      ),
    ).toBe(
      false,
    );
    expect(
      isFailCode(
        null,
      ),
    ).toBe(
      false,
    );
  });
});
