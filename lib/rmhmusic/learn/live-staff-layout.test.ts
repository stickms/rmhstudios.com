import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  VIEW_H,
  VIEW_W,
  liveStaffLayout,
  ottavaText,
  yOf,
} from './live-staff-layout';

const inside =
  (b: {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
  }) =>
    b.x0 >=
      0 &&
    b.y0 >=
      0 &&
    b.x1 <=
      VIEW_W &&
    b.y1 <=
      VIEW_H;

describe('live staff layout', () => {
  it.each(
    [
      // [midi, name, drawn step, ottava sign]
      [
        40,
        'E2 (guitar low E)',
        -7,
        '8vb',
      ],
      [
        38,
        'D2',
        -8,
        '8vb',
      ],
      [
        39,
        'D#2 (spelled on D)',
        -8,
        '8vb',
      ],
      [
        60,
        'C4',
        -2,
        null,
      ],
      [
        77,
        'F5',
        8,
        null,
      ],
      [
        98,
        'D7',
        13,
        '8va',
      ],
      [
        100,
        'E7',
        14,
        '8va',
      ],
    ],
  )(
    '%i %s: drawn at step %i with ottava %s, inside the box',
    (
      midi,
      _name,
      step,
      sign,
    ) => {
      const l =
        liveStaffLayout(
          midi,
        );
      expect(
        l.step,
      ).toBe(
        step,
      );
      expect(
        l
          .label
          ?.text ??
          null,
      ).toBe(
        sign,
      );
      expect(
        l.noteY,
      ).toBeGreaterThanOrEqual(
        5,
      );
      expect(
        l.noteY,
      ).toBeLessThanOrEqual(
        VIEW_H -
          5,
      );
      if (
        l.label
      )
        expect(
          inside(
            l
              .label
              .box,
          ),
          JSON.stringify(
            l.label,
          ),
        ).toBe(
          true,
        );
    },
  );

  it('keeps every mark of every MIDI note inside the fixed box', () => {
    for (
      let midi = 0;
      midi <=
      127;
      midi++
    ) {
      const l =
        liveStaffLayout(
          midi,
        );
      expect(
        l.noteY -
          5,
      ).toBeGreaterThanOrEqual(
        0,
      );
      expect(
        l.noteY +
          5,
      ).toBeLessThanOrEqual(
        VIEW_H,
      );
      for (const y of l.ledgerYs)
        expect(
          y >=
            0 &&
            y <=
              VIEW_H,
        ).toBe(
          true,
        );
      if (
        l.label
      )
        expect(
          inside(
            l
              .label
              .box,
          ),
          `midi ${midi}: ${JSON.stringify(l.label)}`,
        ).toBe(
          true,
        );
    }
  });

  it('names ottava signs by their interval', () => {
    expect(
      ottavaText(
        -1,
      ),
    ).toBe(
      '8vb',
    );
    expect(
      ottavaText(
        1,
      ),
    ).toBe(
      '8va',
    );
    expect(
      ottavaText(
        -2,
      ),
    ).toBe(
      '15mb',
    );
    expect(
      ottavaText(
        2,
      ),
    ).toBe(
      '15ma',
    );
  });
});

describe('the live staff in the bass clef (a bass singer’s first note)', () => {
  it('puts G2 on the bottom line and A3 on the top line, with no ledger lines', () => {
    const g2 =
      liveStaffLayout(
        43,
        'bass',
      );
    expect(
      g2.step,
    ).toBe(
      0,
    );
    expect(
      g2.noteY,
    ).toBe(
      yOf(
        0,
      ),
    );
    expect(
      g2.ledgerYs,
    ).toEqual(
      [],
    );
    expect(
      g2.ottava,
    ).toBe(
      0,
    );
    expect(
      liveStaffLayout(
        57,
        'bass',
      )
        .step,
    ).toBe(
      8,
    );
  });

  it('gives middle C one ledger line above the staff, and a black key its sharp', () => {
    const c4 =
      liveStaffLayout(
        60,
        'bass',
      );
    expect(
      c4.step,
    ).toBe(
      10,
    );
    expect(
      c4.ledgerYs,
    ).toEqual(
      [
        yOf(
          10,
        ),
      ],
    );
    expect(
      liveStaffLayout(
        54,
        'bass',
      )
        .sharp,
    ).toBe(
      true,
    );
  });

  it('moves a note far outside by octaves, with its ottava sign, and keeps the treble default', () => {
    const low =
      liveStaffLayout(
        24,
        'bass',
      );
    expect(
      low.ottava,
    ).toBeLessThan(
      0,
    );
    expect(
      low.step,
    ).toBeGreaterThanOrEqual(
      -8,
    );
    expect(
      liveStaffLayout(
        64,
      ),
    ).toEqual(
      liveStaffLayout(
        64,
        'treble',
      ),
    );
  });
});
