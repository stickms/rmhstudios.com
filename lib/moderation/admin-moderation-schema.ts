/**
 * Zod bodies for the admin moderation endpoints. Server-side only in practice
 * (the contracts import these by `import type`, so no zod ships to the client).
 */
import { z } from 'zod';
import { MODERATABLE_TYPES } from '@/lib/moderation/content';
import { RESTRICTABLE_FEATURES } from '@/lib/moderation/restrictions';

const reason = z.string().trim().min(1, 'A reason is required').max(500);

export const restrictBody = z.object({
  feature: z.enum(RESTRICTABLE_FEATURES),
  reason,
  /** null = permanent. */
  durationDays: z.number().int().min(1).max(3650).nullable(),
});

export const moderateContentBody = z.object({
  entityType: z.enum(MODERATABLE_TYPES),
  entityId: z.string().min(1).max(64),
  action: z.enum(['remove', 'edit', 'restore']),
  reason,
  fields: z.record(z.string(), z.string().max(5000)).optional(),
  strike: z
    .object({ expiresDays: z.number().int().min(1).max(365).optional() })
    .optional(),
  restrict: z
    .object({
      feature: z.enum(RESTRICTABLE_FEATURES),
      durationDays: z.number().int().min(1).max(3650).nullable(),
    })
    .optional(),
});
