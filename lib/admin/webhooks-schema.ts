/** Zod for /api/admin/webhooks (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { DISABLE_REASON_MAX, DISABLE_REASON_MIN, WEBHOOK_CURSOR, WEBHOOK_FILTERS } from '@/lib/admin/webhooks';

/** Every list parameter is a single value: repeated parameters do not survive. */
export const webhooksQuery = z.object({
  filter: z.enum(WEBHOOK_FILTERS).optional(),
  /** An owner's handle, with or without the @. Never an e-mail address. */
  owner: z
    .string()
    .trim()
    .max(40)
    .regex(/^@?[A-Za-z0-9_.-]*$/)
    .optional(),
  /** A destination host (no scheme, no path), so a search cannot probe a token in a path. */
  host: z
    .string()
    .trim()
    .max(253)
    .regex(/^[^\s/?#@:]*$/)
    .optional(),
  cursor: z.string().regex(WEBHOOK_CURSOR).optional(),
});

/** `{ reason }` turns the endpoint off for its owner; `null` lifts the admin disable. */
export const webhookPatchBody = z.object({
  disable: z.union([
    z.object({
      reason: z.string().trim().min(DISABLE_REASON_MIN).max(DISABLE_REASON_MAX),
    }),
    z.null(),
  ]),
});
