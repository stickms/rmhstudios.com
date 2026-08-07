/**
 * Slice It — the song library's shared filter/sort/view contract.
 *
 * One module, imported by both the route (`app/routes/slice-it/index.tsx`,
 * for `validateSearch`) and the components (`SongLibrary.tsx`, `SongTable.tsx`)
 * and the API route (`app/routes/api/slice-it/songs.ts`), so the three cannot
 * drift into three different ideas of what a "sort" value is.
 *
 * Client-safe (no server imports) — same rule as `api-schemas.ts`.
 *
 * ## Why sorts live here and not in `constants.ts`
 *
 * `SONG_SORTS` in `lib/slice-it/constants.ts` is the vocabulary the wider game
 * agrees on and is out of scope for this change (see the handoff note in
 * `docs/_handoff/library-requests.md` for why `artist`/`bpm`/`plays`/`yourScore`
 * are not simply added there instead). {@link LIBRARY_SORTS} is a super-set —
 * every `SongSort` plus the columns the table view added — defined locally and
 * mapped onto real `ORDER BY` clauses inside the route. Nothing sorts a loaded
 * page in the browser: see the "What changed" note atop `SongLibrary.tsx` for
 * the bug this project already fixed once and must not reintroduce.
 */

import { z } from 'zod';
import {
  MAX_SONG_DURATION_SEC,
  SONGS_PAGE_SIZE,
  SONGS_PAGE_SIZE_MAX,
  SONG_SORTS,
  type SongSort,
} from './constants';
import type { SliceSong, SongPage } from './types';

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

/**
 * `validateSearch` for `/slice-it/`. Every field has a `.catch()` fallback, so
 * parsing an arbitrary (hand-edited, stale, or malformed) URL can never throw —
 * a bad `?sort=` degrades to `recent` rather than 500ing the route.
 *
 * `.passthrough()` — this route already carries an unrelated search param
 * (`?lobby=<code>`, the multiplayer join-by-link code read by `MainMenu.tsx`/
 * `MultiplayerLobby.tsx` via `useSearch({ strict: false })`). A plain
 * `z.object()` would silently strip anything not listed here, which is exactly
 * how library filters would end up breaking join links neither owns. Passing
 * unknown keys through untouched keeps the two concerns independent.
 */
export const librarySearchSchema = z
  .object({
    /**
     * `.default()` on every field, and it is load-bearing for the whole app —
     * not a style choice.
     *
     * TanStack derives a `Link`'s required `search` prop from this schema's
     * INPUT type. Without a default, `q` is a required input, so every
     * `<Link to="/slice-it">` anywhere in the codebase must pass a full filter
     * object — which broke three unrelated files (the chart editor's back link,
     * the library's own navigate, the player profile) the moment this route
     * gained `validateSearch`. `.default()` makes the input optional and the
     * output defined, so a bare link still works and readers still get a value.
     */
    q: z.string().trim().max(120).default('').catch(''),
    sort: z.enum(LIBRARY_SORTS).default('recent').catch('recent'),
    /**
     * L15 — the artist facet. A normalised `artistKey`, never a display name:
     * this value goes into an equality filter against an indexed column, and
     * putting the typed spelling in the URL would put the substring bug back.
     * Built by `artistKeyOf()` in `lib/slice-it/artist.ts`.
     */
    artist: z.string().trim().max(200).optional().catch(undefined),
    /**
     * L16 — the library filtered to one pack, in the pack's own order. A pack
     * is a view of the library rather than a separate screen, so it reuses the
     * card, the lamps, the preview and the score column instead of a second
     * list that would have to grow all of them again.
     */
    packId: z.string().uuid().optional().catch(undefined),
    /** Only meaningful for the table's per-column toggle; the grid ignores it. */
    dir: z.enum(SORT_DIRECTIONS).optional().catch(undefined),
    view: z.enum(LIBRARY_VIEWS).default('grid').catch('grid'),
  })
  .passthrough()
  /**
   * Never throws.
   *
   * Each field already `.catch()`es, which covers a bad *value* — but not a
   * payload that is not an object at all. TanStack Router hands `validateSearch`
   * whatever is in the URL, so `?` garbage, a hand-edited link or a stale
   * bookmark can produce `null` or a string here, and a throw at that point
   * fails the navigation rather than the filter. Same reasoning as `ModifiersZ`
   * in `lib/slice-it/modifiers.ts`: clamp to something usable, never hang up on
   * the caller.
   */
  .catch(() => ({ ...DEFAULT_LIBRARY_SEARCH }));
export type LibrarySearch = z.infer<typeof librarySearchSchema>;

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
  const parsed = librarySearchSchema.safeParse(raw && typeof raw === 'object' ? raw : {});
  return parsed.success ? parsed.data : { ...DEFAULT_LIBRARY_SEARCH };
}

/* ─── API query params ──────────────────────────────────────────────────── */

const BooleanFlagZ = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

/**
 * `?q=&sort=&dir=&cursor=&limit=&mine=` for the paged list branch, plus the
 * `random=1` branch's constraints and the `shelf=recent` branch's flag — all on
 * one schema because `defineHandler` validates one `query` shape per route, and
 * this route (`app/routes/api/slice-it/songs.ts`) now serves three request
 * shapes. Fields only one branch reads are simply ignored by the others.
 */
