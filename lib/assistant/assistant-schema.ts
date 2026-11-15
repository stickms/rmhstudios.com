/** Request schema for POST /api/assistant. Client-safe. */
import { z } from 'zod';

export const assistantAskSchema =
  z.object(
    {
      question:
        z
          .string()
          .min(
            1,
          )
          .max(
            500,
          ),
      history:
        z
          .array(
            z.object(
              {
                role: z.enum(
                  [
                    'user',
                    'assistant',
                  ],
                ),
                content:
                  z
                    .string()
                    .max(
                      2000,
                    ),
              },
            ),
          )
          .max(
            20,
          )
          .optional(),
    },
  );
