/**
 * Handle rules as a zod schema, for the API routes and the server-side handle
 * picker. Split from `lib/handle.ts`, which client components import for the
 * constants and must therefore stay zod-free.
 */

import { z } from 'zod';

import { HANDLE_MAX_LENGTH, HANDLE_MIN_LENGTH, HANDLE_REGEX, RESERVED_HANDLES } from '@/lib/handle';

export const handleSchema = z
  .string()
  .min(HANDLE_MIN_LENGTH, 'Handle must be at least 3 characters')
  .max(HANDLE_MAX_LENGTH, 'Handle must be at most 20 characters')
  .regex(
    HANDLE_REGEX,
    'Handle must start with a letter and contain only lowercase letters, numbers, and underscores',
  )
  .refine((h) => !RESERVED_HANDLES.has(h), 'This handle is reserved');

/** True when `handle` satisfies every rule and is not reserved. */
export function isValidHandle(handle: string): boolean {
  return handleSchema.safeParse(handle).success;
}
