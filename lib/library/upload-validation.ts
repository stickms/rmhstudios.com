/**
 * RMH Studios — Library upload validation (server-safe, dependency-free).
 *
 * Validates uploaded PDFs and the book fields that accompany them. Buffers are
 * checked by magic bytes rather than trusting the client-declared content type.
 */

/** Maximum accepted PDF size for a regular (non-admin) upload (10 MB). */
export const LIBRARY_PDF_MAX_BYTES_USER = 10 * 1024 * 1024;

/** Maximum accepted PDF size for an admin upload (64 MB). */
export const LIBRARY_PDF_MAX_BYTES_ADMIN = 64 * 1024 * 1024;

/**
 * Backwards-compatible default (admin ceiling). Prefer {@link libraryPdfMaxBytes}
 * so the limit reflects the uploader's role.
 */
export const LIBRARY_PDF_MAX_BYTES = LIBRARY_PDF_MAX_BYTES_ADMIN;

/** The PDF size ceiling for an uploader, based on whether they're an admin. */
export function libraryPdfMaxBytes(isAdmin: boolean): number {
  return isAdmin ? LIBRARY_PDF_MAX_BYTES_ADMIN : LIBRARY_PDF_MAX_BYTES_USER;
}

/** Maximum number of books a single user may have uploaded. */
export const LIBRARY_USER_QUOTA = 20;

const TITLE_MAX = 200;
const DESCRIPTION_MAX = 1000;
const PAGES_MAX = 100_000;

export type ValidationResult = { ok: true } | { ok: false; error: string };

/** True only if the buffer carries a `%PDF` signature near its start. */
export function validatePdfBuffer(buffer: Buffer): ValidationResult {
  if (buffer.length === 0) return { ok: false, error: 'The file is empty.' };
  const head = buffer.subarray(0, 1024).toString('latin1');
  if (!head.includes('%PDF')) {
    return { ok: false, error: "That doesn't look like a PDF." };
  }
  return { ok: true };
}

/** Validate the title, page count, and optional description for a book. */
export function validateBookFields(input: {
  title: string;
  pages: number;
  description?: string;
}): ValidationResult {
  const title = input.title.trim();
  if (!title) return { ok: false, error: 'A title is required.' };
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `Title must be ${TITLE_MAX} characters or fewer.` };
  }
  if ((input.description?.length ?? 0) > DESCRIPTION_MAX) {
    return { ok: false, error: `Description must be ${DESCRIPTION_MAX} characters or fewer.` };
  }
  if (!Number.isInteger(input.pages) || input.pages < 1 || input.pages > PAGES_MAX) {
    return { ok: false, error: 'Invalid page count.' };
  }
  return { ok: true };
}
