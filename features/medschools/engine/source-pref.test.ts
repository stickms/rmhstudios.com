import { describe, expect, it } from 'vitest';
import { PRIMARY_ORDER, buildTypeSeries, overlaySource, pickPrimary, primaryOrder } from './public-read';
import { parseIndexSearch, parseSchoolSearch, parseSourcePref, validateIndexSearch } from './search';
import { pickSourcePref, parseStoredSourcePref } from './source-pref';
import { sourceParamOf } from '../medschools.queries';
import { buildTotalsMatrix } from './totals';

describe('primaryOrder: the choice reorders, never sums', () => {
  it('moves the chosen source to the front and keeps the rest of the order', () => {
    expect(primaryOrder()).toBe(PRIMARY_ORDER);
    expect(primaryOrder('CYCLETRACK')).toEqual(PRIMARY_ORDER);
    expect(primaryOrder('ADMIT')).toEqual(['ADMIT', 'CYCLETRACK', 'SDN', 'RMH', 'MDAPPLICANTS']);
  });
  it('picks the chosen source when present, else the other, else the existing order', () => {
    expect(pickPrimary(['CYCLETRACK', 'ADMIT', 'SDN'], 'ADMIT')).toBe('ADMIT');
    expect(pickPrimary(['CYCLETRACK', 'SDN'], 'ADMIT')).toBe('CYCLETRACK');
    expect(pickPrimary(['SDN', 'RMH'], 'ADMIT')).toBe('SDN');
    expect(pickPrimary(['ADMIT', 'SDN'], 'CYCLETRACK')).toBe('ADMIT');
    expect(pickPrimary([], 'ADMIT')).toBeNull();
  });
  it('a series keeps every source with its own total; only `primary` moves', () => {
    const rows = [
      { source: 'CYCLETRACK' as const, date: '2026-10-01', count: 5, contributors: null },
      { source: 'ADMIT' as const, date: '2026-10-01', count: 3, contributors: null },
    ];
    const plain = buildTypeSeries(rows, '2027-01-01');
    const admit = buildTypeSeries(rows, '2027-01-01', 'ADMIT');
    expect(plain.primary).toBe('CYCLETRACK');
    expect(admit.primary).toBe('ADMIT');
    expect(admit.sources).toEqual(plain.sources);
    expect(admit.sources.map((s) => s.total)).toEqual([5, 3]);
  });
  it('the History overlay prefers the chosen source in the newest cycle', () => {
    const cycles = [
      { cycleYear: 2027, sources: ['CYCLETRACK' as const, 'ADMIT' as const] },
      { cycleYear: 2026, sources: ['CYCLETRACK' as const, 'ADMIT' as const] },
    ];
    expect(overlaySource(cycles)).toBe('CYCLETRACK');
    expect(overlaySource(cycles, 'ADMIT')).toBe('ADMIT');
    expect(overlaySource([{ cycleYear: 2027, sources: ['CYCLETRACK'] }], 'ADMIT')).toBe('CYCLETRACK');
  });
  it('the totals table leads with the chosen source and bolds it where it has a figure', () => {
    const types = [
      {
        eventType: 'INTERVIEW' as const,
        primary: 'ADMIT' as const,
        sources: [
          { source: 'CYCLETRACK' as const, days: [], total: 5 },
          { source: 'ADMIT' as const, days: [], total: 3 },
        ],
      },
    ];
    const other = [{ eventType: 'HOLD' as const, sources: [{ source: 'CYCLETRACK' as const, total: 2 }] }];
    const m = buildTotalsMatrix(types, other, 'ADMIT');
    expect(m.sources).toEqual(['ADMIT', 'CYCLETRACK']);
    expect(m.rows[0]!.cells).toEqual([
      { total: 3, primary: true },
      { total: 5, primary: false },
    ]);
    // Hold has no Admit figure: CycleTrack is its bold cell.
    expect(m.rows[1]!.cells).toEqual([null, { total: 2, primary: true }]);
    expect(buildTotalsMatrix(types, other).sources).toEqual(['CYCLETRACK', 'ADMIT']);
  });
});

describe('the source choice: parsing and precedence (URL > device > default)', () => {
  it('parses the URL value in any case and drops anything else', () => {
    expect(parseSourcePref('admit')).toBe('admit');
    expect(parseSourcePref('ADMIT')).toBe('admit');
    expect(parseSourcePref(' CycleTrack ')).toBe('cycletrack');
    for (const bad of ['SDN', 'rmh', '', 'admit.org', 1, null, undefined, {}])
      expect(parseSourcePref(bad)).toBeUndefined();
  });
  it("the index search carries it; the school page reads it out of History's source param", () => {
    expect(parseIndexSearch({ source: 'Admit' }).source).toBe('admit');
    expect(parseIndexSearch({ source: 'junk' })).not.toHaveProperty('source');
    expect(validateIndexSearch({ source: 'admit' }).source).toBe('admit');
    expect(parseSourcePref(parseSchoolSearch({ source: 'admit' }).source)).toBe('admit');
    expect(parseSourcePref(parseSchoolSearch({ source: 'SDN' }).source)).toBeUndefined();
  });
  it('URL wins over the device, the device over the default', () => {
    expect(pickSourcePref('cycletrack', 'admit')).toEqual({ value: 'cycletrack', from: 'url' });
    expect(pickSourcePref('admit', undefined)).toEqual({ value: 'admit', from: 'url' });
    expect(pickSourcePref(undefined, 'admit')).toEqual({ value: 'admit', from: 'device' });
    expect(pickSourcePref(undefined, undefined)).toEqual({ value: 'cycletrack', from: 'default' });
  });
  it('stores only admit, and sends only admit to the API (one cache key per view)', () => {
    expect(parseStoredSourcePref('admit')).toBe('admit');
    for (const raw of [null, '', 'cycletrack', '{"x":1}', 'ADMIT']) expect(parseStoredSourcePref(raw)).toBeUndefined();
    expect(sourceParamOf('admit')).toEqual({ source: 'admit' });
    expect(sourceParamOf('cycletrack')).toEqual({});
    expect(sourceParamOf(undefined)).toEqual({});
  });
});
