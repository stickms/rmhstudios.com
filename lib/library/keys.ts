/**
 * RMH Studios — Library upload storage keys & slugs.
 *
 * Uploaded books are stored in R2 under the same `library/` key space as the
 * static catalog, so the reader resolves them through the existing
 * `/library/...` → CDN convention (see lib/storage/asset.ts). Keyed by the
 * LibraryDocument id (a cuid), never by the uploaded filename.
 */
import { asset } from '@/lib/storage/asset';

/** R2 object key for an uploaded book's PDF. */
export function libraryPdfKey(id: string): string {
  return `library/${id}.pdf`;
}

/** R2 object key for an uploaded book's cover image. */
export function libraryCoverKey(id: string): string {
  return `library/covers/${id}.jpg`;
}

/** Public URL the reader fetches the PDF from (CDN-fronted when configured). */
export function libraryPdfUrl(id: string): string {
  return asset(`/library/${id}.pdf`);
}

/** Public URL of an uploaded book's cover image. */
export function libraryCoverUrl(id: string): string {
  return asset(`/library/covers/${id}.jpg`);
}

/** Lowercase, hyphenated slug from a title; "book" when nothing usable remains. */
export function slugifyTitle(title: string): string {
  const s = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return s || 'book';
}

/**
 * Return `base` if free, else the first `base-N` (N≥2) that isn't taken.
 * `exists` reports whether a candidate slug already exists.
 */
export function uniqueSlug(base: string, exists: (slug: string) => boolean): string {
  if (!exists(base)) return base;
  let n = 2;
  while (exists(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
