import { z } from 'zod';
import {
  ADJUSTMENT_MAX,
  ADJUSTMENT_MIN,
  ADJUSTMENT_NOTE_MAX,
  ADJUSTMENT_REASONS,
  confirmationSatisfied,
  noteSatisfied,
} from '@/lib/economy/adjustments';

/**
 * Body of `POST /api/admin/users/$id/coins`. `amount` is a positive integer; the
 * direction carries the sign. `key` is the idempotency token the dialog makes
 * once per form and resends on a retry.
 */
export const adjustBody = z
  .object({
    direction: z.enum(['add', 'remove']),
    amount: z.number().int().min(ADJUSTMENT_MIN).max(ADJUSTMENT_MAX),
    reason: z.enum(ADJUSTMENT_REASONS),
    note: z.string().trim().max(ADJUSTMENT_NOTE_MAX).optional(),
    /** The amount typed a second time; required above the confirmation threshold. */
    confirmAmount: z.number().int().optional(),
    key: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  })
  .refine((b) => noteSatisfied(b.reason, b.note), { message: 'A correction needs a note', path: ['note'] })
  .refine((b) => confirmationSatisfied(b.amount, b.confirmAmount), {
    message: 'Type the amount again to confirm',
    path: ['confirmAmount'],
  });

/** Dynamic path parameters, validated before they reach a query. */
export const idParam = z.string().min(1).max(64);
