import {
  describe,
  expect,
  it,
} from 'vitest';
import { governedDpr } from './useRenderQuality';
import {
  SLOW_FOR_MS,
  SlowFrameClock,
} from './slow-frame-clock';

describe('SlowFrameClock', () => {
  it('trips within seconds at 4 fps, not after 90 frames', () => {
    const c =
      new SlowFrameClock();
    let frames = 0;
    let tripped = false;
    for (
      let t = 0;
      t <
        10000 &&
      !tripped;
      t += 250
    ) {
      frames++;
      tripped =
        c.over(
          250,
          20,
        );
    }
    expect(
      tripped,
    ).toBe(
      true,
    );
    expect(
      frames,
    ).toBeLessThan(
      15,
    );
  });
  it('does not trip at 60 fps or on one stall', () => {
    const c =
      new SlowFrameClock();
    for (
      let i = 0;
      i <
      600;
      i++
    )
      expect(
        c.over(
          16.7,
          20,
        ),
      ).toBe(
        false,
      );
    expect(
      c.over(
        3000,
        20,
      ),
    ).toBe(
      false,
    );
    expect(
      SLOW_FOR_MS,
    ).toBeGreaterThan(
      0,
    );
  });
});

describe('governedDpr', () => {
  it('leaves the range alone until the governor steps, then pins it below', () => {
    expect(
      governedDpr(
        [
          1,
          1.25,
        ],
        0,
      ),
    ).toEqual(
      [
        1,
        1.25,
      ],
    );
    const [
      lo,
      hi,
    ] =
      governedDpr(
        [
          0.6,
          1,
        ],
        1,
      );
    expect(
      lo,
    ).toBe(
      hi,
    );
    expect(
      lo,
    ).toBeLessThan(
      1,
    );
    expect(
      governedDpr(
        [
          0.6,
          1,
        ],
        3,
      )[0],
    ).toBe(
      0.5,
    );
  });
});
