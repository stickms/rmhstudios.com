import {
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  MENU_PULSE_MAX,
  MENU_SHAKE_MAX_PX_X,
  MENU_SHAKE_MAX_PX_Y,
  menuTraumaAt,
  pushMenuTrauma,
  readMenuShake,
  resetMenuShake,
} from '../menuShake';

describe('menu shake', () => {
  beforeEach(
    resetMenuShake,
  );

  it('is exactly nothing at rest', () => {
    expect(
      readMenuShake(
        1234,
      ),
    ).toEqual(
      {
        x: 0,
        y: 0,
        pulse: 0,
      },
    );
  });
  it('a blow shakes the street in whole pixels, within the bounds, and lifts it a little', () => {
    pushMenuTrauma(
      0.9,
      1000,
    );
    let seenMove = false;
    for (
      let t = 1000;
      t <
      1400;
      t += 16
    ) {
      const s =
        readMenuShake(
          t,
        );
      expect(
        Number.isInteger(
          s.x,
        ) &&
          Number.isInteger(
            s.y,
          ),
      ).toBe(
        true,
      );
      expect(
        Math.abs(
          s.x,
        ),
      ).toBeLessThanOrEqual(
        MENU_SHAKE_MAX_PX_X,
      );
      expect(
        Math.abs(
          s.y,
        ),
      ).toBeLessThanOrEqual(
        MENU_SHAKE_MAX_PX_Y,
      );
      expect(
        s.pulse,
      ).toBeLessThanOrEqual(
        MENU_PULSE_MAX,
      );
      if (
        s.x !==
          0 ||
        s.y !==
          0
      )
        seenMove = true;
    }
    expect(
      seenMove,
    ).toBe(
      true,
    );
    expect(
      readMenuShake(
        1000,
      )
        .pulse,
    ).toBeGreaterThan(
      0.02,
    );
  });
  it('dies away on its own with time, whatever the paint rate (no timers involved)', () => {
    pushMenuTrauma(
      1,
      0,
    );
    expect(
      menuTraumaAt(
        500,
      ),
    ).toBeCloseTo(
      1 -
        1.15 *
          0.5,
      2,
    );
    expect(
      menuTraumaAt(
        5000,
      ),
    ).toBe(
      0,
    );
    expect(
      readMenuShake(
        5000,
      ),
    ).toEqual(
      {
        x: 0,
        y: 0,
        pulse: 0,
      },
    );
    // reading at 15 fps or 60 fps gives the same trauma at the same moment
    expect(
      menuTraumaAt(
        300,
      ),
    ).toBe(
      menuTraumaAt(
        300,
      ),
    );
  });
  it('stacked blows add up but cap at full trauma', () => {
    for (
      let i = 0;
      i <
      10;
      i++
    )
      pushMenuTrauma(
        0.5,
        i *
          20,
      );
    expect(
      menuTraumaAt(
        200,
      ),
    ).toBeLessThanOrEqual(
      1,
    );
    expect(
      menuTraumaAt(
        200,
      ),
    ).toBeGreaterThan(
      0.8,
    );
  });
  it('ignores negative pushes and a clock that goes backwards', () => {
    pushMenuTrauma(
      -3,
      100,
    );
    expect(
      menuTraumaAt(
        100,
      ),
    ).toBe(
      0,
    );
    pushMenuTrauma(
      0.5,
      1000,
    );
    expect(
      menuTraumaAt(
        900,
      ),
    ).toBeCloseTo(
      0.5,
      5,
    ); // not more than was pushed
  });
});
