/** Zod for /api/admin/api-keys (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import {
  ADMIN_CAP_MAX,
  ADMIN_CAP_MIN,
  API_KEY_STATUSES,
  SUSPEND_REASON_MAX,
  SUSPEND_REASON_MIN,
} from '@/lib/admin/api-keys';

/** Every list parameter is a single value: repeated parameters do not survive. */
export const apiKeysQuery = z.object({
  status: z.enum(API_KEY_STATUSES).optional(),
  /** `high` keeps the keys whose 4xx or 5xx rate over the window is above 20%. */
  errors: z.enum(['high']).optional(),
  /** An owner's handle, with or without the @. Never an e-mail address. */
  owner: z
    .string()
    .trim()
    .max(40)
    .regex(/^@?[A-Za-z0-9_.-]*$/)
    .optional(),
  cursor: z.string().max(80).optional(),
});

export const apiKeyPatchBody = z
  .object({
    /** `{ reason }` suspends; `null` lifts. */
    suspend: z
      .union([
        z.object({
          reason: z.string().trim().min(SUSPEND_REASON_MIN).max(SUSPEND_REASON_MAX),
        }),
        z.null(),
      ])
      .optional(),
    /** 1 to 600 a minute; `null` removes the cap. */
    adminRateLimitPerMinute: z.number().int().min(ADMIN_CAP_MIN).max(ADMIN_CAP_MAX).nullable().optional(),
  })
  .refine((b) => b.suspend !== undefined || b.adminRateLimitPerMinute !== undefined, {
    message: 'Nothing to change.',
  });
