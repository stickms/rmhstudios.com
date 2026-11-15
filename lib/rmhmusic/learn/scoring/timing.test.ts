import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  EXTRA_TAP_COST,
  OUTPUT_LATENCY_MS,
  PERFECT_MS,
  ZERO_MS,
  effectiveLatencyMs,
  tapScore,
} from './timing';

const BEATS =
  [
    0,
    500,
    1000,
    1500,
  ];

describe('tapScore', () => {
  it('taps exactly on the beats score 100', () => {
    expect(
      tapScore(
        BEATS,
        [
          0,
          500,
          1000,
          1500,
        ],
        0,
      ),
    ).toEqual(
      {
        score: 100,
        hits: 4,
        early: 0,
        late: 0,
      },
    );
  });

  it('allows for the calibrated latency: taps shifted by it still score 100', () => {
    expect(
      tapScore(
        BEATS,
        BEATS.map(
          (
            b,
          ) =>
            b +
            60,
        ),
        60,
      )
        .score,
    ).toBe(
      100,
    );
    expect(
      tapScore(
        BEATS,
        BEATS.map(
          (
            b,
          ) =>
            b -
            60,
        ),
        -60,
      )
        .score,
    ).toBe(
      100,
    );
  });

  it('within 70 ms is perfect, then falls linearly to 0 at 200 ms', () => {
    expect(
      PERFECT_MS,
    ).toBe(
      70,
    );
    expect(
      ZERO_MS,
    ).toBe(
      200,
    );
    expect(
      tapScore(
        [
          1000,
        ],
        [
          1070,
        ],
        0,
      )
        .score,
    ).toBe(
      100,
    );
    // Halfway between 70 and 200 is 135 ms: 50.
    expect(
      tapScore(
        [
          1000,
        ],
        [
          1135,
        ],
        0,
      )
        .score,
    ).toBe(
      50,
    );
    expect(
      tapScore(
        [
          1000,
        ],
        [
          865,
        ],
        0,
      )
        .score,
    ).toBe(
      50,
    );
    expect(
      tapScore(
        [
          1000,
        ],
        [
          1200,
        ],
        0,
      )
        .score,
    ).toBe(
      0,
    );
  });

  it('counts a tap further than 70 ms from its beat as early or late', () => {
    const r =
      tapScore(
        BEATS,
        [
          0,
          400,
          1000,
          1600,
        ],
        0,
      );
    expect(
      r.hits,
    ).toBe(
      2,
    );
    expect(
      r.early,
    ).toBe(
      1,
    );
    expect(
      r.late,
    ).toBe(
      1,
    );
  });

  it('a tap 250 ms off scores 0 for that beat and takes nothing from the others', () => {
    // 250 ms from beat 3 and past the last beat's window: stray, not a hit.
    expect(
      tapScore(
        BEATS,
        [
          0,
          500,
          1000,
          1750,
        ],
        0,
      )
        .score,
    ).toBe(
      75,
    );
    // In the middle of the bar a 250 ms stray lands between two beats: that beat is 0.
    const r =
      tapScore(
        [
          0,
          500,
          1000,
          1500,
        ],
        [
          0,
          750,
          1000,
          1500,
        ],
        0,
      );
    expect(
      r.hits,
    ).toBe(
      3,
    );
    expect(
      r.score,
    ).toBeLessThan(
      75,
    );
  });

  it('two taps 20 ms apart count as one (key repeat or bounce)', () => {
    const once =
      tapScore(
        BEATS,
        [
          0,
          500,
          1000,
          1500,
        ],
        0,
      );
    const bounced =
      tapScore(
        BEATS,
        [
          0,
          20,
          500,
          520,
          1000,
          1030,
          1500,
          1559,
        ],
        0,
      );
    expect(
      bounced,
    ).toEqual(
      once,
    );
  });

  it('a held key that repeats every 30 ms is one tap, not a run of them', () => {
    const repeats =
      Array.from(
        {
          length: 12,
        },
        (
          _,
          i,
        ) =>
          i *
          30,
      );
    expect(
      tapScore(
        [
          0,
          500,
        ],
        repeats,
        0,
      ),
    ).toEqual(
      tapScore(
        [
          0,
          500,
        ],
        [
          0,
        ],
        0,
      ),
    );
  });

  it('ignores taps before the first beat minus 200 ms (a tap before the clock started)', () => {
    const r =
      tapScore(
        BEATS,
        [
          -900,
          -250,
          0,
          500,
          1000,
          1500,
        ],
        0,
      );
    expect(
      r.score,
    ).toBe(
      100,
    );
    expect(
      r.hits,
    ).toBe(
      4,
    );
  });

  it('ignores taps after the last beat plus 200 ms', () => {
    expect(
      tapScore(
        BEATS,
        [
          0,
          500,
          1000,
          1500,
          3000,
        ],
        0,
      )
        .score,
    ).toBe(
      100,
    );
  });

  it('tapping the wrong beat does not earn a different one for free: no taps, no score', () => {
    expect(
      tapScore(
        BEATS,
        [],
        0,
      ),
    ).toEqual(
      {
        score: 0,
        hits: 0,
        early: 0,
        late: 0,
      },
    );
    expect(
      tapScore(
        [],
        [
          0,
          500,
        ],
        0,
      )
        .score,
    ).toBe(
      0,
    );
  });

  it('missing beats score 0 and the score is the mean over beats, rounded', () => {
    expect(
      tapScore(
        BEATS,
        [
          0,
          500,
        ],
        0,
      )
        .score,
    ).toBe(
      50,
    );
    expect(
      tapScore(
        [
          0,
          500,
          1000,
        ],
        [
          0,
        ],
        0,
      )
        .score,
    ).toBe(
      33,
    );
  });

  it('mashing cannot beat keeping time: extra taps cost', () => {
    expect(
      EXTRA_TAP_COST,
    ).toBeGreaterThan(
      0,
    );
    const mash =
      Array.from(
        {
          length: 16,
        },
        (
          _,
          i,
        ) =>
          i *
            125 -
          125,
      );
    const steady =
      tapScore(
        BEATS,
        [
          0,
          500,
          1000,
          1500,
        ],
        0,
      );
    const mashed =
      tapScore(
        BEATS,
        mash,
        0,
      );
    expect(
      mashed.score,
    ).toBeLessThan(
      steady.score,
    );
    expect(
      mashed.score,
    ).toBeLessThan(
      60,
    );
  });

  it('a negative or large latency never gives a score above 100, below 0, or NaN', () => {
    for (const latency of [
      -300,
      300,
      -500,
      500,
      -1e9,
      1e9,
    ]) {
      for (const taps of [
        [],
        [
          0,
        ],
        BEATS,
        BEATS.map(
          (
            b,
          ) =>
            b +
            300,
        ),
        BEATS.map(
          (
            b,
          ) =>
            b -
            300,
        ),
      ]) {
        const r =
          tapScore(
            BEATS,
            taps,
            latency,
          );
        for (const v of [
          r.score,
          r.hits,
          r.early,
          r.late,
        ]) {
          expect(
            Number.isFinite(
              v,
            ),
          ).toBe(
            true,
          );
          expect(
            v,
          ).toBeGreaterThanOrEqual(
            0,
          );
        }
        expect(
          r.score,
        ).toBeLessThanOrEqual(
          100,
        );
      }
    }
    expect(
      tapScore(
        BEATS,
        BEATS,
        Number.NaN,
      )
        .score,
    ).toBe(
      100,
    );
  });

  it('latency is clamped, so a wild saved value cannot turn bad taps into perfect ones', () => {
    // Taps 800 ms late: a 5 s "latency" must not pull them onto the beats.
    expect(
      tapScore(
        BEATS,
        BEATS.map(
          (
            b,
          ) =>
            b +
            800,
        ),
        5000,
      )
        .score,
    ).toBe(
      0,
    );
  });

  it('ignores non-finite beats and taps', () => {
    expect(
      tapScore(
        [
          0,
          Number.NaN,
          500,
        ],
        [
          0,
          Infinity,
          500,
          Number.NaN,
        ],
        0,
      )
        .score,
    ).toBe(
      100,
    );
  });

  it('does not mutate its inputs and takes unsorted taps', () => {
    const taps =
      [
        1000,
        0,
        1500,
        500,
      ];
    const copy =
      [
        ...taps,
      ];
    expect(
      tapScore(
        BEATS,
        taps,
        0,
      )
        .score,
    ).toBe(
      100,
    );
    expect(
      taps,
    ).toEqual(
      copy,
    );
  });
});

describe('effectiveLatencyMs', () => {
  it('uses a calibrated latency as measured (it already holds the output delay)', () => {
    expect(
      effectiveLatencyMs(
        85,
      ),
    ).toBe(
      85,
    );
    expect(
      effectiveLatencyMs(
        -20,
      ),
    ).toBe(
      -20,
    );
  });
  it('assumes the typical output delay when nothing was calibrated (0)', () => {
    expect(
      effectiveLatencyMs(
        0,
      ),
    ).toBe(
      OUTPUT_LATENCY_MS,
    );
    expect(
      OUTPUT_LATENCY_MS,
    ).toBeGreaterThan(
      0,
    );
  });
  it('bounds a wild or non-numeric value', () => {
    expect(
      effectiveLatencyMs(
        9999,
      ),
    ).toBe(
      500,
    );
    expect(
      effectiveLatencyMs(
        -9999,
      ),
    ).toBe(
      -500,
    );
    expect(
      effectiveLatencyMs(
        Number.NaN,
      ),
    ).toBe(
      OUTPUT_LATENCY_MS,
    );
  });
});
