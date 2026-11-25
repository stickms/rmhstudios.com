import { describe, expect, it } from 'vitest';
import { band, labelFor, schoolFigures } from './label';
import { cls, stat } from './fixtures';

const figs = (...stats: ReturnType<typeof stat>[]) => schoolFigures([cls(stats)]);
const both = figs(stat('MCAT_MEDIAN', '515', 515), stat('GPA_MEDIAN', '3.80', 3.8));

describe('band', () => {
  it('MCAT: 3 points either way is the edge', () => {
    expect(band('MCAT', 518, 515)).toBe('above');
    expect(band('MCAT', 517, 515)).toBe('near');
    expect(band('MCAT', 513, 515)).toBe('near');
    expect(band('MCAT', 512, 515)).toBe('below');
  });
  it('GPA: 0.10 either way, in hundredths (no float drift)', () => {
    expect(band('GPA', 3.9, 3.8)).toBe('above');
    expect(band('GPA', 3.89, 3.8)).toBe('near');
    expect(band('GPA', 3.71, 3.8)).toBe('near');
    expect(band('GPA', 3.7, 3.8)).toBe('below');
    expect(band('GPA', 0.3, 0.2)).toBe('above');
  });
});

describe('labelFor', () => {
  it('both above is likely; both near is target; any below is reach', () => {
    expect(labelFor({ mcat: 518, gpa: 3.9 }, both).label).toBe('likely');
    expect(labelFor({ mcat: 515, gpa: 3.8 }, both).label).toBe('target');
    expect(labelFor({ mcat: 520, gpa: 3.7 }, both).label).toBe('reach');
    expect(labelFor({ mcat: 512, gpa: 4.0 }, both).label).toBe('reach');
    expect(labelFor({ mcat: 518, gpa: 3.85 }, both).label).toBe('target');
  });

  it('one figure compared is never likely', () => {
    expect(labelFor({ mcat: 528, gpa: null }, both).label).toBe('target');
    expect(labelFor({ mcat: null, gpa: 4.0 }, figs(stat('GPA_MEAN', '3.50', 3.5))).label).toBe('target');
    expect(labelFor({ mcat: 500, gpa: null }, both).label).toBe('reach');
  });

  it('no published figure, or none the member gave: not enough published data', () => {
    expect(labelFor({ mcat: 515, gpa: 3.8 }, schoolFigures([])).label).toBe('not-enough-data');
    expect(labelFor({ mcat: null, gpa: null }, both).label).toBe('not-enough-data');
    expect(labelFor({ mcat: 515, gpa: null }, figs(stat('GPA_MEDIAN', '3.80', 3.8))).label).toBe('not-enough-data');
  });

  it('without the member’s stats it is not compared', () => {
    expect(labelFor(null, both)).toEqual({ label: 'not-compared', comparisons: [] });
  });

  it('shows the comparison it used, with the school’s own string and statistic', () => {
    const r = labelFor({ mcat: 513, gpa: 3.81 }, both);
    expect(r.comparisons).toEqual([
      { metric: 'MCAT', yours: '513', theirs: '515', stat: 'median', band: 'near' },
      { metric: 'GPA', yours: '3.81', theirs: '3.80', stat: 'median', band: 'near' },
    ]);
  });
});

describe('schoolFigures', () => {
  it('median over mean over the plain figure; a range or a figure with no number is never used', () => {
    expect(schoolFigures([cls([stat('MCAT_MEAN', '510', 510), stat('MCAT_MEDIAN', '511', 511)])]).mcat?.kind).toBe(
      'MCAT_MEDIAN',
    );
    expect(schoolFigures([cls([stat('MCAT_SCORE', '509', 509), stat('MCAT_MEAN', '510', 510)])]).mcat?.kind).toBe(
      'MCAT_MEAN',
    );
    expect(schoolFigures([cls([stat('MCAT_RANGE', '500-525', null)])]).mcat).toBeNull();
    expect(schoolFigures([cls([stat('MCAT_MEDIAN', '~515', null), stat('MCAT_SCORE', '514', 514)])]).mcat?.kind).toBe(
      'MCAT_SCORE',
    );
  });

  it('an MD-PhD-only figure is not the class’s', () => {
    expect(schoolFigures([cls([stat('MCAT_MEDIAN', '521', 521, 'PHD')])]).mcat).toBeNull();
  });

  it('both figures come from the first class that has either', () => {
    const f = schoolFigures([
      cls([stat('APPLICANTS', '6000', 6000)], { label: 'Current' }),
      cls([stat('MCAT_MEDIAN', '515', 515)], { label: 'Entered 2026' }),
      cls([stat('GPA_MEDIAN', '3.90', 3.9)], { label: 'Entered 2025' }),
    ]);
    expect(f.cls?.label).toBe('Entered 2026');
    expect(f.gpa).toBeNull();
  });
});
