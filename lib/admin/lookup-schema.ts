/** Zod for the lookup endpoint (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { MAX_BATCH_ITEMS, MAX_LOOKUP_LENGTH, normaliseBatchItems } from '@/lib/admin/lookup';

export const lookupQuerySchema = z.object({
  q: z.string().trim().min(1).max(MAX_LOOKUP_LENGTH),
});

/** 1 to 50 items; blank ones drop and repeats collapse, order kept. */
export const lookupBatchSchema = z.object({
  items: z
    .array(z.string().max(MAX_LOOKUP_LENGTH))
    .max(MAX_BATCH_ITEMS)
    .transform(normaliseBatchItems)
    .refine((items) => items.length > 0),
});
