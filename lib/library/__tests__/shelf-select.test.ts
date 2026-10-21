/**
 * WS4 — the /library shelf loader must not ship per-book outlines.
 *
 * A book's `toc` is a JSON outline (hundreds of entries for a long PDF). The
 * shelf never opens a book; the reader routes load it through `getBook`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { findMany, findUnique } = vi.hoisted(() => ({ findMany: vi.fn(), findUnique: vi.fn() }));

vi.mock('@/lib/prisma.server', () => ({
  prisma: { libraryDocument: { findMany, findUnique } },
}));

import { getBook, listAllBooks, listAllBooksForAdmin } from '@/lib/library/library.server';

const row = {
  id: 'doc1',
  slug: 'doc-one',
  title: 'Doc One',
  description: 'd',
  pages: 10,
  format: 'pdf',
  coverKey: null,
  official: false,
  position: 0,
  hidden: false,
  reported: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  uploadedBy: { handle: 'h', name: 'n' },
};

beforeEach(() => {
  findMany.mockReset();
  findUnique.mockReset();
});

describe('library shelf select', () => {
  it('listAllBooks excludes toc from the uploads query and returns an empty outline', async () => {
    findMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
      'originFilename' in args.select ? [] : [row],
    );
    const books = await listAllBooks();
    const uploadsQuery = findMany.mock.calls.map((c) => c[0]).find((a) => a.where?.hidden === false);
    expect(uploadsQuery.select.toc).toBe(false);
    // Still two queries, as before (uploads + migrated filenames) — no extra round trip.
    expect(findMany).toHaveBeenCalledTimes(2);
    const book = books.find((b) => b.slug === 'doc-one');
    expect(book?.toc).toEqual([]);
    expect(book?.title).toBe('Doc One');
  });

  it('the reader (getBook) and the admin manager still read the outline', async () => {
    findUnique.mockResolvedValue({ ...row, toc: [{ title: 'Ch 1', page: 1 }] });
    const book = await getBook('doc-one');
    expect(book?.toc).toEqual([{ title: 'Ch 1', page: 1, depth: undefined }]);

    findMany.mockResolvedValue([]);
    await listAllBooksForAdmin();
    const adminQuery = findMany.mock.calls.map((c) => c[0]).find((a) => !a.where);
    expect(adminQuery.select.toc).toBe(true);
  });
});
