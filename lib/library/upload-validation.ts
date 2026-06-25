/**
 * RMH Studios — Library upload validation (server-safe, dependency-free).
 *
 * Validates uploaded books (PDF or EPUB) and the fields that accompany them.
 * Buffers are checked by magic bytes rather than trusting the client-declared
 * content type.
 */

import type { LibraryFormat } from './keys';

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

/**
 * Detect a buffer's library format by magic bytes, or null if it's neither.
 * EPUBs are ZIP archives (`PK\x03\x04`) whose first entry is an uncompressed
 * `mimetype` file reading `application/epub+zip`; we check both for confidence.
 */
export function detectLibraryFormat(buffer: Buffer): LibraryFormat | null {
  if (buffer.length < 4) return null;
  const head = buffer.subarray(0, 1024).toString('latin1');
  if (head.includes('%PDF')) return 'pdf';
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;
  if (isZip && head.includes('application/epub+zip')) return 'epub';
  // Some EPUBs put the mimetype past our window or compress it; accept a ZIP that
  // also contains the OEBPS/container hint as a softer signal.
  if (isZip && (head.includes('META-INF') || head.includes('mimetype'))) return 'epub';
  return null;
}

/** Validate an uploaded book buffer for a known format and non-emptiness. */
export function validateBookBuffer(buffer: Buffer): ValidationResult & { format?: LibraryFormat } {
  if (buffer.length === 0) return { ok: false, error: 'The file is empty.' };
  const format = detectLibraryFormat(buffer);
  if (!format) return { ok: false, error: "That doesn't look like a PDF or EPUB." };
  return { ok: true, format };
}

/**
 * Normalise a page count to a safe stored value. Page count is cosmetic (a card
 * badge); the reader derives the real count from the file at read time. An
 * unknown/zero/garbage value becomes 0 ("unknown"); otherwise it is floored.
 * There is no upper bound — some books are genuinely huge.
 */
export function sanitizePages(pages: unknown): number {
  const n = Number(pages);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/** Validate the title and optional description for a book. (Page count is not
 * validated — it is cosmetic and best-effort; see sanitizePages.) */
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
  return { ok: true };
}
