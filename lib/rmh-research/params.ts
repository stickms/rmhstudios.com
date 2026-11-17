/**
 * The URL state of the archive and the author ranking: the search-param
 * parsers their routes' `validateSearch` call.
 *
 * Deliberately free of the catalogue. A route module's `validateSearch`,
 * `loader` and `head` stay in the client entry (only `component` is split
 * out), so anything they import is downloaded by every page on the site;
 * importing `search.ts` or `catalog.ts` here put the whole archive on the
 * critical path. `search.ts` and `catalog.ts` re-export these names.
 */
import { FIELD_IDS, type FieldId, type PaperKind } from './types';

export const ARCHIVE_SORTS = ['relevance', 'resonance', 'cited', 'newest', 'oldest'] as const;
export type ArchiveSort = (typeof ARCHIVE_SORTS)[number];

export function isArchiveSort(value: unknown): value is ArchiveSort {
  return typeof value === 'string' && (ARCHIVE_SORTS as readonly string[]).includes(value);
}

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

/** Whether a value is one of the twelve field ids. Uses the bare id list, not the field table, so a route can call it. */
export function isFieldId(value: unknown): value is FieldId {
  return typeof value === 'string' && (FIELD_IDS as readonly string[]).includes(value);
}

export const AUTHOR_SORTS = ['r', 'h', 'citations', 'papers', 'name'] as const;
export type AuthorSort = (typeof AUTHOR_SORTS)[number];
