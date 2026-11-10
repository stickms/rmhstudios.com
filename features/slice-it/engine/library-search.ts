/**
 * Slice It — the song library's URL contract: sorts, directions, views, and the
 * `/slice-it/` search-param validator. Split out of `library-filters.ts`, which
 * re-exports all of it, so that the route definition can import its
 * `validateSearch` without the API query schemas — and zod — that live there.
 * See {@link validateLibrarySearch} for why that matters. Keep this file free of
 * zod and of anything that imports it.
 */

import type { SearchSchemaInput } from '@tanstack/react-router';
import { SONG_SORTS, type SongSort } from './constants';

/* ─── Sorting ────────────────────────────────────────────────────────────── */

/**
 * Sort keys the table's columns need that the grid's dropdown never did:
 * `artist`, `bpm` and `plays` are plain `Song` columns the grid just never
 * exposed a control for; `yourScore` needs a per-viewer join (see the route).
 */
/**
 * `relevance` (L14) is here rather than in `SONG_SORTS` for the same reason the
 * other four are: it is not part of the vocabulary the wider game agrees on. It
 * is also the one sort that is *undefined without a query* — there is no
 * relevance ordering for "show me everything" — so the route falls back to
 * `recent` when `q` is empty, and the library defaults to it whenever a search
 * IS typed. That default is the actual fix L14 asks for: before it, typing a
 * query re-filtered the list and left it ordered by upload date.
 */
export const LIBRARY_EXTRA_SORTS = ['artist', 'bpm', 'plays', 'yourScore', 'relevance'] as const;
export type LibraryExtraSort = (typeof LIBRARY_EXTRA_SORTS)[number];

export const LIBRARY_SORTS = [...SONG_SORTS, ...LIBRARY_EXTRA_SORTS] as const;
export type LibrarySort = SongSort | LibraryExtraSort;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

/**
 * The direction a sort runs when the caller does not say — i.e. what the grid's
 * dropdown already meant by each of the five base {@link SongSort} values, plus
 * a sensible default for the four table-only ones.
 */
export const DEFAULT_SORT_DIRECTION: Record<LibrarySort, SortDirection> = {
  recent: 'desc',
  popular: 'desc',
  liked: 'desc',
  title: 'asc',
  duration: 'asc',
  /** Hardest first — "find something at my level" is asked upward, not down. */
  difficulty: 'desc',
  artist: 'asc',
  bpm: 'asc',
  plays: 'desc',
  yourScore: 'desc',
  /** Best match first. `asc` on relevance is not a thing anyone wants. */
  relevance: 'desc',
};

/** Sort keys that need a signed-in viewer to mean anything. */
export const AUTH_ONLY_SORTS: readonly LibrarySort[] = ['yourScore'];

/* ─── View mode ──────────────────────────────────────────────────────────── */

export const LIBRARY_VIEWS = ['grid', 'table'] as const;
export type LibraryView = (typeof LIBRARY_VIEWS)[number];

/* ─── URL search params (L18) ───────────────────────────────────────────── */

/** The search params as the URL hands them over — every field optional. */
export interface LibrarySearchInput {
  q?: string;
  sort?: LibrarySort;
  artist?: string;
  packId?: string;
  dir?: SortDirection;
  view?: LibraryView;
  /** Unrelated params (`?lobby=`) pass through untouched — see below. */
  [key: string]: unknown;
}

/** The search params after {@link validateLibrarySearch}: defaults filled in. */
export interface LibrarySearch extends LibrarySearchInput {
  q: string;
  sort: LibrarySort;
  view: LibraryView;
}

const UUID_RE =
  /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;

/** A trimmed string no longer than `max`, or `undefined` for anything else. */
function boundedString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/**
 * `validateSearch` for `/slice-it/`. Hand-rolled, not zod, because this
 * function is part of the route DEFINITION, and route definitions are in the
 * entry chunk of every page: a zod schema here put all of zod (~70 KB minified)
 * on the critical path of the whole site to parse six query params on one game
 * route (CSS/JS audit 2026-10-09; `app/routes/bums-rush.tsx` has the same note).
 *
 * The rules are the ones the zod schema had, field for field:
 *
 * - **Never throws.** Every field falls back on a bad value (`.catch()`), and a
 *   payload that is not an object at all — `?` garbage, a stale bookmark — gives
 *   the defaults. A throw here would fail the navigation, not the filter.
 * - **Defaults make the INPUT optional.** TanStack derives a `<Link>`'s
 *   required `search` prop from the validator's input type (the
 *   `SearchSchemaInput` marker below); with required fields every
 *   `<Link to="/slice-it">` anywhere in the app would have to pass a full filter
 *   object. The output still always has `q`, `sort` and `view`.
 * - **Unknown keys pass through** (`.passthrough()`). This route also carries
 *   `?lobby=<code>`, the multiplayer join-by-link code read by `MainMenu.tsx` /
 *   `MultiplayerLobby.tsx`; stripping unlisted keys is how library filters
 *   would end up breaking join links neither owns.
 * - `artist` is a normalised `artistKey` (L15) — an equality filter against an
 *   indexed column, never a display name. `packId` (L16) is a UUID. `dir` only
 *   means something to the table's per-column toggle.
 */
export function validateLibrarySearch(
  raw: LibrarySearchInput & SearchSchemaInput,
): LibrarySearch {
  return parseLibrarySearch(raw);
}

function parseLibrarySearch(raw: LibrarySearchInput): LibrarySearch {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_LIBRARY_SEARCH };
  const out: LibrarySearch = {
    ...raw,
    q: boundedString(raw.q, 120) ?? '',
    sort: oneOf(raw.sort, LIBRARY_SORTS) ?? 'recent',
    artist: boundedString(raw.artist, 200),
    packId: typeof raw.packId === 'string' && UUID_RE.test(raw.packId) ? raw.packId : undefined,
    dir: oneOf(raw.dir, SORT_DIRECTIONS),
    view: oneOf(raw.view, LIBRARY_VIEWS) ?? 'grid',
  };
  return out;
}

export const DEFAULT_LIBRARY_SEARCH: LibrarySearch = {
  q: '',
  sort: 'recent',
  artist: undefined,
  dir: undefined,
  view: 'grid',
};

/**
 * The sort a browse should run under, given what the user has actually asked
 * for (L14).
 *
 * Two rules, and they are the difference between "search works" and "search
 * returns the right rows in the wrong order":
 *
 * - A query with the *default* sort still selected means the user typed words
 *   and expressed no opinion about ordering — that is a request for relevance,
 *   not for "newest of the things that matched".
 * - `relevance` with no query has nothing to rank by, so it degrades to
 *   `recent` rather than producing an arbitrary order. This is reachable from a
 *   hand-edited URL and from clearing the search box with the sort left alone.
 */
export function effectiveLibrarySort(sort: LibrarySort, query: string | undefined): LibrarySort {
  const hasQuery = Boolean(query && query.trim());
  if (!hasQuery) return sort === 'relevance' ? 'recent' : sort;
  return sort === 'recent' ? 'relevance' : sort;
}

/**
 * Re-normalize whatever `useSearch({ strict: false })` hands back.
 *
 * `validateSearch` on the route already does this once at navigation time;
 * this second pass is a defensive backstop for callers (both `SongLibrary` and
 * `MultiplayerLobby` mount under `/slice-it/`) that read search loosely typed
 * rather than through `Route.useSearch()`, and it is cheap enough to always run.
 */
export function normalizeLibrarySearch(raw: unknown): LibrarySearch {
  return parseLibrarySearch((raw && typeof raw === 'object' ? raw : {}) as LibrarySearchInput);
}
