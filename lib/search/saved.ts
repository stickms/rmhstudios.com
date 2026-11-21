/** Universal search — saved-search client-safe zod + types (§18). */
import { z } from 'zod';

export const MAX_SAVED_SEARCHES = 25;

export const savedSearchCreateSchema = z.object({
  query: z.string().trim().min(1).max(200),
  types: z.array(z.string().max(24)).max(12).optional(),
  alerts: z.boolean().optional(),
});

export const savedSearchUpdateSchema = z.object({
  alerts: z.boolean().optional(),
});

export interface SavedSearchView {
  id: string;
  query: string;
  types: string[];
  alerts: boolean;
  createdAt: string;
}
