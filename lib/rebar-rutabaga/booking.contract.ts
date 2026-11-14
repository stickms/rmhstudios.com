/**
 * Contracts for the Rebar och Rutabaga reservation book (redesign audit C1, batch 10).
 * A refused booking is `{ error, detail: { reason } }` with `reason` `already-booked` or
 * `full`; read it with `errorField(e, 'detail')`. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  bookSchema,
  cancelSchema,
} from '@/lib/rebar-rutabaga/booking-schema';
import type {
  Availability,
  BookingResult,
} from '@/lib/rebar-rutabaga/booking.server';

/** The open month's nights with seats left, and the caller's own tables when signed in. */
export const getRebarAvailabilityApi =
  endpoint<{
    res: {
      availability: Availability;
      mine: BookingResult[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/services/rebar-reservations',
    },
  );

export const bookRebarTableApi =
  endpoint<{
    body: z.infer<
      typeof bookSchema
    >;
    res: BookingResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/services/rebar-reservations',
    },
  );

export const cancelRebarTableApi =
  endpoint<{
    body: z.infer<
      typeof cancelSchema
    >;
    res: {
      cancelled: boolean;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/services/rebar-reservations',
    },
  );
