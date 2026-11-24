import { describe, expect, it } from 'vitest';
import {
  TYPICAL_TIMELINE,
  barModel,
  isDrawableTimeline,
  normalisePattern,
  phaseRange,
  segmentShares,
  statedTotal,
  timelineHasContent,
  type PhaseEntry,
} from './mdphd';
import { evidenceFound, evidencePieces, normEvidence, stripHtml } from './mdphd-evidence';

const p = (phase: PhaseEntry['phase'], years: number | null, label: string = phase): PhaseEntry => ({
  phase,
  years,
  label,
});

describe('normalisePattern', () => {
  it('drops the spaces a page puts round the dashes and keeps its letters', () => {
    expect(normalisePattern('1.5 - 4 - 2.5')).toBe('1.5-4-2.5');
    expect(normalisePattern('2–4–2')).toBe('2-4-2');
    expect(normalisePattern('2-P-2')).toBe('2-P-2');
    expect(normalisePattern(null)).toBeNull();
    expect(normalisePattern('  ')).toBeNull();
  });
});

describe('phaseRange and statedTotal', () => {
  it('reads a length range from the phase words, never a position in the programme', () => {
    expect(phaseRange('Graduate School (3.5 to 4.5 years)')).toEqual([3.5, 4.5]);
    expect(phaseRange('three or four years')).toEqual([3, 4]);
    expect(phaseRange('3-4 years of research')).toEqual([3, 4]);
    expect(phaseRange('During years three through six')).toBeNull();
    expect(phaseRange('Year 3 (PhD 1) through Year 5-6 (PhD 3)')).toBeNull();
    expect(phaseRange('PhD research')).toBeNull();
  });

  it('takes the stated total, else a programme-length range in the words, never a sum of phases', () => {
    expect(statedTotal(8.2, 'Average time 8.2 years')).toEqual({ years: 8.2 });
    expect(statedTotal(null, 'takes approximately seven to eight years to complete')).toEqual({ range: [7, 8] });
    expect(statedTotal(null, 'training as a physician and a scientist for 7 to 9 years')).toEqual({ range: [7, 9] });
    // a phase's own range is not the programme's length
    expect(statedTotal(null, 'After 3.5 to 4.5 years of PhD training')).toBeNull();
    expect(statedTotal(null, 'designed to be completed in 23 semesters')).toBeNull();
  });
});

describe('barModel and segmentShares (the phase bar proportions)', () => {
  it('2-4-2 is a quarter, a half and a quarter', () => {
    const m = barModel(TYPICAL_TIMELINE.phases);
    expect(m.proportional).toBe(true);
    expect(m.complete).toBe(true);
    expect(segmentShares(m)).toEqual([25, 50, 25]);
  });

  it('1.5-4-2.5 and 3-3-1 are proportional to their years', () => {
    expect(segmentShares(barModel([p('preclinical', 1.5), p('research', 4), p('clinical', 2.5)]))).toEqual([
      18.8, 50, 31.3,
    ]);
    expect(segmentShares(barModel([p('preclinical', 3), p('research', 3), p('clinical', 1)]))).toEqual([
      42.9, 42.9, 14.3,
    ]);
  });

  it('is equal when any length is unknown, and keeps the range for the label', () => {
    const m = barModel([p('preclinical', 2), p('research', null, 'PhD (3.5 to 4.5 years)'), p('clinical', 2)]);
    expect(m.proportional).toBe(false);
    expect(m.complete).toBe(false);
    expect(segmentShares(m)).toEqual([33.3, 33.3, 33.3]);
    expect(m.segments[1]!.range).toEqual([3.5, 4.5]);
  });

  it('lists rotations beside the bar and merges the phase they split (UW: MS1, rotation, MS2)', () => {
    const m = barModel([
      p('preclinical', 1, 'Year 1'),
      p('other', null, 'Summer after MS1: Lab rotation(s)'),
      p('preclinical', 1, 'Year 2'),
      p('research', 4),
      p('clinical', 2),
    ]);
    expect(m.segments.map((s) => [s.phase, s.years])).toEqual([
      ['preclinical', 2],
      ['research', 4],
      ['clinical', 2],
    ]);
    expect(m.extras).toEqual(['Summer after MS1: Lab rotation(s)']);
    expect(segmentShares(m)).toEqual([25, 50, 25]);
  });

  it('keeps the page order when clerkships come before the PhD (Mount Sinai, Iowa)', () => {
    const m = barModel([
      p('other', null, 'laboratory rotation the summer before the first year'),
      p('preclinical', null),
      p('clinical', null),
      p('research', null),
      p('clinical', null),
    ]);
    expect(m.segments.map((s) => s.phase)).toEqual(['preclinical', 'clinical', 'research', 'clinical']);
    expect(segmentShares(m)).toEqual([25, 25, 25, 25]);
  });

  it('draws a timeline only when it names PhD research and a medical phase', () => {
    expect(isDrawableTimeline([p('research', 4), p('clinical', 2)])).toBe(true);
    expect(isDrawableTimeline([p('other', null)])).toBe(false);
    expect(isDrawableTimeline([p('preclinical', 1.5)])).toBe(false);
    expect(timelineHasContent({ phases: [], totalYears: 8.2, evidence: 'Average 8.2 years' })).toBe(true);
    expect(timelineHasContent({ phases: [], totalYears: null, evidence: 'completed in 23 semesters' })).toBe(false);
  });
});

describe('the evidence rule (ported from the research pass)', () => {
  const page = normEvidence(
    stripHtml(
      '<h2>Program Timeline</h2><p>Years 1&ndash;2: Pre-Clinical Medical Training</p><table><tr><td>Year 3</td><td>Ph.D.</td></tr></table><p>Total time to completion: Most students finish in 8 years</p>',
    ),
  );

  it('finds a verbatim quote after folding dashes, quotes and whitespace', () => {
    expect(evidenceFound(page, 'Years 1–2: Pre-Clinical   Medical Training')).toBe(true);
    expect(evidenceFound(page, 'Most students finish in 8 years')).toBe(true);
  });

  it('needs every piece of four words or more around an ellipsis', () => {
    expect(evidencePieces('Years 1-2: Pre-Clinical Medical Training … Most students finish in 8 years')).toHaveLength(
      2,
    );
    expect(evidenceFound(page, 'Years 1-2: Pre-Clinical Medical Training … Most students finish in 8 years')).toBe(
      true,
    );
    expect(evidenceFound(page, 'Years 1-2: Pre-Clinical Medical Training … Most students finish in 9 years')).toBe(
      false,
    );
  });

  it('falls back to letters and digits in order for table text, at 20 characters or more', () => {
    expect(evidenceFound(page, 'Program Timeline: Years 1-2 Pre-Clinical')).toBe(true);
    expect(evidenceFound(page, 'Year 4 Ph.D. Total time')).toBe(false);
    expect(evidenceFound(page, 'Timeline Years 1-2 Pre')).toBe(false);
  });

  it('rejects a missing, empty or paraphrased quote', () => {
    expect(evidenceFound(page, null)).toBe(false);
    expect(evidenceFound(page, 'short one')).toBe(false);
    expect(evidenceFound(page, 'Most students complete the program in eight years')).toBe(false);
  });
});
