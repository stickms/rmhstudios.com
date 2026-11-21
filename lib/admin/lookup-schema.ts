/** Zod for the lookup endpoint (server side; the client sees only the types, by `import type`). */
import { z } from 'zod';
import { MAX_LOOKUP_LENGTH } from '@/lib/admin/lookup';

export const lookupQuerySchema =
  z.object(
    {
      q: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          MAX_LOOKUP_LENGTH,
        ),
    },
  );
