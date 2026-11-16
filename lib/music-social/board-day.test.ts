import {
  describe,
  expect,
  it,
} from 'vitest';
import { boardDate } from './board-day';
import { readFileSync } from 'node:fs';

describe('boardDate', () => {
  it('is the UTC date of today or yesterday', () => {
    const now =
      Date.parse(
        '2026-11-16T00:10:00Z',
      );
    expect(
      boardDate(
        'today',
        now,
      ),
    ).toBe(
      '2026-11-16',
    );
    expect(
      boardDate(
        'yesterday',
        now,
      ),
    ).toBe(
      '2026-11-15',
    );
  });

  it('imports nothing, because the daily route loader is on the critical path', () => {
    const src =
      readFileSync(
        new URL(
          './board-day.ts',
          import.meta
            .url,
        ),
        'utf8',
      );
    expect(
      src,
    ).not.toMatch(
      /^\s*import\s/m,
    );
  });
});
