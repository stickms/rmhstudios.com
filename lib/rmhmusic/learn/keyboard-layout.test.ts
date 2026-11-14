import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  BLACK_SHARE,
  MIN_WHITE_PX,
  clampOctave,
  inView,
  octaveShowing,
  swipeShift,
  whiteKeysFor,
  windowKeys,
} from './keyboard-layout';

describe('on-screen keyboard window', () => {
  it('fits whole white keys of at least 44px, one to two octaves', () => {
    expect(
      whiteKeysFor(
        0,
      ),
    ).toBe(
      7,
    );
    expect(
      whiteKeysFor(
        308,
      ),
    ).toBe(
      7,
    ); // a 320px phone
    expect(
      whiteKeysFor(
        336,
      ),
    ).toBe(
      7,
    ); // 360px phone
    expect(
      whiteKeysFor(
        366,
      ),
    ).toBe(
      8,
    ); // 390px phone
    expect(
      whiteKeysFor(
        616,
      ),
    ).toBe(
      14,
    );
    expect(
      whiteKeysFor(
        1200,
      ),
    ).toBe(
      14,
    );
    for (
      let px = 308;
      px <=
      616;
      px++
    ) {
      const n =
        whiteKeysFor(
          px,
        );
      if (
        px >=
        7 *
          MIN_WHITE_PX
      )
        expect(
          px /
            n,
        ).toBeGreaterThanOrEqual(
          MIN_WHITE_PX,
        );
      expect(
        MIN_WHITE_PX *
          BLACK_SHARE,
      ).toBeGreaterThanOrEqual(
        24,
      );
    }
  });

  it('the CSS container queries use the same steps (one per 44px from 8 to 14 keys)', () => {
    const css =
      readFileSync(
        join(
          __dirname,
          '../../../components/rmhmusic/rmhmusic.css',
        ),
        'utf8',
      );
    for (
      let n = 8;
      n <=
      14;
      n++
    ) {
      const px =
        n *
        MIN_WHITE_PX;
      const re =
        new RegExp(
          `@container \\(min-width: ${px}px\\) \\{\\s*\\.rmm-keys__bed \\{\\s*--rmm-white-count: ${n};`,
        );
      expect(
        css,
        `missing the ${n}-key step at ${px}px`,
      ).toMatch(
        re,
      );
      expect(
        whiteKeysFor(
          px,
        ),
      ).toBe(
        n,
      );
      expect(
        whiteKeysFor(
          px -
            1,
        ),
      ).toBe(
        Math.max(
          7,
          n -
            1,
        ),
      );
    }
  });

  it('the CSS collapses a black key past the last white (the sliver)', () => {
    const css =
      readFileSync(
        join(
          __dirname,
          '../../../components/rmhmusic/rmhmusic.css',
        ),
        'utf8',
      );
    expect(
      css,
    ).toMatch(
      /--rmm-shown: clamp\(0, \(var\(--rmm-white-count\) - var\(--rmm-wb\)\) \* 999, 1\);/,
    );
  });

  it('a window is two octaves from a C', () => {
    const keys =
      windowKeys(
        4,
      );
    expect(
      keys[0],
    ).toEqual(
      {
        midi: 60,
        black: false,
        whiteBefore: 0,
      },
    );
    expect(
      keys,
    ).toHaveLength(
      24,
    );
    expect(
      keys.filter(
        (
          k,
        ) =>
          !k.black,
      ),
    ).toHaveLength(
      14,
    );
    expect(
      keys.find(
        (
          k,
        ) =>
          k.midi ===
          61,
      ),
    ).toEqual(
      {
        midi: 61,
        black: true,
        whiteBefore: 1,
      },
    );
    expect(
      windowKeys(
        3,
      )[0]
        .midi,
    ).toBe(
      48,
    );
  });

  it('knows which keys are in view', () => {
    const keys =
      windowKeys(
        4,
      );
    const shown =
      keys
        .filter(
          (
            k,
          ) =>
            inView(
              k,
              8,
            ),
        )
        .map(
          (
            k,
          ) =>
            k.midi,
        );
    // C4 … C5; C#5 would be a sliver at the clipped edge, so it is out.
    expect(
      shown,
    ).toEqual(
      [
        60,
        61,
        62,
        63,
        64,
        65,
        66,
        67,
        68,
        69,
        70,
        71,
        72,
      ],
    );
    // 10 whites end on E5: D#5 sits between two visible whites, nothing past E5.
    expect(
      keys
        .filter(
          (
            k,
          ) =>
            inView(
              k,
              10,
            ),
        )
        .map(
          (
            k,
          ) =>
            k.midi,
        )
        .at(
          -1,
        ),
    ).toBe(
      76,
    );
    expect(
      keys
        .filter(
          (
            k,
          ) =>
            inView(
              k,
              10,
            ),
        )
        .some(
          (
            k,
          ) =>
            k.midi ===
            75,
        ),
    ).toBe(
      true,
    );
    // 12 whites end on G5: G#5 (whiteBefore 12) is out.
    const twelve =
      keys
        .filter(
          (
            k,
          ) =>
            inView(
              k,
              12,
            ),
        )
        .map(
          (
            k,
          ) =>
            k.midi,
        );
    expect(
      twelve.at(
        -1,
      ),
    ).toBe(
      79,
    );
    expect(
      twelve,
    ).not.toContain(
      80,
    );
    // Every black key in view has its right-hand white in view.
    for (const n of [
      7,
      8,
      10,
      12,
      14,
    ]) {
      for (const k of keys.filter(
        (
          x,
        ) =>
          x.black &&
          inView(
            x,
            n,
          ),
      )) {
        expect(
          k.whiteBefore,
        ).toBeLessThan(
          n,
        );
      }
    }
    expect(
      keys.filter(
        (
          k,
        ) =>
          inView(
            k,
            14,
          ),
      ),
    ).toHaveLength(
      24,
    );
  });

  it('clamps the octave and reads swipes', () => {
    expect(
      clampOctave(
        0,
      ),
    ).toBe(
      2,
    );
    expect(
      clampOctave(
        9,
      ),
    ).toBe(
      6,
    );
    expect(
      swipeShift(
        -60,
        5,
      ),
    ).toBe(
      1,
    );
    expect(
      swipeShift(
        60,
        5,
      ),
    ).toBe(
      -1,
    );
    expect(
      swipeShift(
        30,
        0,
      ),
    ).toBe(
      0,
    );
    expect(
      swipeShift(
        50,
        60,
      ),
    ).toBe(
      0,
    );
  });
});

