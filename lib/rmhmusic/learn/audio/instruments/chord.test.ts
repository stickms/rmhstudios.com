import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  chordGain,
  strumOffsets,
  STRUM_HUMANISE_MS,
} from './chord';

describe('strumOffsets', () => {
  const rand =
    () =>
      0.5;
  it('starts at 0 and ascends', () => {
    const o =
      strumOffsets(
        6,
        12,
        rand,
      );
    expect(
      o[0],
    ).toBe(
      0,
    );
    for (
      let i = 1;
      i <
      o.length;
      i++
    )
      expect(
        o[
          i
        ],
      ).toBeGreaterThan(
        o[
          i -
            1
        ],
      );
  });
  it('is a block chord when strumMs is 0', () => {
    expect(
      strumOffsets(
        3,
        0,
        rand,
      ),
    ).toEqual(
      [
        0,
        0,
        0,
      ],
    );
  });
  it('is deterministic for a seeded rand and humanises within the bound', () => {
    let s = 7;
    const seeded =
      () =>
        (s =
          (s *
            16807) %
          2147483647) /
        2147483647;
    s = 7;
    const a =
      strumOffsets(
        6,
        12,
        seeded,
      );
    s = 7;
    const b =
      strumOffsets(
        6,
        12,
        seeded,
      );
    expect(
      a,
    ).toEqual(
      b,
    );
    a.forEach(
      (
        t,
        i,
      ) => {
        expect(
          Math.abs(
            t -
              (i *
                12) /
                1000,
          ),
        ).toBeLessThanOrEqual(
          STRUM_HUMANISE_MS /
            1000 +
            1e-9,
        );
      },
    );
  });
  it('spans under 100 ms for six strings', () => {
    const o =
      strumOffsets(
        6,
        12,
        () =>
          1,
      );
    expect(
      o[5],
    ).toBeLessThan(
      0.1,
    );
  });
  it('handles n of 0 and 1', () => {
    expect(
      strumOffsets(
        0,
        12,
        rand,
      ),
    ).toEqual(
      [],
    );
    expect(
      strumOffsets(
        1,
        12,
        rand,
      ),
    ).toEqual(
      [
        0,
      ],
    );
  });
});

describe('chordGain', () => {
  it('is 1/sqrt(n)', () => {
    expect(
      chordGain(
        1,
      ),
    ).toBe(
      1,
    );
    expect(
      chordGain(
        4,
      ),
    ).toBe(
      0.5,
    );
    expect(
      chordGain(
        0,
      ),
    ).toBe(
      1,
    );
  });
});
