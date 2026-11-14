import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  resolveMenuQuality,
  type MenuQualityInput,
} from './menuQuality';

const base: MenuQualityInput =
  {
    setting:
      'auto',
    preference:
      'auto',
    isMobile: false,
    devicePixelRatio: 2,
  };

describe('resolveMenuQuality', () => {
  it('auto on a capable desktop is smooth with MSAA, capped at 1.5x', () => {
    const q =
      resolveMenuQuality(
        base,
      );
    expect(
      q,
    ).toMatchObject(
      {
        mode: 'smooth',
        antialias: true,
        dpr: 1.5,
        fps: 30,
        lights: 3,
      },
    );
    expect(
      resolveMenuQuality(
        {
          ...base,
          devicePixelRatio: 3,
        },
      )
        .dpr,
    ).toBe(
      1.5,
    );
    expect(
      resolveMenuQuality(
        {
          ...base,
          devicePixelRatio: 1,
        },
      )
        .dpr,
    ).toBe(
      1,
    );
  });
  it('auto on a phone, the Low preset, or a low-memory/low-core machine is cheap pixel mode', () => {
    for (const over of [
      {
        isMobile: true,
      },
      {
        preference:
          'low' as const,
      },
      {
        deviceMemory: 2,
      },
      {
        hardwareConcurrency: 2,
      },
    ]) {
      const q =
        resolveMenuQuality(
          {
            ...base,
            ...over,
          },
        );
      expect(
        q,
      ).toMatchObject(
        {
          mode: 'pixel',
          antialias: false,
          dpr: 0.4,
          fps: 24,
          lights: 2,
        },
      );
    }
  });
  it('the Medium preset picks the standard pixel mode', () => {
    expect(
      resolveMenuQuality(
        {
          ...base,
          preference:
            'medium',
        },
      ),
    ).toMatchObject(
      {
        mode: 'pixel',
        dpr: 0.5,
        fps: 30,
      },
    );
  });
  it('an explicit choice wins over the device, but smooth on a weak device stays at 1x', () => {
    expect(
      resolveMenuQuality(
        {
          ...base,
          setting:
            'pixel',
        },
      )
        .mode,
    ).toBe(
      'pixel',
    );
    const weakSmooth =
      resolveMenuQuality(
        {
          ...base,
          setting:
            'smooth',
          isMobile: true,
        },
      );
    expect(
      weakSmooth,
    ).toMatchObject(
      {
        mode: 'smooth',
        antialias: true,
        dpr: 1,
      },
    );
    expect(
      resolveMenuQuality(
        {
          ...base,
          setting:
            'off',
        },
      )
        .mode,
    ).toBe(
      'off',
    );
  });
  it('never returns a resolution scale that is zero, negative or NaN', () => {
    for (const dpr of [
      0,
      -2,
      NaN,
    ]) {
      const q =
        resolveMenuQuality(
          {
            ...base,
            setting:
              'smooth',
            devicePixelRatio:
              dpr,
          },
        );
      expect(
        q.dpr,
      ).toBeGreaterThanOrEqual(
        1,
      );
      expect(
        Number.isFinite(
          q.dpr,
        ),
      ).toBe(
        true,
      );
    }
  });
});
