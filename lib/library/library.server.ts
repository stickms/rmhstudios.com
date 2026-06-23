/**
 * RMH Studios — Library data layer (server-only).
 *
 * Merges the bundled static catalog (lib/library/library.ts) with user-uploaded
 * books stored in the LibraryDocument table. Loaders for the bookshelf and the
 * reader call these instead of the static-only helpers so uploads show up
 * everywhere without changing the reader.
 */
import { prisma } from '@/lib/prisma.server';
import { listLibraryBooks, getLibraryBook, type LibraryBook } from './library';
import { mapDocToBook } from './merge';

const DOC_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  pages: true,
  coverKey: true,
  uploadedBy: { select: { handle: true, name: true } },
} as const;

/** Static catalog ∪ uploaded books (excluding hidden), alphabetised by title. */
export async function listAllBooks(): Promise<LibraryBook[]> {
  const docs = await prisma.libraryDocument.findMany({
    where: { hidden: false },
    select: DOC_SELECT,
    orderBy: { createdAt: 'desc' },
  });
  const uploads = docs.map(mapDocToBook);
  return [...listLibraryBooks(), ...uploads].sort((a, b) => a.title.localeCompare(b.title));
}

/** Resolve a book by slug — static catalog first, then uploaded books. */
export async function getBook(slug: string): Promise<LibraryBook | undefined> {
  const staticBook = getLibraryBook(slug);
  if (staticBook) return staticBook;
  const doc = await prisma.libraryDocument.findFirst({
    where: { slug, hidden: false },
    select: DOC_SELECT,
  });
  return doc ? mapDocToBook(doc) : undefined;
}

/** Whether a slug is already taken by an uploaded book (used during upload). */
export async function uploadSlugExists(slug: string): Promise<boolean> {
  const existing = await prisma.libraryDocument.findUnique({ where: { slug }, select: { id: true } });
  return existing !== null || getLibraryBook(slug) !== undefined;
}
