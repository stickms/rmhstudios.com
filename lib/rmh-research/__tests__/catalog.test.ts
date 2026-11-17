import { describe, expect, it } from 'vitest';
import { ANALYSIS, AUTHOR_RANKING, fieldExchange, sortAuthors, AUTHORS, getAuthor, getPaper, PAPERS, papersByAuthor, papersInField } from '../catalog';
import { FIELDS, isFieldId } from '../fields';
import { searchArchive, tokenize } from '../search';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('catalogue integrity', () => {
  it('has unique kebab-case ids', () => {
    for (const list of [PAPERS, AUTHORS]) {
      const ids = list.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(KEBAB);
    }
  });

  it('every paper has a known field, named authors or a byline, and real text', () => {
    for (const p of PAPERS) {
      expect(isFieldId(p.field), p.id).toBe(true);
      expect(p.authors.length > 0 || Boolean(p.byline), p.id).toBe(true);
      expect(new Set(p.authors).size, p.id).toBe(p.authors.length);
      for (const a of p.authors) expect(getAuthor(a), `${p.id} → ${a}`).toBeDefined();
      expect(p.title.length, p.id).toBeGreaterThan(8);
      expect(p.abstract.length, p.id).toBeGreaterThan(40);
      expect(p.keywords.length, p.id).toBeGreaterThan(0);
      if (p.kind === 'report') expect(p.href, p.id).toMatch(/^\/rmh-research\//);
    }
  });

  it('references resolve, never point forward in time, and never repeat', () => {
    for (const p of PAPERS) {
      expect(new Set(p.refs).size, p.id).toBe(p.refs.length);
      for (const ref of p.refs) {
        const cited = getPaper(ref);
        expect(cited, `${p.id} → ${ref}`).toBeDefined();
        expect(ref, p.id).not.toBe(p.id);
        expect(cited!.year, `${p.id} (${p.year}) cites ${ref}`).toBeLessThanOrEqual(p.year);
      }
    }
  });

  it('every author has a known field and at least one paper', () => {
    for (const a of AUTHORS) {
      expect(isFieldId(a.field), a.id).toBe(true);
      expect(papersByAuthor(a.id).length, a.id).toBeGreaterThan(0);
    }
  });

  it('ranks every author once, best r-index first', () => {
    expect(AUTHOR_RANKING).toHaveLength(AUTHORS.length);
    for (let i = 1; i < AUTHOR_RANKING.length; i++) {
      expect(AUTHOR_RANKING[i]!.r).toBeLessThanOrEqual(AUTHOR_RANKING[i - 1]!.r);
    }
    expect(ANALYSIS.horizon).toBeGreaterThan(2000);
  });
});

describe('archive search', () => {
  it('tokenises without case or diacritics', () => {
    expect(tokenize('Señor Ångström—Heat, 2021')).toEqual(['senor', 'angstrom', 'heat', '2021']);
  });

  it('returns the whole archive for an empty query, and nothing for nonsense', () => {
    expect(searchArchive()).toHaveLength(PAPERS.length);
    expect(searchArchive({ q: 'zzzqqqxxyy' })).toHaveLength(0);
  });

  it('finds a paper by a prefix of a title word and filters by field', () => {
    const target = PAPERS[0]!;
    const word = tokenize(target.title).sort((a, b) => b.length - a.length)[0]!;
    expect(searchArchive({ q: word.slice(0, Math.max(3, word.length - 2)) }).map((p) => p.id)).toContain(target.id);
    for (const p of searchArchive({ field: target.field })) expect(p.field).toBe(target.field);
    expect(searchArchive({ field: target.field })).toHaveLength(papersInField(target.field).length);
  });

  it('sorts by year both ways', () => {
    const newest = searchArchive({ sort: 'newest' }).map((p) => p.year);
    expect(newest).toEqual([...newest].sort((a, b) => b - a));
    const oldest = searchArchive({ sort: 'oldest' }).map((p) => p.year);
    expect(oldest).toEqual([...oldest].sort((a, b) => a - b));
  });

  it('lists every field', () => {
    expect(FIELDS).toHaveLength(12);
  });
});

describe('fieldExchange', () => {
  it('counts each cross-field citation once, in both directions, and never lists the field itself', () => {
    let crossing = 0;
    for (const p of PAPERS) for (const ref of p.refs) if (getPaper(ref)!.field !== p.field) crossing++;
    let outgoing = 0;
    let incoming = 0;
    for (const f of FIELDS) {
      const rows = fieldExchange(f.id);
      expect(rows.some((r) => r.field === f.id)).toBe(false);
      const totals = rows.map((r) => r.cites + r.citedBy);
      expect(totals).toEqual([...totals].sort((a, b) => b - a));
      for (const r of rows) {
        outgoing += r.cites;
        incoming += r.citedBy;
      }
    }
    expect(outgoing).toBe(crossing);
    expect(incoming).toBe(crossing);
  });
});

describe('sortAuthors', () => {
  it('keeps the ranking for r, filters by home field, and sorts the other keys', () => {
    expect(sortAuthors('r').map((m) => m.author.id)).toEqual(AUTHOR_RANKING.map((m) => m.author.id));
    for (const m of sortAuthors('h', 'mathematics')) expect(m.author.field).toBe('mathematics');
    const cites = sortAuthors('citations').map((m) => m.citations);
    expect(cites).toEqual([...cites].sort((a, b) => b - a));
    const names = sortAuthors('name').map((m) => m.author.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});
