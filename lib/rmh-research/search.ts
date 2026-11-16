/**
 * Archive search: the query behind /rmh-research/archive.
 *
 * Every word of the query must match somewhere in a paper (title, authors,
 * keywords, venue, field, abstract); a word matches as a prefix of a word, so
 * `reson` finds "resonance". Matches are scored by where they land, and the
 * result is filtered by field, year range, author and kind, then sorted.
 * Pure and synchronous: the whole catalogue is a few hundred rows.
 */
import { authorsOf, byResonance, PAPERS, resonanceOf } from './catalog';
import { getField } from './fields';
import { FIELD_IDS, type FieldId, type Paper, type PaperKind } from './types';

export const ARCHIVE_SORTS = ['relevance', 'resonance', 'cited', 'newest', 'oldest'] as const;
export type ArchiveSort = (typeof ARCHIVE_SORTS)[number];

export function isArchiveSort(value: unknown): value is ArchiveSort {
  return typeof value === 'string' && (ARCHIVE_SORTS as readonly string[]).includes(value);
}

export interface ArchiveQuery {
  /** Free text. */
  q?: string | undefined;
  field?: FieldId | undefined;
  /** Author id. */
  author?: string | undefined;
  /** Inclusive year range. */
  from?: number | undefined;
  to?: number | undefined;
  kind?: PaperKind | undefined;
  /** Defaults to `relevance` with a query and `resonance` without one. */
  sort?: ArchiveSort | undefined;
}

/** Lowercase, strip diacritics, split on anything that is not a letter or digit. */
export function tokenize(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

interface IndexedPaper {
  paper: Paper;
  title: string[];
  authors: string[];
  keywords: string[];
  meta: string[];
  abstract: string[];
}

const INDEX: IndexedPaper[] = PAPERS.map((paper) => ({
  paper,
  title: tokenize(paper.title),
  authors: tokenize([...authorsOf(paper).map((a) => a.name), paper.byline ?? ''].join(' ')),
  keywords: tokenize(paper.keywords.join(' ')),
  meta: tokenize(`${paper.venue} ${getField(paper.field).name} ${paper.year}`),
  abstract: tokenize(paper.abstract),
}));

const WEIGHTS: [keyof Omit<IndexedPaper, 'paper'>, number][] = [
  ['title', 6],
  ['authors', 4],
  ['keywords', 4],
  ['meta', 2],
  ['abstract', 1],
];

function scoreToken(doc: IndexedPaper, token: string): number {
  let best = 0;
  for (const [part, weight] of WEIGHTS) {
    for (const word of doc[part]) {
      if (word === token) best = Math.max(best, weight * 2);
      else if (word.startsWith(token)) best = Math.max(best, weight);
    }
  }
  return best;
}

/** Relevance of a paper to a tokenised query, or 0 when any token misses. */
function relevance(doc: IndexedPaper, tokens: readonly string[]): number {
  let total = 0;
  for (const token of tokens) {
    const s = scoreToken(doc, token);
    if (s === 0) return 0;
    total += s;
  }
  return total;
}

export function searchArchive(query: ArchiveQuery = {}): Paper[] {
  const tokens = tokenize(query.q ?? '');
  const sort: ArchiveSort = query.sort ?? (tokens.length ? 'relevance' : 'resonance');

  const hits: { paper: Paper; score: number }[] = [];
  for (const doc of INDEX) {
    const p = doc.paper;
    if (query.field && p.field !== query.field) continue;
    if (query.author && !p.authors.includes(query.author)) continue;
    if (query.from !== undefined && p.year < query.from) continue;
    if (query.to !== undefined && p.year > query.to) continue;
    if (query.kind && (p.kind ?? 'paper') !== query.kind) continue;
    const score = tokens.length ? relevance(doc, tokens) : 1;
    if (score > 0) hits.push({ paper: p, score });
  }

  hits.sort((a, b) => {
    switch (sort) {
      case 'relevance':
        return b.score - a.score || byResonance(a.paper, b.paper);
      case 'cited':
        return resonanceOf(b.paper.id).raw - resonanceOf(a.paper.id).raw || byResonance(a.paper, b.paper);
      case 'newest':
        return b.paper.year - a.paper.year || byResonance(a.paper, b.paper);
      case 'oldest':
        return a.paper.year - b.paper.year || byResonance(a.paper, b.paper);
      case 'resonance':
        return byResonance(a.paper, b.paper);
    }
  });
  return hits.map((h) => h.paper);
}

/* ── the archive page's URL state ────────────────────────────────────────── */

/** Results per archive page. */
export const ARCHIVE_PAGE_SIZE = 20;

/**
 * Everything /rmh-research/archive shows, as it sits in the address bar, so a
 * search is a link. `page` is 1-based and omitted on the first page.
 */
export interface ArchiveSearch {
  q?: string;
  field?: FieldId;
  author?: string;
  from?: number;
  to?: number;
  sort?: ArchiveSort;
  kind?: PaperKind;
  page?: number;
}

const toInt = (v: unknown): number | undefined => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) ? n : undefined;
};
const toYear = (v: unknown): number | undefined => {
  const n = toInt(v);
  return n !== undefined && n >= 1900 && n <= 2100 ? n : undefined;
};

