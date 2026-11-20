// Every off-peak gate (bot queue fill, bot upkeep, summaries) reads this one
// function; a wrong boundary moves spend into the expensive hours.
import {
  describe,
  expect,
  it,
} from 'vitest';
import { isDeepseekPeak } from '../deepseek-peak';

describe('isDeepseekPeak', () => {
  it.each(
    [
      '2026-11-23T01:00:00Z',
      '2026-11-23T03:59:59Z',
      '2026-11-23T06:00:00Z',
      '2026-11-23T09:59:59Z',
    ],
  )(
    'is peak at %s (a Monday)',
    (
      iso,
    ) =>
      expect(
        isDeepseekPeak(
          new Date(
            iso,
          ),
        ),
      ).toBe(
        true,
      ),
  );

  it.each(
    [
      '2026-11-23T00:59:59Z',
      '2026-11-23T04:00:00Z',
      '2026-11-23T05:59:59Z',
      '2026-11-23T10:00:00Z',
      '2026-11-21T07:00:00Z', // Saturday
      '2026-11-22T02:00:00Z', // Sunday
    ],
  )(
    'is off-peak at %s',
    (
      iso,
    ) =>
      expect(
        isDeepseekPeak(
          new Date(
            iso,
          ),
        ),
      ).toBe(
        false,
      ),
  );

  it('accepts epoch milliseconds', () => {
    expect(
      isDeepseekPeak(
        Date.parse(
          '2026-11-24T07:30:00Z',
        ),
      ),
    ).toBe(
      true,
    );
  });
});
