/** Request schema for POST /api/moments. Client-safe. */
import { z } from 'zod';

export const createMomentSchema =
  z.object(
    {
      kind: z
        .string()
        .min(
          1,
        )
        .max(
          24,
        ),
      payload:
        z
          .object(
            {
              value:
                z
                  .string()
                  .min(
                    1,
                  )
                  .max(
                    60,
                  ),
              title:
                z
                  .string()
                  .max(
                    80,
                  )
                  .optional(),
              subtitle:
                z
                  .string()
                  .max(
                    120,
                  )
                  .optional(),
            },
          )
          .passthrough(),
    },
  );
