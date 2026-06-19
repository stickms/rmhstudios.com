/**
 * RMH Studios — Library data layer.
 *
 * The library is the set of PDFs in `public/library`. Their human-readable titles
 * and descriptions are generated once via DeepSeek (see
 * scripts/generate-library-metadata.ts) and cached in data/library-metadata.json,
 * which we import here as the source of truth. Each entry is turned into a
 * `LibraryBook` with a stable slug, a public PDF URL, and a deterministic accent
 * hue so the bookshelf and reader can render rich, consistent cards without any
 * runtime PDF parsing or LLM calls.
 *
 * Pure/static (no fs, no secrets) so it's safe to import from both the server
 * loader and the client.
 */

import metadata from '@/data/library-metadata.json';

/** A table-of-contents entry: a chapter/section title and the page it starts on. */
export type TocEntry = { title: string; page: number; depth?: number };

type RawMeta = {
  title: string;
  description: string;
  pages: number;
  cover?: string | null;
  toc?: TocEntry[];
};

export type LibraryBook = {
  /** URL-safe identifier derived from the filename. */
  slug: string;
  /** Original filename within public/library (e.g. "everything-platform.pdf"). */
  filename: string;
  /** Public URL the browser can fetch the PDF from. */
  url: string;
  /** Clean, human-readable title (DeepSeek-generated). */
  title: string;
  /** One-sentence description (DeepSeek-generated; may be empty). */
  description: string;
  /** Total page count. */
  pages: number;
  /** Public URL of the rendered first-page cover image, or null if none. */
  coverUrl: string | null;
  /** Deterministic accent hue (0–360) used for the spine tint / cover fallback. */
  hue: number;
  /** Pre-computed table of contents (chapter → page), when known. May be empty. */
  toc: TocEntry[];
};

/** "everything_platform_minute_vol1.pdf" → "Everything Platform Minute Vol1". */
function humanize(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Lowercase, hyphenated slug from a filename (extension stripped). */
function slugify(filename: string): string {
  return filename
    .replace(/\.pdf$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Stable hue in [0, 360) from a string, so each book keeps the same tint. */
function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

/**
 * Build the book list from the metadata map. Slugs must be unique; on the rare
 * collision (two filenames slugify the same) we suffix with an index so links
 * stay stable and resolvable.
 */
function buildBooks(): LibraryBook[] {
  const seen = new Map<string, number>();
  const books = Object.entries(metadata as Record<string, RawMeta>).map(([filename, meta]) => {
    let slug = slugify(filename) || 'book';
    const n = seen.get(slug) ?? 0;
    seen.set(slug, n + 1);
    if (n > 0) slug = `${slug}-${n + 1}`;

    return {
      slug,
      filename,
      url: `/library/${encodeURIComponent(filename)}`,
      title: meta.title || humanize(filename),
      description: meta.description || '',
      pages: meta.pages || 0,
      coverUrl: meta.cover ? `/library/covers/${encodeURIComponent(meta.cover)}` : null,
      hue: hueFromString(filename),
      toc: meta.toc ?? [],
    } satisfies LibraryBook;
  });

  return books.sort((a, b) => a.title.localeCompare(b.title));
}

const BOOKS = buildBooks();

/** All books, alphabetised by title. */
export function listLibraryBooks(): LibraryBook[] {
  return BOOKS;
}

/** A single book by slug, or undefined if it doesn't exist. */
export function getLibraryBook(slug: string): LibraryBook | undefined {
  return BOOKS.find((b) => b.slug === slug);
}
