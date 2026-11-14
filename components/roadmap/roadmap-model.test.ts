import {
  describe,
  expect,
  it,
} from 'vitest';
import {
  COMMITTED_YEARS,
  eraColorFor,
} from './roadmap-model';
import { roadmap } from './roadmap-data';

describe('roadmap model', () => {
  it('colours committed eras with the warning token and the rest with the accent', () => {
    for (const y of COMMITTED_YEARS)
      expect(
        eraColorFor(
          y,
        ),
      ).toBe(
        'var(--site-warning)',
      );
    expect(
      eraColorFor(
        'Years 6–7',
      ),
    ).toBe(
      'var(--site-accent)',
    );
  });
  it('keeps the chronology whole and ordered', () => {
    expect(
      roadmap,
    ).toHaveLength(
      31,
    );
    expect(
      roadmap[0]
        ?.year,
    ).toBe(
      'Year 1',
    );
    expect(
      roadmap.at(
        -1,
      )
        ?.year,
    ).toBe(
      'Years 751–1,000',
    );
    for (const y of COMMITTED_YEARS)
      expect(
        roadmap.some(
          (
            s,
          ) =>
            s.year ===
            y,
        ),
      ).toBe(
        true,
      );
  });
});
