/**
 * The song library's shared filter/sort/view contract (L13, L17, L18, S9).
 *
 * These are the properties that keep the URL schema, the API schema and the
 * table's column definitions from drifting apart — see the module doc on
 * `lib/slice-it/library-filters.ts` for why the extra sort keys live here
 * rather than in `constants.ts`.
 */

import { describe, expect, it } from 'vitest';
import { SONGS_PAGE_SIZE_MAX, SONG_SORTS } from '../constants';
import {
  AUTH_ONLY_SORTS,
  DEFAULT_LIBRARY_SEARCH,
  DEFAULT_RANDOM_CONSTRAINTS,
  DEFAULT_SORT_DIRECTION,
  LIBRARY_EXTRA_SORTS,
  LIBRARY_SORTS,
  LIBRARY_TABLE_COLUMNS,
  LIBRARY_VIEWS,
  LibrarySongsQueryZ,
  RECENTLY_PLAYED_LIMIT,
  SORT_DIRECTIONS,
  formatSongDuration,
  librarySearchSchema,
  normalizeLibrarySearch,
} from '../library-filters';

describe('LIBRARY_SORTS', () => {
  it('is exactly SONG_SORTS plus the table-only extra sorts, with no duplicates', () => {
    expect(LIBRARY_SORTS).toEqual([...SONG_SORTS, ...LIBRARY_EXTRA_SORTS]);
    expect(new Set(LIBRARY_SORTS).size).toBe(LIBRARY_SORTS.length);
  });

  it('contains every base SongSort', () => {
    for (const sort of SONG_SORTS) expect(LIBRARY_SORTS).toContain(sort);
  });

  it('has a default direction for every sort key, including SongSort ones', () => {
    for (const sort of LIBRARY_SORTS) {
      expect(SORT_DIRECTIONS).toContain(DEFAULT_SORT_DIRECTION[sort]);
    }
  });

  it('flags exactly `yourScore` as needing a signed-in viewer', () => {
    expect(AUTH_ONLY_SORTS).toEqual(['yourScore']);
  });
});

describe('LIBRARY_TABLE_COLUMNS (L13)', () => {
  it('is exactly the six columns asked for: title, artist, BPM, duration, your best score, plays', () => {
    expect(LIBRARY_TABLE_COLUMNS.map((c) => c.key).sort()).toEqual(
      ['artist', 'bpm', 'duration', 'plays', 'title', 'yourScore'].sort(),
    );
  });

  it('every column key is a real sort key', () => {
    for (const col of LIBRARY_TABLE_COLUMNS) {
      expect(LIBRARY_SORTS).toContain(col.key);
    }
  });

  it('only the your-best-score column requires auth', () => {
    for (const col of LIBRARY_TABLE_COLUMNS) {
      expect(Boolean(col.requiresAuth)).toBe(col.key === 'yourScore');
    }
  });
});

describe('librarySearchSchema (L18 — validateSearch)', () => {
  it('defaults an empty object to grid/recent with no query', () => {
    expect(librarySearchSchema.parse({})).toEqual(DEFAULT_LIBRARY_SEARCH);
  });

  it('degrades a malformed sort/view/dir instead of throwing', () => {
    const parsed = librarySearchSchema.parse({ sort: 'not-a-sort', view: 'kanban', dir: 'up' });
    expect(parsed.sort).toBe('recent');
    expect(parsed.view).toBe('grid');
    expect(parsed.dir).toBeUndefined();
  });

  it('accepts every LIBRARY_SORTS value and every LIBRARY_VIEWS value', () => {
    for (const sort of LIBRARY_SORTS) {
      expect(librarySearchSchema.parse({ sort }).sort).toBe(sort);
    }
    for (const view of LIBRARY_VIEWS) {
      expect(librarySearchSchema.parse({ view }).view).toBe(view);
    }
  });

  it('passes an unrelated search param through untouched (the multiplayer `?lobby=` code)', () => {
    const parsed = librarySearchSchema.parse({ lobby: 'ABC123' }) as Record<string, unknown>;
    expect(parsed.lobby).toBe('ABC123');
  });

  it('never throws on garbage input', () => {
    expect(() => librarySearchSchema.parse(null)).not.toThrow();
    expect(() => librarySearchSchema.parse('nonsense')).not.toThrow();
    expect(() => librarySearchSchema.parse([1, 2, 3])).not.toThrow();
  });
});

