import { describe, expect, it } from 'vitest';
import {
  MCAT_PERCENTILE_MARGIN,
  MCAT_WEIGHTS,
  gpaBand,
  labelFor,
  percentileBand,
  schoolFigures,
  weightedMcat,
  type MemberFigures,
} from './label';
import { cls, stat } from './fixtures';

const figs = (...stats: ReturnType<typeof stat>[]) => schoolFigures([cls(stats)]);
// Median MCAT 515 is percentile rank 91 in AAMC's 2026-2027 table.
const both = figs(stat('MCAT_MEDIAN', '515', 515), stat('GPA_MEDIAN', '3.80', 3.8));
/** One attempt, or the latest and the earlier ones. */
const me = (mcat: number | null, gpa: number | null, earlier: number[] = []): MemberFigures => ({
  mcat: mcat === null ? null : { latest: mcat, earlier },
  gpa,
});

describe('weightedMcat', () => {
  it('the weights are 0.8 and 0.2, in one constant', () => {
    expect(MCAT_WEIGHTS).toEqual({ latest: 0.8, earlier: 0.2 });
  });
  it('one attempt is the latest itself', () => {
    expect(weightedMcat(514, [])).toBe(514);
  });
  it('0.8 x latest + 0.2 x the mean of the earlier totals, rounded to a whole score', () => {
    expect(weightedMcat(514, [505])).toBe(512); // 512.2
    expect(weightedMcat(505, [514])).toBe(507); // 506.8
    expect(weightedMcat(514, [505, 508])).toBe(513); // 512.5, half up
    expect(weightedMcat(510, [507, 508])).toBe(510); // 509.5, half up
    expect(weightedMcat(510, [511])).toBe(510); // 510.2
    expect(weightedMcat(520, [500, 500, 500])).toBe(516);
  });
});

describe('bands', () => {
  it('MCAT by percentile rank: exactly 5 points either way is near, 6 is above or below', () => {
    expect(MCAT_PERCENTILE_MARGIN).toBe(5);
    expect(percentileBand(95, 90)).toBe('near');
    expect(percentileBand(96, 90)).toBe('above');
    expect(percentileBand(85, 90)).toBe('near');
    expect(percentileBand(84, 90)).toBe('below');
    expect(percentileBand(0, 0)).toBe('near');
  });
  it('GPA: 0.10 either way, in hundredths (no float drift)', () => {
    expect(gpaBand(3.9, 3.8)).toBe('above');
    expect(gpaBand(3.89, 3.8)).toBe('near');
    expect(gpaBand(3.71, 3.8)).toBe('near');
    expect(gpaBand(3.7, 3.8)).toBe('below');
    expect(gpaBand(0.3, 0.2)).toBe('above');
  });
});

