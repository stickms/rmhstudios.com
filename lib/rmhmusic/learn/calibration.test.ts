import {
  describe,
  expect,
  it,
} from 'vitest';
import { medianOffset } from './calibration';

/** Eight clicks at 100 BPM (600 ms apart), starting at 1000 ms. */
const CLICKS =
  Array.from(
    {
      length: 8,
    },
    (
      _,
      i,
    ) =>
      1000 +
      i *
        600,
  );

describe('medianOffset', () => {
  it('is 0 when every response lands on its click', () => {
    expect(
      medianOffset(
        CLICKS,
        [
          ...CLICKS,
        ],
      ),
    ).toBe(
      0,
    );
  });

  it('measures a consistent lag', () => {
    expect(
      medianOffset(
        CLICKS,
        CLICKS.map(
          (
            c,
          ) =>
            c +
            80,
        ),
      ),
    ).toBe(
      80,
    );
  });

  it('measures a consistent lead as a negative offset', () => {
    expect(
      medianOffset(
        CLICKS,
        CLICKS.map(
          (
            c,
          ) =>
            c -
            30,
        ),
      ),
    ).toBe(
      -30,
    );
  });

  it('is not moved by one outlier', () => {
    const responses =
      CLICKS.map(
        (
          c,
        ) =>
          c +
          80,
      );
    responses[3] =
      CLICKS[3] +
      390;
    expect(
      medianOffset(
        CLICKS,
        responses,
      ),
    ).toBe(
      80,
    );
  });

  it('is null with fewer than four matched pairs', () => {
    expect(
      medianOffset(
        CLICKS,
        CLICKS.slice(
          0,
          3,
        ).map(
          (
            c,
          ) =>
            c +
            50,
        ),
      ),
    ).toBeNull();
    expect(
      medianOffset(
        CLICKS,
        [],
      ),
    ).toBeNull();
    expect(
      medianOffset(
        [],
        [
          1,
          2,
          3,
          4,
        ],
      ),
    ).toBeNull();
  });

  it('ignores responses that are not within 400 ms of any click', () => {
    const responses =
      [
        ...CLICKS.slice(
          0,
          4,
        ).map(
          (
            c,
          ) =>
            c +
            60,
        ),
        0,
        50_000,
      ];
    expect(
      medianOffset(
        CLICKS,
        responses,
      ),
    ).toBe(
      60,
    );
  });

  it('rounds the median to a whole millisecond', () => {
    // Four pairs: offsets 10, 11, 12, 13 → median 11.5 → 12.
    const responses =
      CLICKS.slice(
        0,
        4,
      ).map(
        (
          c,
          i,
        ) =>
          c +
          10 +
          i,
      );
    expect(
      medianOffset(
        CLICKS,
        responses,
      ),
    ).toBe(
      12,
    );
  });

  it('pairs a response with its nearest click, not the first one', () => {
    // 1550 is 50 ms before the 1600 click and 550 ms after the 1000 click.
    const responses =
      [
        1010,
        1550,
        2210,
        2810,
        3410,
      ];
    // Offsets: 10, -50, 10, 10, 10 → median 10.
    expect(
      medianOffset(
        CLICKS,
        responses,
      ),
    ).toBe(
      10,
    );
  });

  it('skips non-finite values', () => {
    const responses =
      [
        ...CLICKS.map(
          (
            c,
          ) =>
            c +
            20,
        ),
        Number.NaN,
        Number.POSITIVE_INFINITY,
      ];
    expect(
      medianOffset(
        CLICKS,
        responses,
      ),
    ).toBe(
      20,
    );
  });
});
