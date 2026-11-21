import { z } from 'zod';
import { SITE_SHORTCUTS } from '@/lib/shortcuts/registry';
import {
  MAX_OVERRIDES,
  MAX_SEQUENCE_STEPS,
  isValidKeystroke,
  validateOverrides,
} from '@/lib/shortcuts/bindings';

/**
 * Body of `PUT /api/preferences/keyboard`: the full keyboard preferences. Ids
 * must be site shortcuts and every sequence must pass the key grammar, avoid the
 * reserved combinations and not collide with another shortcut's keys.
 */
export const keyboardPrefsSchema = z
  .object({
    singleKeys: z.enum(['on', 'off', 'alt']),
    overrides: z.record(
      z.string().max(64),
      z
        .array(z.string().refine(isValidKeystroke, 'Not a valid key'))
        .min(1)
        .max(MAX_SEQUENCE_STEPS),
    ),
  })
  .superRefine((value, ctx) => {
    if (Object.keys(value.overrides).length > MAX_OVERRIDES) {
      ctx.addIssue({
        code: 'custom',
        message: `At most ${MAX_OVERRIDES} overrides`,
        path: ['overrides'],
      });
      return;
    }
    const result = validateOverrides(value.overrides, SITE_SHORTCUTS);
    if (!result.ok) {
      ctx.addIssue({
        code: 'custom',
        message: `Invalid shortcut (${result.error.reason})`,
        path: ['overrides', result.id],
      });
    }
  });

export type KeyboardPrefsInput = z.infer<typeof keyboardPrefsSchema>;
