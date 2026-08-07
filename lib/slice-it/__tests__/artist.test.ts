/**
 * L15 — artist identity.
 *
 * These are the properties the whole feature rests on: the key is what an
 * indexed equality filter matches, so the two failures it exists to fix —
 * missing "Artist feat. Someone" and matching "Artist Two" — are exactly the
 * two things asserted here.
 *
 * The SQL backfill in
 * `prisma/migrations/20260807120000_slice_it_library_scale/migration.sql`
 * reproduces this function in `translate()`/`regexp_replace()`, and there is no
 * Postgres in this environment to check that against. What these tests pin is
 * the TypeScript side, which is what every row written from now on goes
 * through.
 */

import { describe, expect, it } from 'vitest';
import {
  ARTIST_KEY_MAX,
  artistDisplayName,
  artistKeyOf,
  artistPath,
  LATIN1_FOLD_FROM,
  LATIN1_FOLD_TO,
} from '../artist';

describe('artistKeyOf', () => {
  it('collapses spelling differences that are the same artist', () => {
    expect(artistKeyOf('MOTHER3')).toBe('mother3');
    expect(artistKeyOf('Mother 3')).toBe('mother3');
    expect(artistKeyOf('mother-3')).toBe('mother3');
    expect(artistKeyOf('  Mother  3  ')).toBe('mother3');
  });

  it('drops a trailing featuring clause — the miss the old substring search had', () => {
    const base = artistKeyOf('Camellia');
    expect(artistKeyOf('Camellia feat. Nanahira')).toBe(base);
    expect(artistKeyOf('Camellia ft. Nanahira')).toBe(base);
    expect(artistKeyOf('Camellia featuring Nanahira')).toBe(base);
    expect(artistKeyOf('Camellia (feat. Nanahira)')).toBe(base);
    expect(artistKeyOf('Camellia vs. Nanahira')).toBe(base);
  });

  it('does not split a name that merely contains a separator word', () => {
    // "Feature" is a real band name and must not become "".
    expect(artistKeyOf('Feature')).toBe('feature');
    expect(artistKeyOf('Wilco')).toBe('wilco');
    // `&` is not a featuring marker: "Simon & Garfunkel" is one artist.
    expect(artistKeyOf('Simon & Garfunkel')).toBe('simongarfunkel');
  });

  it('keeps different artists apart — the false match the old search had', () => {
    expect(artistKeyOf('Artist')).not.toBe(artistKeyOf('Artist Two'));
    expect(artistKeyOf('The Beatles')).not.toBe(artistKeyOf('Beatles'));
  });

  it('folds diacritics so an accented spelling groups with its ASCII one', () => {
    expect(artistKeyOf('Björk')).toBe('bjork');
    expect(artistKeyOf('Bjork')).toBe('bjork');
    expect(artistKeyOf('Sigur Rós')).toBe(artistKeyOf('Sigur Ros'));
  });

  it('returns null rather than an empty key for an unkeyable tag', () => {
    // '' would make one artist page holding every song whose artist tag was
    // punctuation; NULL keeps them distinct, which is what Postgres does.
    expect(artistKeyOf('***')).toBeNull();
    expect(artistKeyOf('   ')).toBeNull();
    expect(artistKeyOf('')).toBeNull();
    expect(artistKeyOf(null)).toBeNull();
    expect(artistKeyOf(undefined)).toBeNull();
  });

  it('never exceeds the column width', () => {
    const key = artistKeyOf('a'.repeat(500));
    expect(key).not.toBeNull();
    expect(key!.length).toBe(ARTIST_KEY_MAX);
  });

  it('preserves non-Latin scripts rather than erasing them', () => {
    // Stripping to `[a-z0-9]` would have keyed every CJK artist to null and
    // merged them all into "no key".
    expect(artistKeyOf('東方')).toBe('東方');
    expect(artistKeyOf('Кино')).toBe('кино');
  });

  it('is idempotent — a key normalises to itself', () => {
    for (const name of ['MOTHER3', 'Björk feat. Thom', 'Simon & Garfunkel']) {
      const once = artistKeyOf(name);
      expect(artistKeyOf(once)).toBe(once);
    }
  });
});

describe('the SQL fold table', () => {
  it('pairs every source character with a replacement', () => {
    // `translate()` in Postgres pairs these positionally; a length mismatch
    // silently DELETES the unpaired characters, which would produce a backfill
    // that differs from the runtime normaliser in a way nothing would catch.
    expect([...LATIN1_FOLD_FROM].length).toBe([...LATIN1_FOLD_TO].length);
  });

  it('agrees with the runtime normaliser on every character it lists', () => {
    const from = [...LATIN1_FOLD_FROM];
    const to = [...LATIN1_FOLD_TO];
    for (let i = 0; i < from.length; i++) {
      expect(artistKeyOf(from[i])).toBe(to[i].toLowerCase());
    }
  });
});

describe('artistPath', () => {
  it('encodes keys that are not URL-safe', () => {
    expect(artistPath('mother3')).toBe('/slice-it/artist/mother3');
    expect(artistPath('東方')).toBe(`/slice-it/artist/${encodeURIComponent('東方')}`);
  });
});

describe('artistDisplayName', () => {
  it('picks the most common spelling', () => {
    expect(artistDisplayName(['Mother 3', 'Mother 3', 'MOTHER3'])).toBe('Mother 3');
  });

  it('breaks a tie on length, not on input order', () => {
    expect(artistDisplayName(['MOTHER3', 'Mother 3'])).toBe('Mother 3');
    expect(artistDisplayName(['Mother 3', 'MOTHER3'])).toBe('Mother 3');
  });

  it('ignores blank spellings and returns "" when there is nothing to show', () => {
    expect(artistDisplayName(['', '   '])).toBe('');
    expect(artistDisplayName([])).toBe('');
  });
});
