/**
 * Roommate compatibility (F9) — the zod schema for PUT /api/homes/roommate.
 * Split from `./roommate`, which the listing page's match card imports.
 */
import { z } from 'zod';

import { PET_CHOICES } from './roommate';

export const roommateProfileSchema = z.object({
  sleep: z.number().int().min(1).max(5),
  guests: z.number().int().min(1).max(5),
  cleanliness: z.number().int().min(1).max(5),
  noise: z.number().int().min(1).max(5),
  pets: z.enum(PET_CHOICES),
});

export type RoommateProfile = z.infer<typeof roommateProfileSchema>;
