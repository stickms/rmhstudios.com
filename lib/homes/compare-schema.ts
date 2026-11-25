/**
 * Request schemas for the saved-home note and comparison endpoints (s12 10). Server-side zod; the contract takes the
 * types with `import type`, so none of this ships to a page.
 */
import { z } from 'zod';
import { NOTE_MAX, noteFits } from './compare';

/** A note. The empty string clears it. Length counts characters, not UTF-16 units. */
export const favoriteNoteBody = z.object({
  note: z
    .string()
    .max(NOTE_MAX * 4)
    .refine(noteFits),
});

/**
 * `?ids=a,b,c`: one comma-separated parameter (repeated parameters do not survive). Only the shape is checked
 * here; the handler counts the distinct ids so it can answer a fifth with the refusal code.
 */
export const compareQuery = z.object({
  ids: z
    .string()
    .max(1000)
    .regex(/^[A-Za-z0-9_,\s-]*$/),
});
