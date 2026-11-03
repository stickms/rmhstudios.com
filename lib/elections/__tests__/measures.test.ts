import { describe, expect, it } from 'vitest';
import { filterMeasures, measureStats, normalizeMeasure, parseMeasureIndex, type MeasureRef } from '../measures';

const page = (o: { yes?: number; no?: number; won?: string[]; threshold?: number | null; coverage?: string; seat?: string; office?: string } = {}) => ({
  races: [
    {
      nyt_id: 'AZ-I-144-AZ-2026-11-03',
      office: o.office ?? 'Proposition',
      seat: o.seat ?? '144 - Require voter ID',
      coverage: o.coverage ?? 'state',
      title: { default: 'Prop. 144 – Voter ID' },
      long_description: 'Amends the State Constitution to require voter ID.',
      win_threshold: o.threshold === undefined ? null : o.threshold,
      outcome: { won: o.won ?? [], called_by: o.won?.length ? ['ap'] : [] },
      url: 'https://www.nytimes.com/x',
      updated_at: '2026-11-03T20:00:00Z',
      top_reporting_unit: {
        eevp: 40,
        precincts_total: 100,
        precincts_reporting: 40,
        candidates: [
          { nyt_id: 'yes', votes: { total: o.yes ?? 0 } },
          { nyt_id: 'no', votes: { total: o.no ?? 0 } },
        ],
      },
    },
  ],
});
const ref: MeasureRef = { slug: 'results-arizona-proposition-144-voter-id', state: 'AZ', office: 'Proposition', seat: '144 - Require voter ID', headline: 'AZ Prop 144' };

describe('parseMeasureIndex', () => {
  it('keeps measure pages (statewide and local), drops offices, de-duplicates', () => {
    const url = (s: string) => `https://www.nytimes.com/interactive/2026/11/03/us/elections/${s}.html`;
    const feed = {
      data: [
        { office: 'U.S. House', statePostal: 'AZ', publishUrl: url('results-arizona-first-congressional-district'), headline: 'h' },
        { office: 'Proposition', statePostal: 'AZ', publishUrl: url('results-arizona-proposition-144-voter-id'), headline: 'p', seat: '144' },
        { office: 'Local Measure', statePostal: 'CA', publishUrl: url('results-fresno-measure-s-transportation-sales-tax'), headline: 'f' },
        { office: 'Local Measure', statePostal: 'CA', publishUrl: url('results-fresno-measure-s-transportation-sales-tax'), headline: 'dup' },
        { office: 'Question', statePostal: null, publishUrl: url('results-x'), headline: 'no state' },
      ],
    };
    expect(parseMeasureIndex(feed).map((r) => r.slug)).toEqual([
      'results-arizona-proposition-144-voter-id',
      'results-fresno-measure-s-transportation-sales-tax',
    ]);
    expect(parseMeasureIndex(null)).toEqual([]);
  });
});

describe('normalizeMeasure', () => {
  it('reads a measure that has not started', () => {
    const m = normalizeMeasure(page(), ref)!;
    expect(m).toMatchObject({ status: 'upcoming', passing: null, margin: null, threshold: 50, scope: 'statewide', place: 'Arizona', pctReporting: null });
  });
  it('computes shares, margin and whether it is passing, honouring a supermajority threshold', () => {
    const simple = normalizeMeasure(page({ yes: 550, no: 450 }), ref)!;
    expect(simple).toMatchObject({ status: 'counting', passing: true, margin: 10 });
    expect(simple.yes.pct).toBe(55);
    const needs60 = normalizeMeasure(page({ yes: 550, no: 450, threshold: 60 }), ref)!;
    expect(needs60.passing).toBe(false);
    expect(needs60.threshold).toBe(60);
  });
  it('reports the call and marks a county-level measure local with its place', () => {
    const called = normalizeMeasure(page({ yes: 400, no: 600, won: ['no'] }), ref)!;
    expect(called).toMatchObject({ status: 'called', outcome: 'no' });
    const local = normalizeMeasure(page({ coverage: 'county', seat: 'Fresno-S - Sales tax', office: 'Local Measure' }), { ...ref, state: 'CA' })!;
    expect(local).toMatchObject({ scope: 'local', place: 'Fresno', state: 'CA' });
  });
  it('returns null for junk', () => {
    expect(normalizeMeasure({}, ref)).toBeNull();
    expect(normalizeMeasure(null, ref)).toBeNull();
  });
});

describe('stats and filters', () => {
  const a = normalizeMeasure(page({ yes: 550, no: 450 }), ref)!;
  const b = { ...normalizeMeasure(page({ yes: 400, no: 600, won: ['no'] }), ref)!, id: 'b', state: 'CA', stateName: 'California', title: 'Fresno tax', scope: 'local' as const };
  it('counts the night', () => {
    const s = measureStats([a, b]);
    expect(s).toMatchObject({ total: 2, statewide: 1, local: 1, states: 2, called: 1, passed: 0, failed: 1, passing: 1, failing: 0 });
  });
  it('filters by scope, state and text', () => {
    expect(filterMeasures([a, b], { scope: 'local', state: 'all', q: '' })).toEqual([b]);
    expect(filterMeasures([a, b], { scope: 'all', state: 'AZ', q: '' })).toEqual([a]);
    expect(filterMeasures([a, b], { scope: 'all', state: 'all', q: 'fresno' })).toEqual([b]);
  });
});
