import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  parseSummaryKey,
  parseThreadTitle,
  summaryKey,
} from './sdn-title';

describe('parseThreadTitle', () => {
  it('splits the cycle label from the school stem', () => {
    expect(
      parseThreadTitle(
        '2026-2027 Duke University School of Medicine',
      ),
    ).toEqual(
      {
        cycleYear: 2027,
        stem: 'Duke University School of Medicine',
      },
    );
  });

  it('normalises entities and extra spaces', () => {
    expect(
      parseThreadTitle(
        '2025-2026   Texas A&amp;M   Health  ',
      ),
    ).toEqual(
      {
        cycleYear: 2026,
        stem: 'Texas A&M Health',
      },
    );
  });

  it('is null for a non-consecutive label', () => {
    expect(
      parseThreadTitle(
        '2026-2028 X',
      ),
    ).toBeNull();
  });

  it('is null for a title with no label', () => {
    expect(
      parseThreadTitle(
        'Duke',
      ),
    ).toBeNull();
  });
});

describe('summary keys', () => {
  it('round-trips', () => {
    const key =
      summaryKey(
        'CUCPS',
        'columbia-university',
      );
    expect(
      key,
    ).toBe(
      'summary:CUCPS/columbia-university',
    );
    expect(
      parseSummaryKey(
        key,
      ),
    ).toEqual(
      {
        code: 'CUCPS',
        slug: 'columbia-university',
      },
    );
  });

  it('rejects a key that is not a summary key', () => {
    expect(
      parseSummaryKey(
        'Duke University',
      ),
    ).toBeNull();
    expect(
      parseSummaryKey(
        'summary:nocode',
      ),
    ).toBeNull();
  });
});
