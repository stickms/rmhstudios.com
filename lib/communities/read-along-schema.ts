/** Client-safe request schemas for the read-along endpoints (shared by the routes and `read-along.contract.ts`). */
import { z } from 'zod';
import { isValidTimeZone } from '@/lib/calendar/tz';
import { LABEL_MAX, MAX_PARTS, MIN_PARTS, parseTime } from '@/lib/communities/read-along';

const partBody = z
  .object({
    label: z.string().trim().min(1).max(LABEL_MAX),
    startPage: z.number().int().min(1).max(100_000),
    endPage: z.number().int().min(1).max(100_000),
  })
  .strict();

const partsBody = z.array(partBody).min(MIN_PARTS).max(MAX_PARTS);

const dayBody = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date such as 2026-12-07');

/** Start a read-along: the book, when the first part may open, the weekly time and the (edited) parts. */
export const startReadAlongBody = z
  .object({
    docSlug: z.string().trim().min(1).max(200),
    startDay: dayBody,
    weekday: z.number().int().min(0).max(6),
    time: z.string().refine((v) => parseTime(v) !== null, 'Use a 24-hour time such as 09:00'),
    timeZone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    parts: partsBody,
  })
  .strict();

/** `{ parts }` replaces the parts before the first one opens; `{ action }` cancels, or resumes a paused read-along. */
export const updateReadAlongBody = z.union([
  z.object({ parts: partsBody }).strict(),
  z.object({ action: z.enum(['cancel', 'resume']) }).strict(),
]);

export const joinReadAlongBody = z.object({ notify: z.boolean().optional() }).strict();

/** The highest part the reader has finished (0 clears it). */
export const progressBody = z.object({ part: z.number().int().min(0).max(MAX_PARTS) }).strict();

export const booksQuery = z.object({ q: z.string().trim().max(100).optional() }).strict();

export const planQuery = z
  .object({
    doc: z.string().trim().min(1).max(200),
    parts: z.coerce.number().int().min(MIN_PARTS).max(MAX_PARTS).optional(),
    word: z.string().trim().min(1).max(20).optional(),
  })
  .strict();

export type StartReadAlongBody = z.infer<typeof startReadAlongBody>;
export type UpdateReadAlongBody = z.infer<typeof updateReadAlongBody>;