describe('normalizeLibrarySearch', () => {
  it('falls back to defaults for non-object input rather than throwing', () => {
    expect(normalizeLibrarySearch(undefined)).toEqual(DEFAULT_LIBRARY_SEARCH);
    expect(normalizeLibrarySearch('nope')).toEqual(DEFAULT_LIBRARY_SEARCH);
  });

  it('round-trips a well-formed search object', () => {
    const result = normalizeLibrarySearch({ q: 'euphoria', sort: 'bpm', dir: 'asc', view: 'table' });
    expect(result).toEqual({ q: 'euphoria', sort: 'bpm', dir: 'asc', view: 'table' });
  });
});

describe('LibrarySongsQueryZ (the API route schema)', () => {
  it('defaults sort to recent and limit/mine sensibly', () => {
    const parsed = LibrarySongsQueryZ.parse({});
    expect(parsed.sort).toBe('recent');
    expect(parsed.mine).toBe(false);
  });

  it('rejects durationMin > durationMax (S9 constraints)', () => {
    expect(LibrarySongsQueryZ.safeParse({ durationMin: 200, durationMax: 100 }).success).toBe(false);
  });

  it('accepts durationMin === durationMax and durationMin < durationMax', () => {
    expect(LibrarySongsQueryZ.safeParse({ durationMin: 100, durationMax: 100 }).success).toBe(true);
    expect(LibrarySongsQueryZ.safeParse({ durationMin: 50, durationMax: 100 }).success).toBe(true);
  });

  it('coerces unplayedOnly/likedOnly to real booleans', () => {
    const on = LibrarySongsQueryZ.parse({ unplayedOnly: 'true', likedOnly: 'false' });
    expect(on.unplayedOnly).toBe(true);
    expect(on.likedOnly).toBe(false);

    const off = LibrarySongsQueryZ.parse({});
    expect(off.unplayedOnly).toBe(false);
    expect(off.likedOnly).toBe(false);
  });

  it('reads the random=1 and shelf=recent branch flags', () => {
    expect(LibrarySongsQueryZ.parse({ random: '1' }).random).toBe('1');
    expect(LibrarySongsQueryZ.parse({ shelf: 'recent' }).shelf).toBe('recent');
    expect(LibrarySongsQueryZ.safeParse({ random: '2' }).success).toBe(false);
    expect(LibrarySongsQueryZ.safeParse({ shelf: 'yesterday' }).success).toBe(false);
  });

  it('rejects a limit above SONGS_PAGE_SIZE_MAX rather than silently clamping', () => {
    expect(LibrarySongsQueryZ.safeParse({ limit: SONGS_PAGE_SIZE_MAX }).success).toBe(true);
    expect(LibrarySongsQueryZ.safeParse({ limit: SONGS_PAGE_SIZE_MAX + 1 }).success).toBe(false);
  });

  it('accepts every LIBRARY_SORTS value, including the table-only ones', () => {
    for (const sort of LIBRARY_SORTS) {
      expect(LibrarySongsQueryZ.safeParse({ sort }).success).toBe(true);
    }
  });
});

describe('formatSongDuration', () => {
  it('formats seconds as m:ss', () => {
    expect(formatSongDuration(0)).toBe('0:00');
    expect(formatSongDuration(5)).toBe('0:05');
    expect(formatSongDuration(65)).toBe('1:05');
    expect(formatSongDuration(3599)).toBe('59:59');
  });

  it('clamps negative input rather than producing a negative-looking string', () => {
    expect(formatSongDuration(-10)).toBe('0:00');
  });

  it('rounds rather than truncates', () => {
    expect(formatSongDuration(59.6)).toBe('1:00');
  });
});

describe('constants sanity', () => {
  it('RECENTLY_PLAYED_LIMIT and DEFAULT_RANDOM_CONSTRAINTS are usable defaults', () => {
    expect(RECENTLY_PLAYED_LIMIT).toBeGreaterThan(0);
    expect(DEFAULT_RANDOM_CONSTRAINTS.unplayedOnly).toBe(false);
    expect(DEFAULT_RANDOM_CONSTRAINTS.likedOnly).toBe(false);
  });
});
