/**
 * L1 and L5 — the genre/tag vocabulary and the timestamp convention.
 *
 * The normalisation tests are the point: a tag facet whose entries differ by
 * case and whitespace has three rows for one idea, which is the exact failure
 * the curated genre list exists to avoid.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_TAGS_PER_SONG,
  MAX_TAG_LENGTH,
  SONG_GENRES,
  extractTimestamp,
  formatTimestamp,
  isSongGenre,
  normaliseTag,
  normaliseTags,
} from '../taxonomy';

describe('L1 — genres', () => {
  it('accepts only the curated list', () => {
    expect(isSongGenre('dnb')).toBe(true);
    expect(isSongGenre('Drum & Bass')).toBe(false);
    expect(isSongGenre('')).toBe(false);
    expect(isSongGenre(null)).toBe(false);
    expect(isSongGenre(42)).toBe(false);
  });

  it('has no duplicates and no empties', () => {
    expect(new Set(SONG_GENRES).size).toBe(SONG_GENRES.length);
    expect(SONG_GENRES.every((genre) => genre.length > 0)).toBe(true);
  });
});

describe('L1 — tags', () => {
  it('collapses case and whitespace to one tag', () => {
    // Three entries for one idea is the failure this exists to prevent.
    expect(normaliseTag('Hand Charted')).toBe('hand-charted');
    expect(normaliseTag('  HAND   CHARTED  ')).toBe('hand-charted');
    expect(normaliseTag('hand-charted')).toBe('hand-charted');
  });

  it('folds accents', () => {
    expect(normaliseTag('café')).toBe('cafe');
  });

  it('rejects a tag that normalises to nothing', () => {
    expect(normaliseTag('!!!')).toBeNull();
    expect(normaliseTag('   ')).toBeNull();
    expect(normaliseTag('')).toBeNull();
  });

  it('never leaves a trailing hyphen after truncation', () => {
    // A slice mid-separator would otherwise produce "some-very-long-tag-".
    const long = normaliseTag('a'.repeat(MAX_TAG_LENGTH - 1) + ' bcdef');
    expect(long).not.toBeNull();
    expect(long!.endsWith('-')).toBe(false);
    expect(long!.length).toBeLessThanOrEqual(MAX_TAG_LENGTH);
  });

  it('de-duplicates and caps the list', () => {
    const tags = normaliseTags([
      'Rock',
      'rock',
      'ROCK ',
      ...Array.from({ length: 20 }, (_, i) => `tag${i}`),
    ]);
    expect(tags.length).toBeLessThanOrEqual(MAX_TAGS_PER_SONG);
    expect(tags.filter((tag) => tag === 'rock')).toHaveLength(1);
  });

  it('drops unusable entries without dropping the list', () => {
    expect(normaliseTags(['!!!', 'jazz', '   '])).toEqual(['jazz']);
  });
});

describe('L5 — timestamps in comments', () => {
  it('finds a timestamp mid-sentence', () => {
    // Which is how people actually write them.
    expect(extractTimestamp('the jump at 1:42 is unreadable', 200)).toBeCloseTo(102, 3);
  });

  it('reads the zero-padded and fractional forms', () => {
    expect(extractTimestamp('01:42', 200)).toBeCloseTo(102, 3);
    expect(extractTimestamp('1:42.500 here', 200)).toBeCloseTo(102.5, 3);
    expect(extractTimestamp('0:05', 200)).toBeCloseTo(5, 3);
  });

  it('ignores a timestamp past the end of the song', () => {
    // "12:00" in a three-minute song is somebody writing about something else,
    // and jumping playback to the end for it is worse than ignoring it.
    expect(extractTimestamp('12:00 was great', 180)).toBeNull();
  });

  it('returns null when there is no timestamp', () => {
    expect(extractTimestamp('great chart', 200)).toBeNull();
    expect(extractTimestamp('', 200)).toBeNull();
  });

  it('does not match a bare number or an out-of-range minute part', () => {
    expect(extractTimestamp('142', 200)).toBeNull();
    // 1:75 is not a time.
    expect(extractTimestamp('1:75', 300)).toBeNull();
  });

  it('round-trips through the display format', () => {
    expect(formatTimestamp(102)).toBe('1:42');
    expect(formatTimestamp(5)).toBe('0:05');
    expect(formatTimestamp(0)).toBe('0:00');
    expect(formatTimestamp(-5)).toBe('0:00');
    expect(extractTimestamp(formatTimestamp(102), 200)).toBeCloseTo(102, 3);
  });
});
