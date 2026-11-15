/**
 * Contracts for /api/events (redesign audit C1, batch 7). Client-safe: types
 * only, no zod. A refused call answers `{ error }` (409 full / canceled, 403
 * not a community mod) — read it with `serverError(e)`.
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { z } from 'zod';
import type { eventRecurrenceSchema } from '@/lib/calendar/schema';
import type {
  EventDTO,
  EventVenueKindValue,
  RsvpResult,
  RsvpStatus,
} from '@/lib/events.server';

/** Wire shape of the create body: dates are ISO strings, parsed with `z.coerce.date()` server-side. */
export interface CreateEventBody {
  title: string;
  description?:
    | string
    | undefined;
  communityId?:
    | string
    | undefined;
  startsAt: string;
  endsAt?:
    | string
    | undefined;
  venueKind: EventVenueKindValue;
  venueRef?:
    | string
    | undefined;
  capacity?:
    | number
    | undefined;
  recurrence?:
    | z.input<
        typeof eventRecurrenceSchema
      >
    | undefined;
}

/** Host an event (community events need a mod/owner role). 201 with the new event. */
export const createEventApi =
  endpoint<{
    body: CreateEventBody;
    res: {
      event: EventDTO;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/events',
    },
  );

/** RSVP going / maybe. 409 when the event is full or canceled. */
export const rsvpEventApi =
  endpoint<{
    body: {
      status: RsvpStatus;
      everyTime?:
        | boolean
        | undefined;
      occurrenceAt?:
        | string
        | undefined;
    };
    res: RsvpResult;
  }>()(
    {
      method:
        'POST',
      path: '/api/events/$id/rsvp',
    },
  );

/** Withdraw an RSVP. */
export const withdrawRsvpApi =
  endpoint<{
    query: {
      scope?:
        | 'occurrence'
        | 'all'
        | undefined;
      occurrenceAt?:
        | string
        | undefined;
    };
    res: RsvpResult;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/events/$id/rsvp',
    },
  );
