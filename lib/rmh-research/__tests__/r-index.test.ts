import { describe, expect, it } from 'vitest';
import { analyseCitations, CARRIED_WEIGHT, classifyCitation, indexCut, isIndependent, measure } from '../r-index';
import type { Paper } from '../types';

function paper(id: string, year: number, authors: string[], refs: string[] = [], field: Paper['field'] = 'physics'): Paper {
  return { id, title: id, authors, year, field, venue: 'v', abstract: '', keywords: [], refs };
}

describe('indexCut', () => {
  it('is the h-index cut', () => {
    expect(indexCut([])).toBe(0);
    expect(indexCut([0, 0])).toBe(0);
    expect(indexCut([9, 7, 3, 3, 1])).toBe(3);
    expect(indexCut([1, 1, 1, 1])).toBe(1);
    expect(indexCut([5, 5, 5, 5, 5])).toBe(5);
    expect(indexCut([3, 10, 1])).toBe(2);
  });
});

describe('isIndependent', () => {
  it('fails on a shared author and on the same paper', () => {
    const a = paper('a', 2010, ['x', 'y']);
    expect(isIndependent(paper('b', 2011, ['y']), a)).toBe(false);
    expect(isIndependent(paper('c', 2011, ['z']), a)).toBe(true);
    expect(isIndependent(a, a)).toBe(false);
  });
});

describe('resonance', () => {
  // Horizon 2020, so 2019 and 2020 are in the grace window; 2018 and earlier
  // must have been independently cited to be live.
  const papers = [
    paper('root', 2010, ['ann']),
    paper('self', 2012, ['ann'], ['root']), // self-citation: not independent
    paper('dead', 2013, ['bob'], ['root']), // independent, but nobody cites it
    paper('built', 2014, ['cat'], ['root']), // independent and cited by 'far'
    paper('far', 2016, ['dan'], ['root', 'built'], 'biology'), // cross-field, cited by 'fresh'
    paper('fresh', 2020, ['eve'], ['root', 'far']), // grace window: live without citations
  ];
  const analysis = analyseCitations(papers);

  it('counts raw, independent, live and carried citations', () => {
    expect(analysis.horizon).toBe(2020);
    expect(analysis.resonance.get('root')).toEqual({ raw: 5, independent: 4, live: 3, carried: 1, score: 4 });
  });

  it('treats a citation from an uncited old paper as a dead end', () => {
    expect(analysis.resonance.get('dead')).toEqual({ raw: 0, independent: 0, live: 0, carried: 0, score: 0 });
    // 'built' is cited by 'far' (live: 'fresh' cites it), from another field: 1 live, carried.
    expect(analysis.resonance.get('built')?.score).toBe(2);
  });

  it('classifies each citing paper the way the breakdown counts it', () => {
    const root = papers[0]!;
    const kinds = Object.fromEntries((analysis.citedBy.get('root') ?? []).map((q) => [q.id, classifyCitation(q, root, analysis)]));
    expect(kinds).toEqual({ self: 'self', dead: 'dead', built: 'live', far: 'carried', fresh: 'live' });
    // For every paper, the kinds add back up to its resonance.
    for (const p of papers) {
      const ks = (analysis.citedBy.get(p.id) ?? []).map((q) => classifyCitation(q, p, analysis));
      const count = (k: string) => ks.filter((x) => x === k).length;
      const res = analysis.resonance.get(p.id);
      expect(res?.raw).toBe(ks.length);
      expect(res?.independent).toBe(ks.length - count('self'));
      expect(res?.live).toBe(count('live') + count('carried'));
      expect(res?.carried).toBe(count('carried'));
      expect(res?.score).toBe(count('live') + count('carried') * CARRIED_WEIGHT);
    }
  });

  it('ignores unknown and duplicate references', () => {
    const a = analyseCitations([paper('p', 2000, ['a']), paper('q', 2001, ['b'], ['p', 'p', 'missing'])]);
    expect(a.resonance.get('p')?.raw).toBe(1);
  });

  it('measures a body of work with both indices', () => {
    const anns = papers.filter((p) => p.authors.includes('ann'));
    expect(measure(anns, analysis)).toEqual({ papers: 2, citations: 5, resonance: 4, h: 1, r: 1 });
  });

  it('gives a citation ring nothing', () => {
    // Two co-authors citing each other's joint work: h rises, r does not.
    const ring = [
      paper('r1', 2001, ['a', 'b']),
      paper('r2', 2002, ['a', 'b'], ['r1']),
      paper('r3', 2003, ['a', 'b'], ['r1', 'r2']),
      paper('r4', 2004, ['a', 'b'], ['r1', 'r2', 'r3']),
      paper('late', 2010, ['z']),
    ];
    const m = measure(ring.slice(0, 4), analyseCitations(ring));
    expect(m.h).toBe(2);
    expect(m.r).toBe(0);
  });
});