export const LibrarySongsQueryZ = z
  .object({
    q: z.string().trim().max(120).optional(),
    sort: z.enum(LIBRARY_SORTS).default('recent'),
    dir: z.enum(SORT_DIRECTIONS).optional(),
    cursor: z.string().max(128).optional(),
    limit: z.coerce.number().int().min(1).max(SONGS_PAGE_SIZE_MAX).default(SONGS_PAGE_SIZE),
    /** Restrict to the caller's own uploads. Ignored when signed out. */
    mine: BooleanFlagZ,

    /** L15 — normalised `artistKey` facet. See `librarySearchSchema.artist`. */
    artist: z.string().trim().max(200).optional(),
    /** L16 — restrict to the members of one pack, in the pack's own order. */
    packId: z.string().uuid().optional(),

    /** S9 — random/roulette selection. Presence of `random=1` picks that branch. */
    random: z.enum(['1']).optional(),
    durationMin: z.coerce.number().int().min(0).max(MAX_SONG_DURATION_SEC).optional(),
    durationMax: z.coerce.number().int().min(0).max(MAX_SONG_DURATION_SEC).optional(),
    unplayedOnly: BooleanFlagZ,
    likedOnly: BooleanFlagZ,

    /** L17 — recently played. Presence of `shelf=recent` picks that branch. */
    shelf: z.enum(['recent']).optional(),
  })
  .refine((v) => v.durationMin === undefined || v.durationMax === undefined || v.durationMin <= v.durationMax, {
    message: 'durationMin must be <= durationMax',
    path: ['durationMin'],
  });
export type LibrarySongsQuery = z.infer<typeof LibrarySongsQueryZ>;

/** Just the constraint fields, for building the client's `?random=1` request. */
export interface RandomConstraints {
  durationMin?: number;
  durationMax?: number;
  unplayedOnly?: boolean;
  likedOnly?: boolean;
}

export const DEFAULT_RANDOM_CONSTRAINTS: RandomConstraints = {
  durationMin: undefined,
  durationMax: undefined,
  unplayedOnly: false,
  likedOnly: false,
};

/** How many rows the recently-played shelf shows. */
export const RECENTLY_PLAYED_LIMIT = 12;

/* ─── The extended DTO ──────────────────────────────────────────────────── */

/**
 * `SliceSong` plus the two fields the table/shelf need that no existing surface
 * read before: the viewer's own best score on that song (`SongLeaderboard` is
 * unique per `songId`+`userId`, so there is at most one row) and, on the
 * recently-played shelf only, when that play happened.
 *
 * A local extension rather than a change to `types.ts` (not owned by this
 * change) — every existing consumer of `SliceSong` keeps working unmodified.
 */
export interface LibrarySong extends SliceSong {
  /** The viewer's own score row, or null if signed out / never played. */
  bestScore: number | null;
  /** Present only in the recently-played shelf response. */
  lastPlayedAt?: string;
  /**
   * L15 — the normalised artist key, so a card can link to the artist page
   * without re-deriving it (and without the client and the server disagreeing
   * about what the key for a given spelling is). Null for a song whose artist
   * tag normalises to nothing.
   */
  artistKey: string | null;
  /**
   * C3 — the computed rating of this song's hardest public chart, 0–20. Null
   * when no chart of it has been rated, which is most of the library. Read
   * `lib/slice-it/rating.ts` before presenting it as more than a rough
   * ordering; the weights behind it are uncalibrated.
   */
  chartRating: number | null;
  /**
   * V8 — the 64-value note-density histogram, when the row has one stored.
   * `<DensityStrip>` in `SongLibrary.tsx` renders nothing without it, so an
   * absent value is a supported state rather than a hole.
   */
  densityStrip?: number[];
  /**
   * L14 — the combined relevance score this row was ranked by, present only on
   * a `sort=relevance` response. Purely diagnostic; nothing renders it. It is
   * returned because "why is that first?" is otherwise unanswerable without
   * re-running the query by hand.
   */
  relevance?: number;
}

export interface LibrarySongPage extends Omit<SongPage, 'songs'> {
  songs: LibrarySong[];
}

/* ─── Table columns (L13) ───────────────────────────────────────────────── */

export interface LibraryTableColumn {
  key: LibrarySort;
  labelKey: string;
  defaultLabel: string;
  defaultDir: SortDirection;
  /** Right-aligned numeric/time columns read better ragged-right. */
  numeric?: boolean;
  /** Column requires a signed-in viewer — shown disabled otherwise. */
  requiresAuth?: boolean;
}

/**
 * Exactly the six columns asked for: title, artist, BPM, duration, your best
 * score, play count. `rating`/`clearRate` from the wider L13 sketch need `C3`
 * (a computed difficulty rating) and `R9` (population score distributions),
 * neither of which exists yet — adding the columns without the data would mean
 * a column that always reads "—", which is worse than not having it.
 */
/** `125` -> `"2:05"`. Shared by the grid and the table so the two never drift. */
export function formatSongDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export const LIBRARY_TABLE_COLUMNS: readonly LibraryTableColumn[] = [
  { key: 'title', labelKey: 'table-col-title', defaultLabel: 'Title', defaultDir: 'asc' },
  { key: 'artist', labelKey: 'table-col-artist', defaultLabel: 'Artist', defaultDir: 'asc' },
  { key: 'bpm', labelKey: 'table-col-bpm', defaultLabel: 'BPM', defaultDir: 'asc', numeric: true },
  {
    key: 'duration',
    labelKey: 'table-col-duration',
    defaultLabel: 'Duration',
    defaultDir: 'asc',
    numeric: true,
  },
  {
    key: 'yourScore',
    labelKey: 'table-col-your-score',
    defaultLabel: 'Your Best',
    defaultDir: 'desc',
    numeric: true,
    requiresAuth: true,
  },
  { key: 'plays', labelKey: 'table-col-plays', defaultLabel: 'Plays', defaultDir: 'desc', numeric: true },
] as const;
