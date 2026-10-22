/**
 * Birthdays (G1) — the zod schema for PUT /api/birthday. Split from
 * `./birthday`, which the profile badge and the settings page import.
 */
import { z } from 'zod';

import { isValidMonthDay } from './birthday';

export const birthdaySchema = z
  .object({ month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) })
  .refine(({ month, day }) => isValidMonthDay(month, day), { message: 'Not a real date' });

export type BirthdayInput = z.infer<typeof birthdaySchema>;
