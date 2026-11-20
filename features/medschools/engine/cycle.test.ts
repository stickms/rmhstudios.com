import {
  describe,
  it,
  expect,
} from 'vitest';
import {
  cycleYearFromLabel,
  dayOfCycle,
  defaultDayZero,
} from './cycle';

describe('cycle math', () => {
  it('cycleYearFromLabel', () => {
    expect(
      cycleYearFromLabel(
        '2026-2027',
      ),
    ).toBe(
      2027,
    );
    expect(
      () =>
        cycleYearFromLabel(
          '2026-2028',
        ),
    ).toThrow();
    expect(
      () =>
        cycleYearFromLabel(
          'abc',
        ),
    ).toThrow();
  });
  it('defaultDayZero', () => {
    expect(
      defaultDayZero(
        2027,
      ),
    ).toBe(
      '2026-06-01',
    );
  });
  it('dayOfCycle counts whole days', () => {
    expect(
      dayOfCycle(
        '2026-06-01',
        '2026-06-01',
      ),
    ).toBe(
      0,
    );
    expect(
      dayOfCycle(
        '2026-12-31',
        '2026-06-01',
      ),
    ).toBe(
      213,
    );
    // Across the US spring DST change (2027-03-14).
    expect(
      dayOfCycle(
        '2027-03-14',
        '2026-06-01',
      ),
    ).toBe(
      286,
    );
  });
  it.each(
    [
      'America/Los_Angeles',
      'Asia/Tokyo',
      'Pacific/Auckland',
    ],
  )(
    'is unchanged with process TZ=%s',
    (
      tz,
    ) => {
      const prev =
        process
          .env
          .TZ;
      process.env.TZ =
        tz;
      try {
        expect(
          dayOfCycle(
            '2027-03-14',
            '2026-06-01',
          ),
        ).toBe(
          286,
        );
        expect(
          dayOfCycle(
            '2026-11-01',
            '2026-06-01',
          ),
        ).toBe(
          153,
        );
        expect(
          dayOfCycle(
            '2026-06-01',
            '2026-06-01',
          ),
        ).toBe(
          0,
        );
      } finally {
        if (
          prev ===
          undefined
        )
          delete process
            .env
            .TZ;
        else
          process.env.TZ =
            prev;
      }
    },
  );
});
