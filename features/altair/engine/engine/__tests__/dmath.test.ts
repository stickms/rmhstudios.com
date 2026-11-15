// dmath: the engine-independent math the replayable sim uses. Accuracy is checked against Math.*,
// and the mode switch is checked so single-player (and the golden master) keep calling Math.* itself.
import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  dsin,
  dcos,
  datan2,
  dexp,
  dpow,
  dhypot,
  dsq,
  sdsin,
  sdcos,
  sdatan2,
  sdexp,
  sdpow,
} from '../dmath';
import {
  withRng,
  createSeededRng,
} from '../rng';

const grid =
  (
    n: number,
    lo: number,
    hi: number,
  ) =>
    Array.from(
      {
        length:
          n,
      },
      (
        _,
        i,
      ) =>
        lo +
        ((hi -
          lo) *
          i) /
          (n -
            1),
    );

describe('dmath accuracy (software versions vs Math)', () => {
  it('sin and cos agree to ~1e-15 over a wide range', () => {
    let worst = 0;
    for (const x of [
      ...grid(
        40001,
        -60,
        60,
      ),
      1e3,
      -1e3,
      12345.678,
      1e5,
      3e5,
      -7.7e6,
    ]) {
      worst =
        Math.max(
          worst,
          Math.abs(
            sdsin(
              x,
            ) -
              Math.sin(
                x,
              ),
          ),
          Math.abs(
            sdcos(
              x,
            ) -
              Math.cos(
                x,
              ),
          ),
        );
    }
    expect(
      worst,
    ).toBeLessThan(
      1e-9,
    ); // the huge arguments use an fmod reduction; the common range is ~1e-16
    let common = 0;
    for (const x of grid(
      40001,
      -60,
      60,
    ))
      common =
        Math.max(
          common,
          Math.abs(
            sdsin(
              x,
            ) -
              Math.sin(
                x,
              ),
          ),
          Math.abs(
            sdcos(
              x,
            ) -
              Math.cos(
                x,
              ),
          ),
        );
    expect(
      common,
    ).toBeLessThan(
      4e-16,
    );
  });

  it('atan2 agrees to ~1e-15 in every quadrant and on the axes', () => {
    let worst = 0;
    for (const y of grid(
      61,
      -9,
      9,
    ))
      for (const x of grid(
        61,
        -9,
        9,
      ))
        worst =
          Math.max(
            worst,
            Math.abs(
              sdatan2(
                y,
                x,
              ) -
                Math.atan2(
                  y,
                  x,
                ),
            ),
          );
    expect(
      worst,
    ).toBeLessThan(
      1e-15,
    );
    expect(
      sdatan2(
        0,
        1,
      ),
    ).toBe(
      0,
    );
    expect(
      Object.is(
        sdatan2(
          -0,
          1,
        ),
        -0,
      ),
    ).toBe(
      true,
    );
    expect(
      sdatan2(
        0,
        -1,
      ),
    ).toBe(
      Math.PI,
    );
    expect(
      sdatan2(
        1,
        0,
      ),
    ).toBe(
      Math.PI /
        2,
    );
    expect(
      sdatan2(
        -1,
        0,
      ),
    ).toBe(
      -Math.PI /
        2,
    );
    expect(
      Number.isNaN(
        sdatan2(
          NaN,
          1,
        ),
      ),
    ).toBe(
      true,
    );
  });

  it('exp and integer pow agree', () => {
    let worst = 0;
    for (const x of grid(
      2001,
      -30,
      30,
    ))
      worst =
        Math.max(
          worst,
          Math.abs(
            sdexp(
              x,
            ) /
              Math.exp(
                x,
              ) -
              1,
          ),
        );
    expect(
      worst,
    ).toBeLessThan(
      1e-14,
    );
    for (
      let level = 0;
      level <
      10;
      level++
    )
      expect(
        sdpow(
          1.1,
          level,
        ) /
          Math.pow(
            1.1,
            level,
          ) -
          1,
      ).toBeLessThan(
        1e-14,
      );
    expect(
      sdpow(
        2,
        -3,
      ),
    ).toBe(
      0.125,
    );
    expect(
      sdpow(
        1.5,
        0.5,
      ),
    ).toBe(
      Math.pow(
        1.5,
        0.5,
      ),
    ); // non-integer exponents fall back
  });

  it('is exactly reproducible (same call, same bits) and pure', () => {
    const a =
      grid(
        500,
        -20,
        20,
      ).map(
        (
          x,
        ) => [
          sdsin(
            x,
          ),
          sdcos(
            x,
          ),
          sdatan2(
            x,
            3,
          ),
          sdexp(
            x /
              4,
          ),
        ],
      );
    const b =
      grid(
        500,
        -20,
        20,
      ).map(
        (
          x,
        ) => [
          sdsin(
            x,
          ),
          sdcos(
            x,
          ),
          sdatan2(
            x,
            3,
          ),
          sdexp(
            x /
              4,
          ),
        ],
      );
    expect(
      a,
    ).toEqual(
      b,
    );
  });
});

describe('dmath mode switch', () => {
  const xs =
    [
      0.1,
      1.7,
      -3.3,
      25.5,
    ];
  it('outside a seeded sim every function IS Math.* (single-player and the golden master are untouched)', () => {
    for (const x of xs) {
      expect(
        dsin(
          x,
        ),
      ).toBe(
        Math.sin(
          x,
        ),
      );
      expect(
        dcos(
          x,
        ),
      ).toBe(
        Math.cos(
          x,
        ),
      );
      expect(
        datan2(
          x,
          2,
        ),
      ).toBe(
        Math.atan2(
          x,
          2,
        ),
      );
      expect(
        dexp(
          x,
        ),
      ).toBe(
        Math.exp(
          x,
        ),
      );
      expect(
        dpow(
          1.1,
          3,
        ),
      ).toBe(
        Math.pow(
          1.1,
          3,
        ),
      );
      expect(
        dhypot(
          x,
          2,
        ),
      ).toBe(
        Math.hypot(
          x,
          2,
        ),
      );
      expect(
        dsq(
          x,
        ),
      ).toBe(
        x **
          2,
      );
    }
  });

  it('inside a seeded sim they are the software versions', () => {
    withRng(
      createSeededRng(
        1,
      ),
      () => {
        for (const x of xs) {
          expect(
            dsin(
              x,
            ),
          ).toBe(
            sdsin(
              x,
            ),
          );
          expect(
            dcos(
              x,
            ),
          ).toBe(
            sdcos(
              x,
            ),
          );
          expect(
            datan2(
              x,
              2,
            ),
          ).toBe(
            sdatan2(
              x,
              2,
            ),
          );
          expect(
            dexp(
              x,
            ),
          ).toBe(
            sdexp(
              x,
            ),
          );
          expect(
            dsq(
              x,
            ),
          ).toBe(
            x *
              x,
          );
        }
      },
    );
    expect(
      dsin(
        1.7,
      ),
    ).toBe(
      Math.sin(
        1.7,
      ),
    );
  });
});
