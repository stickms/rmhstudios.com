/**
 * Profile identity extras — the zod schemas for `PUT /api/profile/plus`.
 * The rules they apply (limits, the IANA check) are in `./plus`, which the
 * profile renderers import and which must stay zod-free.
 */
import { z } from 'zod';

import { NOW_MAX, PRONOUNS_MAX, isValidTimeZone } from './plus';

/* -------------------------------------------------------------------------- */
/* P3 — pronouns                                                              */
/* -------------------------------------------------------------------------- */

/** Letters, numbers, spaces and the separators people actually write ("she/her", "they/them, he"). */
const PRONOUNS_RE = /^[\p{L}\p{M}\p{N} /,'’.-]+$/u;

export const pronounsSchema = z
  .string()
  .trim()
  .max(PRONOUNS_MAX)
  .refine((v) => v === '' || PRONOUNS_RE.test(v), 'Pronouns may only use letters, spaces and /');

/* -------------------------------------------------------------------------- */
/* P4 — timezone                                                              */
/* -------------------------------------------------------------------------- */

export const timezoneSchema = z
  .string()
  .trim()
  .max(64)
  .refine((v) => v === '' || isValidTimeZone(v), 'Unknown time zone');

/* -------------------------------------------------------------------------- */
/* P2 — /now                                                                  */
/* -------------------------------------------------------------------------- */

export const nowTextSchema = z.string().trim().max(NOW_MAX);

/* -------------------------------------------------------------------------- */
/* Settings write                                                             */
/* -------------------------------------------------------------------------- */

/** PUT body for `/api/profile/plus`. Each field is optional; an empty string clears it. */
export const plusUpdateSchema = z.object({
  pronouns: pronounsSchema.optional(),
  timezone: timezoneSchema.optional(),
  nowText: nowTextSchema.optional(),
  counterEnabled: z.boolean().optional(),
  /** Show the Skills module so members can endorse this profile (P8's opt-in). */
  endorsementsEnabled: z.boolean().optional(),
});
export type PlusUpdateInput = z.infer<typeof plusUpdateSchema>;
