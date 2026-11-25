/**
 * Library books for read-alongs (s11-09, server-only): the picker's search, the suggested parts and the lookups the
 * start and edit calls need. Kept apart from `read-along.server.ts` because the library's static catalog reads
 * `data/library-metadata.json`, which the jobs worker (it only posts parts) does not carry.
 */
import { getBook, listAllBooks } from '@/lib/library/library.server';
import {
  canReadAlong,
  chaptersOf,
  maxPartsFor,
  splitFromToc,
  suggestedPartCount,
  type BookChoiceDTO,
  type PlanDTO,
} from '@/lib/communities/read-along';
import { ReadAlongError, type BookInfo } from '@/lib/communities/read-along.server';

const BOOK_LIST_MAX = 20;

const choiceOf = (b: { slug: string; title: string; pages: number; format: 'pdf' | 'epub' }): BookChoiceDTO => ({
  slug: b.slug,
  title: b.title,
  pages: b.pages,
  format: b.format,
});

/** Library books a community can read: listed (not hidden) and long enough to cut in two. Moderators only. */
export async function searchBooks(q: string | undefined): Promise<BookChoiceDTO[]> {
  const books = await listAllBooks();
  const needle = (q ?? '').trim().toLowerCase();
  return books
    .filter((b) => canReadAlong(b.pages) && (needle === '' || b.title.toLowerCase().includes(needle)))
    .slice(0, BOOK_LIST_MAX)
    .map(choiceOf);
}

/** The suggested parts of a book. `word` is the translated "Part" the labels start with. */
export async function planFor(docSlug: string, parts: number | undefined, word: string | undefined): Promise<PlanDTO> {
  const book = await getBook(docSlug);
  if (!book || !canReadAlong(book.pages)) throw new ReadAlongError('NOT_FOUND');
  const count = Math.min(parts ?? suggestedPartCount(book.pages), maxPartsFor(book.pages));
  return {
    book: choiceOf(book),
    hasToc: chaptersOf(book.toc, book.pages).length >= 2,
    parts: splitFromToc(book.toc, book.pages, count, word ?? 'Part'),
    maxParts: maxPartsFor(book.pages),
  };
}

/** The library book a slug names, as a read-along needs it; undefined when it is not listed (or is hidden). */
export async function bookInfoOf(docSlug: string): Promise<BookInfo | undefined> {
  const book = await getBook(docSlug);
  return book ? { slug: book.slug, title: book.title, pages: book.pages } : undefined;
}

/** The page count of a library book by slug, for editing the parts of a read-along. */
export async function pagesOfBook(docSlug: string): Promise<number | undefined> {
  return (await bookInfoOf(docSlug))?.pages;
}
