import { describe, test, expect } from 'vitest';
import {
  libraryPdfKey,
  libraryCoverKey,
  libraryPdfUrl,
  libraryCoverUrl,
  slugifyTitle,
  uniqueSlug,
} from '@/lib/library/keys';

describe('library storage keys', () => {
  test('libraryPdfKey nests the id under library/', () => {
    expect(libraryPdfKey('abc123')).toBe('library/abc123.pdf');
  });

  test('libraryCoverKey nests the id under library/covers/', () => {
    expect(libraryCoverKey('abc123')).toBe('library/covers/abc123.jpg');
  });

  test('libraryPdfUrl resolves to the public /library path', () => {
    expect(libraryPdfUrl('abc123')).toBe('/library/abc123.pdf');
  });

  test('libraryCoverUrl resolves to the public /library/covers path', () => {
    expect(libraryCoverUrl('abc123')).toBe('/library/covers/abc123.jpg');
  });
});

describe('slugifyTitle', () => {
  test('lowercases and hyphenates words', () => {
    expect(slugifyTitle('Hello World')).toBe('hello-world');
  });

  test('strips punctuation and collapses separators', () => {
    expect(slugifyTitle('  RMH PMC — Field Manual!! ')).toBe('rmh-pmc-field-manual');
  });

  test('falls back to "book" when nothing is left', () => {
    expect(slugifyTitle('—  —')).toBe('book');
  });
});

describe('uniqueSlug', () => {
  test('returns the base when it is free', () => {
    expect(uniqueSlug('manual', () => false)).toBe('manual');
  });

  test('suffixes with an incrementing index on collision', () => {
    const taken = new Set(['manual', 'manual-2']);
    expect(uniqueSlug('manual', (s) => taken.has(s))).toBe('manual-3');
  });
});
