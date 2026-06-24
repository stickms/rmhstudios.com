/**
 * RMH Studios — Library merge helpers (pure, client-safe).
 *
 * Maps uploaded-book DB rows into the shared `LibraryBook` shape and merges them
 * with the static catalog. Kept free of Prisma/secrets so it can be unit-tested
 * and imported anywhere; the impure DB fetch lives in `library.server.ts`.
 */
import type { LibraryBook, TocEntry } from './library';
import { libraryPdfUrl, libraryCoverUrl } from './keys';

/** The subset of a LibraryDocument row needed to build a LibraryBook. */
export type LibraryDocRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  pages: number;
  coverKey: string | null;
  uploadedBy?: { handle: string | null; name: string | null } | null;
  official?: boolean;
  position?: number;
  hidden?: boolean;
  reported?: boolean;
  createdAt?: Date | string | null;
  toc?: unknown;
};

/** Coerce a persisted JSON `toc` value back into a typed TocEntry[]. */
function normalizeToc(value: unknown): TocEntry[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((e): e is { title: unknown; page: unknown; depth?: unknown } => typeof e === 'object' && e !== null)
    .map((e) => ({
      title: String((e as { title?: unknown }).title ?? ''),
      page: Number((e as { page?: unknown }).page ?? 0),
      depth: typeof (e as { depth?: unknown }).depth === 'number' ? (e as { depth: number }).depth : undefined,
    }))
    .filter((e) => e.title && Number.isFinite(e.page));
}

/** Stable hue in [0, 360) from a string, matching the static catalog's tinting. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/** Convert an uploaded-book row into a `LibraryBook`. */
export function mapDocToBook(row: LibraryDocRow): LibraryBook {
  const createdAt =
    row.createdAt instanceof Date
      ? row.createdAt.toISOString()
      : typeof row.createdAt === 'string'
        ? row.createdAt
        : null;
  return {
    slug: row.slug,
    filename: `${row.id}.pdf`,
    url: libraryPdfUrl(row.id),
    title: row.title,
    description: row.description ?? '',
    pages: row.pages ?? 0,
    coverUrl: row.coverKey ? libraryCoverUrl(row.id) : null,
    hue: hueFromString(row.id),
    toc: normalizeToc(row.toc),
    source: 'upload',
    id: row.id,
    uploadedBy: row.uploadedBy ?? null,
    curated: Boolean(row.official),
    position: row.position ?? 0,
    createdAt,
    hidden: Boolean(row.hidden),
    reported: Boolean(row.reported),
  };
}

/** Merge the static catalog with uploaded books, alphabetised by title. */
export function mergeBooks(staticBooks: LibraryBook[], uploads: LibraryBook[]): LibraryBook[] {
  return [...staticBooks, ...uploads].sort((a, b) => a.title.localeCompare(b.title));
}