/**
 * Validate the archive's search params. Tolerant of what a plain GET form sends
 * (empty fields, a numeric query the router parsed as a number) and of the
 * older `reports=true` flag, which now means `kind=report`.
 */
export function parseArchiveSearch(search: Record<string, unknown>): ArchiveSearch {
  const out: ArchiveSearch = {};
  const q = typeof search.q === 'number' ? String(search.q) : search.q;
  if (typeof q === 'string' && q.trim()) out.q = q.trim().slice(0, 200);
  if (typeof search.field === 'string' && FIELD_IDS.includes(search.field as FieldId)) out.field = search.field as FieldId;
  if (typeof search.author === 'string' && /^[a-z0-9-]{1,80}$/.test(search.author)) out.author = search.author;
  let from = toYear(search.from);
  let to = toYear(search.to);
  if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
  if (from !== undefined) out.from = from;
  if (to !== undefined) out.to = to;
  if (isArchiveSort(search.sort)) out.sort = search.sort;
  if (search.kind === 'paper' || search.kind === 'report') out.kind = search.kind;
  else if (search.reports === true || search.reports === 'true') out.kind = 'report';
  const page = toInt(search.page);
  if (page !== undefined && page > 1 && page <= 10_000) out.page = page;
  return out;
}

/** The slice of a result list one page shows; an out-of-range page is clamped. */
export function paginate(total: number, page = 1, size = ARCHIVE_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page)), pages);
  const start = (current - 1) * size;
  return { page: current, pages, start, end: Math.min(total, start + size) };
}

/**
 * The page numbers a pager shows: the first, the last, and the current page
 * with one neighbour each side; `null` marks a gap. `pageWindow(6, 12)` is
 * `[1, null, 5, 6, 7, null, 12]`.
 */
export function pageWindow(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  // A gap of exactly one page is shown as that page, not as an ellipsis.
  if (keep.has(3) && pages >= 3) keep.add(2);
  if (keep.has(pages - 2) && pages >= 3) keep.add(pages - 1);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/* ── related work ────────────────────────────────────────────────────────── */

const keywordSet = (p: Paper) => new Set(p.keywords.map((k) => k.trim().toLowerCase()));

/**
 * Up to `limit` other papers in the same field, those sharing the most keywords
 * first, then the most resonant. A paper is never related to itself.
 */
export function relatedPapers(paper: Paper, limit = 5): Paper[] {
  return PAPERS.filter((p) => p.field === paper.field && p.id !== paper.id)
    .map((p) => ({ p, shared: sharedKeywords(paper, p) }))
    .sort((a, b) => b.shared - a.shared || byResonance(a.p, b.p))
    .slice(0, Math.max(0, limit))
    .map((x) => x.p);
}

/** How many keywords two papers share (case-insensitive). */
export function sharedKeywords(a: Paper, b: Paper): number {
  const mine = keywordSet(a);
  let n = 0;
  for (const k of keywordSet(b)) if (mine.has(k)) n++;
  return n;
}
