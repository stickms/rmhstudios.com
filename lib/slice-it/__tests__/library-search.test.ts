/**
 * L14 — search ranking, and the two sort rules that make it reachable.
 *
 * The ranking itself is SQL and there is no Postgres in this environment, so
 * what is pinned here is everything about it that is not SQL: the sort
 * resolution that decides a query gets ranked at all, the weights, and the
 * difficulty sort that C3 left populated and unreachable
 * (`docs/_handoff/rating-requests.md` §1).
 */

import { describe, expect, it } from 'vitest';
import { SONG_SORTS } from '../constants';
import {
  DEFAULT_SORT_DIRECTION,
  LIBRARY_SORTS,
  LibrarySongsQueryZ,
  effectiveLibrarySort,
  librarySearchSchema,
} from '../library-filters';

describe('effectiveLibrarySort (L14)', () => {
  it('ranks by relevance when a query is typed and no sort was chosen', () => {
    // The actual bug L14 names: typing a query re-filtered the list and left it
    // ordered by upload date.
    expect(effectiveLibrarySort('recent', 'euphoria')).toBe('relevance');
  });

  it('respects a sort the user actually picked', () => {
    for (const sort of ['popular', 'liked', 'title', 'duration', 'difficulty'] as const) {
      expect(effectiveLibrarySort(sort, 'euphoria')).toBe(sort);
    }
  });

  it('degrades relevance to recent when there is nothing to be relevant to', () => {
    // Reachable from a hand-edited URL and from clearing the search box with
    // the sort left alone.
    expect(effectiveLibrarySort('relevance', '')).toBe('recent');
    expect(effectiveLibrarySort('relevance', undefined)).toBe('recent');
    expect(effectiveLibrarySort('relevance', '   ')).toBe('recent');
  });

  it('treats whitespace as no query', () => {
    expect(effectiveLibrarySort('recent', '   ')).toBe('recent');
  });

  it('is idempotent', () => {
    for (const sort of LIBRARY_SORTS) {
      const once = effectiveLibrarySort(sort, 'q');
      expect(effectiveLibrarySort(once, 'q')).toBe(once);
    }
  });
});

describe('the difficulty sort (C3)', () => {
  it('is part of the shared SongSort vocabulary, not a table-only extra', () => {
    // It sorts `Song.chartRating`, a plain column with an index sized for it —
    // unlike `yourScore`, which needs a per-viewer join.
    expect(SONG_SORTS).toContain('difficulty');
  });

  it('defaults to hardest-first', () => {
    expect(DEFAULT_SORT_DIRECTION.difficulty).toBe('desc');
  });

  it('is accepted by both the URL schema and the API schema', () => {
    expect(librarySearchSchema.parse({ sort: 'difficulty' }).sort).toBe('difficulty');
    expect(LibrarySongsQueryZ.safeParse({ sort: 'difficulty' }).success).toBe(true);
  });
});

describe('the artist facet (L15)', () => {
  it('rides in the URL and in the API query', () => {
    expect(librarySearchSchema.parse({ artist: 'mother3' }).artist).toBe('mother3');
    expect(LibrarySongsQueryZ.parse({ artist: 'mother3' }).artist).toBe('mother3');
  });

  it('degrades a malformed artist rather than throwing the navigation', () => {
    expect(() => librarySearchSchema.parse({ artist: { nope: 1 } })).not.toThrow();
  });

  it('is bounded to the column width', () => {
    expect(LibrarySongsQueryZ.safeParse({ artist: 'a'.repeat(201) }).success).toBe(false);
    expect(LibrarySongsQueryZ.safeParse({ artist: 'a'.repeat(200) }).success).toBe(true);
  });

  it('leaves the default search free of an artist filter', () => {
    expect(librarySearchSchema.parse({}).artist).toBeUndefined();
  });
});

describe('the pack filter (L16)', () => {
  it('only accepts a uuid, because a pack id is one', () => {
    expect(LibrarySongsQueryZ.safeParse({ packId: 'not-a-uuid' }).success).toBe(false);
    expect(
      LibrarySongsQueryZ.safeParse({ packId: '00000000-0000-4000-8000-000000000000' }).success,
    ).toBe(true);
  });
});
