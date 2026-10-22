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
} from './constants';
import { SONG_GENRES, normaliseTags } from './taxonomy';
import type { SliceSong, SongPage } from './types';
import {
  LIBRARY_SORTS,
  SORT_DIRECTIONS,
  type LibrarySort,
  type SortDirection,
} from './library-search';

// The URL contract (sorts, views, the `/slice-it/` validator) lives in a
// zod-free module so the route definition can import it; re-exported here so
// the components and the API route keep one import path.
export * from './library-search';

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

    /** L1 — the curated genre facet. Exclusive: one genre at a time. */
    genre: z.enum(SONG_GENRES).optional(),
    /**
     * L1 — the tag facet, additive. Comma-separated on the wire and matched
     * with `hasEvery`, so adding a tag NARROWS the result. `hasSome` would
     * widen it, which makes a second click feel like it did nothing.
     */
    tags: z
      .string()
      .max(200)
      .optional()
      .transform((value) => (value ? normaliseTags(value.split(',')) : undefined)),
    /** L1 — BPM range. Both ends optional. */
    bpmMin: z.coerce.number().min(20).max(400).optional(),
    bpmMax: z.coerce.number().min(20).max(400).optional(),
    /** L1 — C3 rating range, over the song's denormalised `chartRating`. */
    ratingMin: z.coerce.number().min(0).max(20).optional(),
    ratingMax: z.coerce.number().min(0).max(20).optional(),
  })
  .refine((v) => v.bpmMin === undefined || v.bpmMax === undefined || v.bpmMin <= v.bpmMax, {
    message: 'bpmMin must be <= bpmMax',
    path: ['bpmMin'],
  })
  .refine(
    (v) => v.ratingMin === undefined || v.ratingMax === undefined || v.ratingMin <= v.ratingMax,
    { message: 'ratingMin must be <= ratingMax', path: ['ratingMin'] },
  )
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
