/**
 * The RMH Research catalogue, assembled: lookups, the citation graph, and the
 * derived numbers every page shows. Everything here is computed once at module
 * load from `data/` (a few hundred rows), so the pages never recompute a
 * metric and never disagree about one.
 */
import { AUTHORS, PAPERS } from './data';
import { FIELDS } from './fields';
import { analyseCitations, measure, type BodyOfWork, type Resonance } from './r-index';
import type { Author, FieldId, Paper } from './types';

export { AUTHORS, PAPERS };

const PAPER_BY_ID = new Map<string, Paper>(PAPERS.map((p) => [p.id, p]));
const AUTHOR_BY_ID = new Map<string, Author>(AUTHORS.map((a) => [a.id, a]));

export const ANALYSIS = analyseCitations(PAPERS);

const NO_RESONANCE: Resonance = { raw: 0, independent: 0, live: 0, carried: 0, score: 0 };

export function getPaper(id: string): Paper | undefined {
  return PAPER_BY_ID.get(id);
}

export function getAuthor(id: string): Author | undefined {
  return AUTHOR_BY_ID.get(id);
}

/** A paper's named authors, in byline order. */
export function authorsOf(paper: Paper): Author[] {
  return paper.authors.flatMap((id) => AUTHOR_BY_ID.get(id) ?? []);
}

/** The resonance breakdown of one paper (see `r-index.ts`). */
export function resonanceOf(paperId: string): Resonance {
  return ANALYSIS.resonance.get(paperId) ?? NO_RESONANCE;
}

/** Newest first, then by resonance. */
function byYear(a: Paper, b: Paper): number {
  return b.year - a.year || resonanceOf(b.id).score - resonanceOf(a.id).score || a.title.localeCompare(b.title);
}

/** Most resonant first, then most cited, then newest. */
export function byResonance(a: Paper, b: Paper): number {
  const ra = resonanceOf(a.id);
  const rb = resonanceOf(b.id);
  return rb.score - ra.score || rb.raw - ra.raw || b.year - a.year || a.title.localeCompare(b.title);
}

/** The papers that cite this one, newest first. */
export function citedBy(paperId: string): Paper[] {
  return [...(ANALYSIS.citedBy.get(paperId) ?? [])].sort(byYear);
}

/** The archive papers this one cites, newest first. */
export function referencesOf(paper: Paper): Paper[] {
  return paper.refs.flatMap((id) => PAPER_BY_ID.get(id) ?? []).sort(byYear);
}

export function papersByAuthor(authorId: string): Paper[] {
  return PAPERS.filter((p) => p.authors.includes(authorId)).sort(byYear);
}

export function papersInField(field: FieldId): Paper[] {
  return PAPERS.filter((p) => p.field === field).sort(byYear);
}

export function authorsInField(field: FieldId): Author[] {
  return AUTHORS.filter((a) => a.field === field);
}

/* ── metrics ─────────────────────────────────────────────────────────────── */

export interface AuthorMetrics extends BodyOfWork {
  author: Author;
  /** 1-based position in the r-index ranking. Ties share the better rank. */
  rank: number;
  /** Fields the author has published in, home field first. */
  fields: FieldId[];
  /** First and last publication year, or `null` with no papers. */
  active: { from: number; to: number } | null;
}

function metricsFor(author: Author): Omit<AuthorMetrics, 'rank'> {
  const papers = papersByAuthor(author.id);
  const fields = [...new Set<FieldId>([author.field, ...papers.map((p) => p.field)])];
  const years = papers.map((p) => p.year);
  return {
    author,
    ...measure(papers, ANALYSIS),
    fields,
    active: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
  };
}

/** Every author, ranked by r-index, then resonance, then h, then name. */
export const AUTHOR_RANKING: readonly AuthorMetrics[] = (() => {
  const rows = AUTHORS.map(metricsFor).sort(
    (a, b) => b.r - a.r || b.resonance - a.resonance || b.h - a.h || a.author.name.localeCompare(b.author.name),
  );
  let rank = 0;
  let prev: number | null = null;
  return rows.map((row, i) => {
    if (row.r !== prev) {
      rank = i + 1;
      prev = row.r;
    }
    return { ...row, rank };
  });
})();

const METRICS_BY_AUTHOR = new Map(AUTHOR_RANKING.map((m) => [m.author.id, m]));

export function authorMetrics(authorId: string): AuthorMetrics | undefined {
  return METRICS_BY_AUTHOR.get(authorId);
}

/** The papers that make up an author's r-core: their `r` most resonant papers. */
export function rCore(authorId: string): Paper[] {
  const r = METRICS_BY_AUTHOR.get(authorId)?.r ?? 0;
  return papersByAuthor(authorId).sort(byResonance).slice(0, r);
}

