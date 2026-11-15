/** Request schemas for /api/services/rebar-reservations. Client-safe. */
import { z } from 'zod';
import { MAX_PARTY_SIZE } from '@/lib/rebar-rutabaga/booking';

export const bookSchema =
  z.object(
    {
      serviceDate:
        z
          .string()
          .length(
            10,
          ),
      seating:
        z
          .string()
          .max(
            5,
          ),
      partySize:
        z
          .number()
          .int()
          .min(
            1,
          )
          .max(
            MAX_PARTY_SIZE,
          ),
      name: z
        .string()
        .trim()
        .min(
          1,
        )
        .max(
          80,
        ),
      email:
        z
          .string()
          .trim()
          .email()
          .max(
            160,
          ),
      note: z
        .string()
        .trim()
        .max(
          500,
        )
        .optional(),
    },
  );

export const cancelSchema =
  z.object(
    {
      id: z
        .string()
        .min(
          1,
        )
        .max(
          40,
        ),
    },
  );
