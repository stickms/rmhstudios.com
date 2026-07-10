/**
 * RMH Studios — Library upload storage keys & slugs.
 *
 * Uploaded books are stored in R2 under the `library/` key space, keyed by the
 * LibraryDocument id (never the uploaded filename). They are served back through
 * same-origin streaming routes (`/api/library/file|cover/<id>`) so they resolve
 * in every environment — unlike a bare `/library/...` path, which only works
 * where a CDN fronts R2.
 */

/** A library document's file format. */
export type LibraryFormat = 'pdf' | 'epub';

/** R2 object key for an uploaded book's PDF. */
export function libraryPdfKey(id: string): string {
  return `library/${id}.pdf`;
}

/** R2 object key for an uploaded book's file, by format (pdf → .pdf, epub → .epub). */
export function libraryFileKey(id: string, format: LibraryFormat): string {
  return format === 'epub' ? `library/${id}.epub` : libraryPdfKey(id);
}

/** The stored content type for a format. */
export function libraryContentType(format: LibraryFormat): string {
  return format === 'epub' ? 'application/epub+zip' : 'application/pdf';
}

/** R2 object key for an uploaded book's cover image. */
export function libraryCoverKey(id: string): string {
  return `library/covers/${id}.jpg`;
}

/** Same-origin URL the reader fetches the PDF from (streams from R2). */
export function libraryPdfUrl(id: string): string {
  return `/api/library/file/${id}`;
}

/** Same-origin URL of an uploaded book's cover image (streams from R2). */
export function libraryCoverUrl(id: string): string {
  return `/api/library/cover/${id}`;
}

/** Guard against path traversal: ids are cuids/uuids (alphanumerics + dashes). */
export function isSafeLibraryId(id: string): boolean {
  return /^[A-Za-z0-9-]+$/.test(id);
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
