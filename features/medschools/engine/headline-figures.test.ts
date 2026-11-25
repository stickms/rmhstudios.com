/**
 * The headline figures (the link-preview card's and the school page description's MCAT and GPA) and the school page's
 * title and description: exactly the Facts tab's figures, never computed, never an MD-PhD-only figure.
 */
import { describe, expect, it } from 'vitest';
import {
  HEADLINE_GPA,
  HEADLINE_MCAT,
  headlineFigures,
  schoolDescription,
  schoolTitle,
  type HeadlineStatInput,
} from './headline-figures';
import { PROFILE_KINDS } from './school-facts';

const stat = (kind: string, value: string, program = 'REG', qualifier: string | null = null): HeadlineStatInput => ({
  kind,
  program,
  value,
  qualifier,
});

describe('headlineFigures', () => {
  it("labels each kind as the Facts tab's tile does", () => {
    for (const [kind, label] of [...HEADLINE_MCAT, ...HEADLINE_GPA]) {
      expect(label).toBe(PROFILE_KINDS[kind].label);
    }
  });

  it('reads the newest class only, regular program only, preferring median, then mean, then the unnamed figure', () => {
    const classes = [
      {
        stats: [
          stat('MCAT_MEAN', '517'),
          stat('MCAT_MEDIAN', '519'),
          stat('MCAT_MEDIAN', '522', 'PHD', 'MD-PhD (MSTP)'),
          stat('GPA_SCORE', '3.9'),
          stat('GPA_MEAN', '3.82'),
          stat('APPLICANTS', '7,412'),
        ],
      },
      { stats: [stat('GPA_MEDIAN', '3.95')] },
    ];
    expect(headlineFigures(classes)).toEqual([
      { kind: 'MCAT_MEDIAN', label: 'Median MCAT', value: '519', scope: null },
      { kind: 'GPA_MEAN', label: 'Mean GPA', value: '3.82', scope: null },
    ]);
  });

  it('keeps the value as the page writes it and the scope only when it says something', () => {
    expect(
      headlineFigures([
        {
          stats: [
            stat('MCAT_SCORE', '511.5', 'REG', 'five-year average'),
            stat('GPA_MEAN', '3.7', 'REG', 'Overall GPA'),
          ],
        },
      ]),
    ).toEqual([
      { kind: 'MCAT_SCORE', label: 'MCAT', value: '511.5', scope: 'five-year average' },
      { kind: 'GPA_MEAN', label: 'Mean GPA', value: '3.7', scope: null },
    ]);
  });

  it('is empty without a profile, without either figure, or with only a range or MD-PhD figures', () => {
    expect(headlineFigures([])).toEqual([]);
    expect(headlineFigures([{ stats: [stat('MCAT_RANGE', '500-525'), stat('APPLICANTS', '6,000+')] }])).toEqual([]);
    expect(headlineFigures([{ stats: [stat('MCAT_MEAN', '520', 'PHD')] }])).toEqual([]);
  });
});

describe('the school page head', () => {
  const figs = headlineFigures([{ stats: [stat('MCAT_MEDIAN', '519'), stat('GPA_MEAN', '3.82')] }]);

  it('titles the page with the school and the app', () => {
    expect(schoolTitle('Duke University')).toBe('Duke University | RMH Med Schools');
    expect(schoolTitle(undefined)).toBe('Medical school | RMH Med Schools');
  });

  it('describes what the page holds, with the class figures when the profile has them, and says events, not applicants', () => {
    const plain = schoolDescription('Duke University');
    expect(plain).toBe(
      'Reported interview invites and decisions at Duke University by day, with secondaries and interview questions. Reported events, not applicants.',
    );
    const withFigs = schoolDescription('Duke University', figs);
    expect(withFigs).toBe(
      'Reported interview invites and decisions at Duke University by day. Entering class: median MCAT 519, mean GPA 3.82. Reported events, not applicants.',
    );
    for (const d of [plain, withFigs]) {
      expect(d.length).toBeGreaterThanOrEqual(120);
      expect(d.length).toBeLessThanOrEqual(165);
      expect(d).not.toMatch(/!/);
    }
  });

  it('leaves a scoped figure out of the description, and keeps an all-capitals label as it is', () => {
    const scoped = headlineFigures([
      { stats: [stat('MCAT_SCORE', '503'), stat('GPA_MEAN', '3.61', 'REG', 'five-year average')] },
    ]);
    expect(schoolDescription('Touro', scoped)).toContain('Entering class: MCAT 503.');
    expect(schoolDescription('Touro', scoped)).not.toContain('3.61');
  });
});