describe('octaveShowing', () => {
  const C =
    (
      octave: number,
    ) =>
      12 *
      (octave +
        1);

  it('keeps the window when the key is already in view', () => {
    expect(
      octaveShowing(
        C(
          4,
        ),
        4,
        7,
      ),
    ).toBe(
      4,
    );
    expect(
      octaveShowing(
        C(
          4,
        ) +
          11,
        4,
        7,
      ),
    ).toBe(
      4,
    ); // B4 is the seventh white
    expect(
      octaveShowing(
        C(
          5,
        ) +
          2,
        4,
        14,
      ),
    ).toBe(
      4,
    ); // D5, in the second octave of a wide window
  });

  it("moves to the key's own octave when a narrow window shows another", () => {
    expect(
      octaveShowing(
        C(
          4,
        ) +
          4,
        3,
        7,
      ),
    ).toBe(
      4,
    ); // E4 from a window on C3
    expect(
      octaveShowing(
        C(
          3,
        ) +
          4,
        4,
        7,
      ),
    ).toBe(
      3,
    );
    expect(
      octaveShowing(
        C(
          5,
        ),
        3,
        7,
      ),
    ).toBe(
      5,
    );
  });

  it('shows black keys too, and the highest key of the octave', () => {
    expect(
      octaveShowing(
        C(
          4,
        ) +
          10,
        3,
        7,
      ),
    ).toBe(
      4,
    ); // A#4
    expect(
      octaveShowing(
        C(
          4,
        ) +
          1,
        3,
        7,
      ),
    ).toBe(
      4,
    ); // C#4
  });

  it('moves as little as it can when a wide window would show the key as its second octave', () => {
    expect(
      octaveShowing(
        C(
          4,
        ) +
          4,
        3,
        14,
      ),
    ).toBe(
      3,
    ); // E4 is in C3's second octave
    expect(
      octaveShowing(
        C(
          5,
        ),
        3,
        14,
      ),
    ).toBe(
      4,
    ); // C5 needs the window one octave up
  });

  it('leaves the window alone for a key no window can show', () => {
    expect(
      octaveShowing(
        C(
          0,
        ),
        4,
        7,
      ),
    ).toBe(
      4,
    );
    expect(
      octaveShowing(
        C(
          9,
        ),
        4,
        7,
      ),
    ).toBe(
      4,
    );
  });
});