describe('labelFor', () => {
  it('both above is likely; both near is target; any below is reach', () => {
    expect(labelFor(me(520, 3.9), both).label).toBe('likely'); // 97 vs 91
    expect(labelFor(me(515, 3.8), both).label).toBe('target');
    expect(labelFor(me(520, 3.7), both).label).toBe('reach');
    expect(labelFor(me(512, 4.0), both).label).toBe('reach'); // 84 vs 91
    expect(labelFor(me(520, 3.85), both).label).toBe('target');
  });

  it('MCAT edges in the table: 5 percentile points is near, 6 is above or below', () => {
    const at = (n: number) => figs(stat('MCAT_MEDIAN', String(n), n));
    expect(labelFor(me(518, null), at(515)).comparisons[0]?.band).toBe('near'); // 95 vs 91: 4 points (3 scores)
    expect(labelFor(me(517, null), at(514)).comparisons[0]?.band).toBe('near'); // 94 vs 89: +5
    expect(labelFor(me(518, null), at(514)).comparisons[0]?.band).toBe('above'); // 95 vs 89: +6
    expect(labelFor(me(514, null), at(517)).comparisons[0]?.band).toBe('near'); // 89 vs 94: -5
    expect(labelFor(me(514, null), at(518)).comparisons[0]?.band).toBe('below'); // 89 vs 95: -6
    expect(labelFor(me(473, null), at(477)).comparisons[0]?.band).toBe('near'); // "<1" (0) vs 2
  });

  it('the weighted score is what is compared', () => {
    // Latest 518 alone is 95, above 89; weighted with an earlier 500 it is 514 (89), near.
    expect(labelFor(me(518, null), figs(stat('MCAT_MEDIAN', '514', 514))).comparisons[0]?.band).toBe('above');
    const r = labelFor(me(518, null, [500]), figs(stat('MCAT_MEDIAN', '514', 514)));
    expect(r.comparisons[0]).toMatchObject({ yours: '514', band: 'near' });
  });

  it('one figure compared is never likely', () => {
    expect(labelFor(me(528, null), both).label).toBe('target');
    expect(labelFor(me(null, 4.0), figs(stat('GPA_MEAN', '3.50', 3.5))).label).toBe('target');
    expect(labelFor(me(500, null), both).label).toBe('reach');
  });

  it('a school figure with no rank in the table is not compared and does not count', () => {
    const odd = figs(stat('MCAT_MEDIAN', '530', 530), stat('GPA_MEDIAN', '3.80', 3.8));
    const r = labelFor(me(528, 4.0), odd);
    expect(r.comparisons[0]).toMatchObject({ metric: 'MCAT', band: 'not-compared' });
    expect(r.comparisons[0]?.mcat?.theirsPct).toBeNull();
    expect(r.label).toBe('target'); // the GPA alone, above
    expect(labelFor(me(528, null), figs(stat('MCAT_MEDIAN', '530', 530))).label).toBe('not-enough-data');
    expect(labelFor(me(528, null), figs(stat('MCAT_MEDIAN', '471', 471))).comparisons[0]?.band).toBe('not-compared');
  });

  it('a school’s decimal mean is looked up at its nearest whole score', () => {
    const r = labelFor(me(512, null), figs(stat('MCAT_MEAN', '511.6', 511.6)));
    expect(r.comparisons[0]?.mcat?.theirsPct).toEqual({ rank: 84, printed: '84' });
    expect(r.comparisons[0]?.band).toBe('near');
  });

  it('a range is never compared: only the GPA is', () => {
    const r = labelFor(me(515, 3.8), figs(stat('MCAT_RANGE', '500-525', null), stat('GPA_MEDIAN', '3.80', 3.8)));
    expect(r.comparisons.map((c) => c.metric)).toEqual(['GPA']);
    expect(r.label).toBe('target');
  });

  it('no published figure, or none the member gave: not enough published data', () => {
    expect(labelFor(me(515, 3.8), schoolFigures([])).label).toBe('not-enough-data');
    expect(labelFor(me(null, null), both).label).toBe('not-enough-data');
    expect(labelFor(me(515, null), figs(stat('GPA_MEDIAN', '3.80', 3.8))).label).toBe('not-enough-data');
  });

  it('without the member’s stats it is not compared', () => {
    expect(labelFor(null, both)).toEqual({ label: 'not-compared', comparisons: [] });
  });

  it('shows the comparison it used: the weighted score, both percentile ranks, the school’s own string', () => {
    const r = labelFor(me(514, 3.81, [505]), both);
    expect(r.comparisons).toEqual([
      {
        metric: 'MCAT',
        yours: '512',
        theirs: '515',
        stat: 'median',
        band: 'below', // 84 vs 91: -7
        mcat: {
          latest: 514,
          earlier: [505],
          yoursPct: { rank: 84, printed: '84' },
          theirsPct: { rank: 91, printed: '91' },
        },
      },
      { metric: 'GPA', yours: '3.81', theirs: '3.80', stat: 'median', band: 'near', mcat: null },
    ]);
    expect(labelFor(me(472, null), both).comparisons[0]?.mcat?.yoursPct).toEqual({ rank: 0, printed: '<1' });
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
