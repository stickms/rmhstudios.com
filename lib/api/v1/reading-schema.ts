/**
 * Zod schemas and cursors for `/api/v1/me/highlights*`, `/api/v1/me/shelves*` and `/api/v1/me/reading-goal`.
 * Pure (no server imports) so the limits and the cursor format are testable on their own. Query parameters are
 * validated like bodies: a list is never a repeated parameter, and an empty parameter reads as absent.
 */
import { z } from 'zod';
import { HIGHLIGHT_NOTE_MAX, READING_DOC_KINDS, shelfSchema } from '@/lib/reading/schema';

export const READING_PAGE_MAX = 100;
export const READING_PAGE_DEFAULT = 30;
const ID_MAX = 64;
const SLUG_MAX = 200;
/** A finish date may be a little ahead of the server clock (clock skew), not a day ahead. */
export const FINISHED_AT_SKEW_MS = 5 * 60_000;

const blankIsAbsent = (v: unknown) => (v === '' || v === null ? undefined : v);

const optionalText = (max: number) => z.preprocess(blankIsAbsent, z.string().max(max).optional());

const pageLimit = z.preprocess(
  blankIsAbsent,
  z.coerce.number().int().min(1).max(READING_PAGE_MAX).default(READING_PAGE_DEFAULT),
);

const isoInstant = z
  .string()
  .max(40)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Not an ISO 8601 date and time.');

export const highlightsQuery = z.object({
  limit: pageLimit,
  cursor: optionalText(200),
  kind: z.preprocess(blankIsAbsent, z.enum(READING_DOC_KINDS).optional()),
  since: z.preprocess(blankIsAbsent, isoInstant.optional()),
  hasNote: z.preprocess(blankIsAbsent, z.enum(['true', 'false']).optional()),
  visibility: z.preprocess(blankIsAbsent, z.enum(['public', 'private']).optional()),
});
export type HighlightsQuery = z.infer<typeof highlightsQuery>;

export const highlightPath = z.object({ id: z.string().min(1).max(ID_MAX) });

export const patchHighlightBody = z
  .object({
    note: z.string().max(HIGHLIGHT_NOTE_MAX).nullable().optional(),
    isPublic: z.boolean().optional(),
  })
  .strict()
  .refine((b) => b.note !== undefined || b.isPublic !== undefined, 'Send note, isPublic or both.');
export type PatchHighlightBody = z.infer<typeof patchHighlightBody>;

export const shelvesQuery = z.object({
  shelf: z.preprocess(blankIsAbsent, shelfSchema.optional()),
});

export const shelfPath = z.object({
  slug: z
    .string()
    .min(1)
    .max(SLUG_MAX)
    .regex(/^[^\s/]+$/, 'Not a library slug.'),
});

export const putShelfBody = z
  .object({
    shelf: shelfSchema,
    pages: z.number().int().min(0).max(100_000).optional(),
    finishedAt: isoInstant.nullable().optional(),
  })
  .strict()
  .refine(
    (b) => b.finishedAt === undefined || b.finishedAt === null || b.shelf === 'read',
    'finishedAt only applies to the read shelf.',
  )
  .refine(
    (b) =>
      b.finishedAt === undefined ||
      b.finishedAt === null ||
      Date.parse(b.finishedAt) <= Date.now() + FINISHED_AT_SKEW_MS,
    'finishedAt cannot be in the future.',
  );
export type PutShelfBody = z.infer<typeof putShelfBody>;

export const goalQuery = z.object({
  year: z.preprocess(blankIsAbsent, z.coerce.number().int().min(2000).max(2200).optional()),
});

/* -------------------------------- cursors --------------------------------- */

/** `c` pages the default order (createdAt, id descending); `u` pages `since` mode (updatedAt, id ascending). */
export type HighlightCursor = {
  mode: 'c' | 'u';
  at: Date;
  id: string;
};

const b64 = (s: string) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => {
  try {
    return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    return null;
  }
};

export function encodeHighlightCursor(c: HighlightCursor): string {
  return b64(`${c.mode}|${c.at.toISOString()}|${c.id}`);
}

export function decodeHighlightCursor(cursor: string): HighlightCursor | null {
  const raw = unb64(cursor);
  if (raw === null) return null;
  const parts = raw.split('|');
  if (parts.length !== 3) return null;
  const [mode, iso, id] = parts as [string, string, string];
  if (mode !== 'c' && mode !== 'u') return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime()) || id === '' || id.length > ID_MAX) return null;
  return { mode, at, id };
}
