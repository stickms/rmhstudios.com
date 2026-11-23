import { z } from 'zod';

// The same pattern as `SLUG_RE` in `read.server.ts`, restated so this module (and its tests) do not load Prisma.
const SLUG_RE = /^[a-z0-9-]{1,80}$/;

/** The body of `POST /api/medschools/me/ask` (server and contract types only; the contract imports the type). */
export const askBody = z.object({
  question: z
    .string()
    .trim()
    .min(3)
    .max(400)
    // NUL and other control characters (newline and tab are fine in a question).
    .refine((s) => !/[^\P{Cc}\n\r\t]/u.test(s), 'control characters'),
  /** The school page's panel pins its school; the route call still runs. */
  slug: z.string().regex(SLUG_RE).optional(),
});
export type AskBody = z.infer<typeof askBody>;