/** People the author has published with, most shared papers first. */
export function coauthorsOf(authorId: string): { author: Author; papers: number }[] {
  const counts = new Map<string, number>();
  for (const p of PAPERS) {
    if (!p.authors.includes(authorId)) continue;
    for (const other of p.authors) if (other !== authorId) counts.set(other, (counts.get(other) ?? 0) + 1);
  }
  return [...counts]
    .flatMap(([id, papers]) => {
      const author = AUTHOR_BY_ID.get(id);
      return author ? [{ author, papers }] : [];
    })
    .sort((a, b) => b.papers - a.papers || a.author.name.localeCompare(b.author.name));
}

export interface FieldStats extends BodyOfWork {
  field: FieldId;
  authors: number;
  /** Earliest and latest publication year in the field, or `null` when empty. */
  span: { from: number; to: number } | null;
}

export const FIELD_STATS: readonly FieldStats[] = FIELDS.map((f) => {
  const papers = papersInField(f.id);
  const years = papers.map((p) => p.year);
  return {
    field: f.id,
    ...measure(papers, ANALYSIS),
    authors: authorsInField(f.id).length,
    span: years.length ? { from: Math.min(...years), to: Math.max(...years) } : null,
  };
});

export function fieldStats(field: FieldId): FieldStats | undefined {
  return FIELD_STATS.find((s) => s.field === field);
}

/** The headline numbers of the whole archive. */
export const ARCHIVE_STATS = (() => {
  const years = PAPERS.map((p) => p.year);
  return {
    papers: PAPERS.length,
    authors: AUTHORS.length,
    fields: FIELDS.length,
    citations: PAPERS.reduce((n, p) => n + resonanceOf(p.id).raw, 0),
    from: years.length ? Math.min(...years) : ANALYSIS.horizon,
    to: ANALYSIS.horizon,
  };
})();

/** The most resonant papers in the archive (or in one field). */
export function topPapers(limit: number, field?: FieldId): Paper[] {
  const pool = field ? PAPERS.filter((p) => p.field === field) : [...PAPERS];
  return pool.sort(byResonance).slice(0, limit);
}

/** Papers per publication year, oldest first, with no gaps. */
export function papersPerYear(papers: readonly Paper[] = PAPERS): { year: number; count: number }[] {
  if (papers.length === 0) return [];
  const counts = new Map<number, number>();
  for (const p of papers) counts.set(p.year, (counts.get(p.year) ?? 0) + 1);
  const from = Math.min(...counts.keys());
  const to = Math.max(...counts.keys());
  return Array.from({ length: to - from + 1 }, (_, i) => ({ year: from + i, count: counts.get(from + i) ?? 0 }));
}

export interface FieldExchange {
  field: FieldId;
  /** Citations this field's papers make into the other field. */
  cites: number;
  /** Citations the other field's papers make into this one. */
  citedBy: number;
}

/**
 * The fields a field exchanges citations with, most traffic first (both
 * directions summed, ties in display order). Fields with no traffic are left out.
 */
export function fieldExchange(field: FieldId): FieldExchange[] {
  const cites = new Map<FieldId, number>();
  const cited = new Map<FieldId, number>();
  for (const paper of papersInField(field)) {
    for (const ref of referencesOf(paper)) {
      if (ref.field !== field) cites.set(ref.field, (cites.get(ref.field) ?? 0) + 1);
    }
    for (const q of citedBy(paper.id)) {
      if (q.field !== field) cited.set(q.field, (cited.get(q.field) ?? 0) + 1);
    }
  }
  return FIELDS.flatMap((f) => (f.id !== field && (cites.has(f.id) || cited.has(f.id)) ? [{ field: f.id, cites: cites.get(f.id) ?? 0, citedBy: cited.get(f.id) ?? 0 }] : []))
    .map((row, order) => ({ row, order }))
    .sort((a, b) => b.row.cites + b.row.citedBy - (a.row.cites + a.row.citedBy) || a.order - b.order)
    .map(({ row }) => row);
}

export const AUTHOR_SORTS = ['r', 'h', 'citations', 'papers', 'name'] as const;
export type AuthorSort = (typeof AUTHOR_SORTS)[number];

/** The author ranking, optionally narrowed to a home field and re-sorted. `r` is the ranking itself. */
export function sortAuthors(sort: AuthorSort = 'r', field?: FieldId): AuthorMetrics[] {
  const rows = AUTHOR_RANKING.filter((m) => !field || m.author.field === field);
  const key: Record<Exclude<AuthorSort, 'r' | 'name'>, (m: AuthorMetrics) => number> = {
    h: (m) => m.h,
    citations: (m) => m.citations,
    papers: (m) => m.papers,
  };
  if (sort === 'r') return [...rows];
  if (sort === 'name') return [...rows].sort((a, b) => a.author.name.localeCompare(b.author.name));
  const f = key[sort];
  return [...rows].sort((a, b) => f(b) - f(a) || b.r - a.r || a.author.name.localeCompare(b.author.name));
}
