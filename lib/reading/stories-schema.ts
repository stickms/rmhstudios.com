/** Query schema for `GET /api/news/stories` (s13-12). Server-side only: the client imports the contract's types. */
import { z } from 'zod';

export const storiesQuery = z.object({
  cursor: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}\|[A-Za-z0-9._-]{1,200}$/)
    .optional(),
});
