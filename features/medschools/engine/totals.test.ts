import { describe, expect, it } from 'vitest';
import { SHORT_SOURCE_NAMES, SOURCE_NAMES } from './public-read';
import { buildTotalsMatrix } from './totals';

const src = (source: 'CYCLETRACK' | 'ADMIT' | 'SDN', total: number) => ({ source, total, days: [] });

describe('buildTotalsMatrix', () => {
  const types = [
    {
      eventType: 'INTERVIEW' as const,
      primary: 'CYCLETRACK' as const,
      sources: [src('CYCLETRACK', 120), src('SDN', 14)],
    },
    { eventType: 'SECONDARY' as const, primary: 'ADMIT' as const, sources: [src('ADMIT', 30)] },
    { eventType: 'WAITLIST' as const, primary: null, sources: [] },
  ];
  it('has one column per source that appears anywhere, in primary order, and drops categories with no data', () => {
    const m = buildTotalsMatrix(types);
    expect(m.sources).toEqual(['CYCLETRACK', 'ADMIT', 'SDN']);
    expect(m.rows.map((r) => r.eventType)).toEqual(['INTERVIEW', 'SECONDARY']);
  });
  it('cells line up with the columns, null where a source has nothing, and mark the primary', () => {
    const m = buildTotalsMatrix(types);
    expect(m.rows[0]!.cells).toEqual([{ total: 120, primary: true }, null, { total: 14, primary: false }]);
    expect(m.rows[1]!.cells).toEqual([null, { total: 30, primary: true }, null]);
  });
  it('is empty when nothing was reported', () => {
    expect(buildTotalsMatrix([{ eventType: 'INTERVIEW', primary: null, sources: [] }])).toEqual({
      sources: [],
      rows: [],
    });
  });
});

describe('SHORT_SOURCE_NAMES', () => {
  it('names every source and is never longer than the full name', () => {
    for (const k of Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]) {
      expect(SHORT_SOURCE_NAMES[k].length).toBeGreaterThan(0);
      expect(SHORT_SOURCE_NAMES[k].length).toBeLessThanOrEqual(SOURCE_NAMES[k].length);
    }
    expect(SHORT_SOURCE_NAMES.SDN).toBe('SDN');
    expect(SHORT_SOURCE_NAMES.ADMIT).toBe('Admit');
  });
});

describe('buildTotalsMatrix with withdrawn and hold', () => {
  it('adds them as rows after the charted ones, with their own source columns', () => {
    const m = buildTotalsMatrix(
      [{ eventType: 'INTERVIEW', primary: 'ADMIT', sources: [{ source: 'ADMIT', days: [], total: 5 }] }],
      [{ eventType: 'HOLD', sources: [{ source: 'SDN', total: 2 }] }],
    );
    expect(m.sources).toEqual(['ADMIT', 'SDN']);
    expect(m.rows.map((r) => r.eventType)).toEqual(['INTERVIEW', 'HOLD']);
    expect(m.rows[1]!.cells).toEqual([null, { total: 2, primary: true }]);
  });
});
