import { describe, test, expect } from 'vitest';
import { mapDocToBook, mergeBooks, type LibraryDocRow } from '@/lib/library/merge';
import type { LibraryBook } from '@/lib/library/library';

const baseRow: LibraryDocRow = {
  id: 'abc',
  slug: 'manual',
  title: 'Field Manual',
  description: 'A manual.',
  pages: 5,
  coverKey: 'library/covers/abc.jpg',
  uploadedBy: { handle: 'alex', name: 'Alex' },
};

describe('mapDocToBook', () => {
  test('maps a row to a LibraryBook with upload URLs and attribution', () => {
    const book = mapDocToBook(baseRow);
    expect(book.slug).toBe('manual');
    expect(book.url).toBe('/library/abc.pdf');
    expect(book.coverUrl).toBe('/library/covers/abc.jpg');
    expect(book.pages).toBe(5);
    expect(book.source).toBe('upload');
    expect(book.id).toBe('abc');
    expect(book.uploadedBy).toEqual({ handle: 'alex', name: 'Alex' });
    expect(typeof book.hue).toBe('number');
    expect(book.hue).toBeGreaterThanOrEqual(0);
    expect(book.hue).toBeLessThan(360);
  });

  test('coverUrl is null when the row has no cover', () => {
    expect(mapDocToBook({ ...baseRow, coverKey: null }).coverUrl).toBeNull();
  });
});

describe('mergeBooks', () => {
  test('concatenates static and uploaded books sorted by title', () => {
    const staticBooks = [
      { title: 'Zebra', slug: 'z' },
      { title: 'Apple', slug: 'a' },
    ] as LibraryBook[];
    const uploads = [{ title: 'Mango', slug: 'm' }] as LibraryBook[];
    expect(mergeBooks(staticBooks, uploads).map((b) => b.title)).toEqual([
      'Apple',
      'Mango',
      'Zebra',
    ]);
  });
});
