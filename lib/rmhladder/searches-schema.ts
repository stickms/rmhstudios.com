/** Client-safe request shape for /api/rmhladder/searches (the route and its contract share it). */
import { z } from 'zod';

export const savedSearchFilters = z.object({
  preset: z.enum(['new', 'finance', 'consulting', 'tech', 'expiring', 'remote']).optional(),
  q: z.string().max(200).optional(),
  cities: z.array(z.string().max(100)).max(50).optional(),
  programTypes: z
    .array(
      z.enum([
        'internship',
        'summer_analyst',
        'summer_associate',
        'analyst_program',
        'rotational_program',
        'new_grad',
        'leadership_development',
        'entry_level',
        'mba',
        'other',
      ]),
    )
    .max(10)
    .optional(),
  sort: z.enum(['relevance', 'posted', 'deadline']).optional(),
});

export const saveSearchBody = z.object({
  id: z.string().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(100),
  filters: savedSearchFilters,
  alertsOn: z.boolean().default(true),
});

export const deleteSearchQuery = z.object({ id: z.string().min(1) });
