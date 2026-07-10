/**
 * RMH Studios — Library data layer (server-only).
 *
 * Merges the bundled static catalog (lib/library/library.ts) with user-uploaded
 * and curated books stored in the LibraryDocument table. Loaders for the
 * bookshelf and the reader call these instead of the static-only helpers so
 * uploads show up everywhere without changing the reader.
 *
 * As static books are migrated into object storage (see migrate.server.ts) they
 * become LibraryDocument rows tagged with `originFilename`. We dedupe the static
 * catalog against those so a migrated book is served from S3 (not the bundled
 * file) and never appears twice — letting the on-disk public/library files be
 * dropped later without changing the catalog the user sees.
 */
import { prisma } from '@/lib/prisma.server';
import { listLibraryBooks, getLibraryBook, type LibraryBook } from './library';
import { mapDocToBook, type LibraryDocRow } from './merge';

const DOC_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  pages: true,
  format: true,
  coverKey: true,
  official: true,
  position: true,
  hidden: true,
  reported: true,
  createdAt: true,
  toc: true,
  uploadedBy: { select: { handle: true, name: true } },
} as const;

/** Set of static filenames already migrated into the LibraryDocument table. */
async function migratedFilenames(): Promise<Set<string>> {
  const rows = await prisma.libraryDocument.findMany({
    where: { originFilename: { not: null } },
    select: { originFilename: true },
  });
  return new Set(
    rows
      .map((r: { originFilename: string | null }) => r.originFilename)
      .filter((f: string | null): f is string => Boolean(f))
  );
}

/** Static catalog (minus migrated books) plus the given uploaded books. */
function withStatic(uploads: LibraryBook[], migrated: Set<string>): LibraryBook[] {
  const staticBooks = listLibraryBooks().filter((b) => !migrated.has(b.filename));
  return [...staticBooks, ...uploads];
}

/**
 * Static catalog ∪ visible uploaded books. Ordering is left to the page, which
 * splits curated from community; we sort by title as a stable default.
 */
export async function listAllBooks(): Promise<LibraryBook[]> {
  const [docs, migrated] = await Promise.all([
    prisma.libraryDocument.findMany({
      where: { hidden: false },
      select: DOC_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    }),
    migratedFilenames(),
  ]);
  const uploads = docs.map((d: LibraryDocRow) => mapDocToBook(d));
  return withStatic(uploads, migrated).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Everything, including hidden rows, for the admin edit manager. Hidden books are
 * never returned by {@link listAllBooks}, so this must only be called behind an
 * admin check.
 */
export async function listAllBooksForAdmin(): Promise<LibraryBook[]> {
  const [docs, migrated] = await Promise.all([
    prisma.libraryDocument.findMany({
      select: DOC_SELECT,
      orderBy: [{ position: 'asc' }, { createdAt: 'desc' }],
    }),
    migratedFilenames(),
  ]);
  const uploads = docs.map((d: LibraryDocRow) => mapDocToBook(d));
  return withStatic(uploads, migrated).sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Resolve a book by slug. Prefer a LibraryDocument row (covers uploads and
 * migrated static books served from S3); fall back to the bundled static catalog
 * only when no row owns the slug. A hidden row resolves to nothing — without this
 * check, hiding a *migrated* static book would let the still-bundled file leak
 * back through the fallback.
 */
export async function getBook(slug: string): Promise<LibraryBook | undefined> {
  const doc = await prisma.libraryDocument.findUnique({ where: { slug }, select: DOC_SELECT });
  if (doc) return doc.hidden ? undefined : mapDocToBook(doc as LibraryDocRow);
  return getLibraryBook(slug);
}

/** Whether a slug is already taken by an uploaded book (used during upload). */
export async function uploadSlugExists(slug: string): Promise<boolean> {
  const existing = await prisma.libraryDocument.findUnique({ where: { slug }, select: { id: true } });
  return existing !== null || getLibraryBook(slug) !== undefined;
}
