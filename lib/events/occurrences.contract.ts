/**
 * Contracts for skipping or moving one date of a repeating event (client-safe; types only). A refused
 * call answers `{ error, code }`; read the code with `errorField(e, 'code')`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { UpcomingDateDTO } from '@/lib/events/occurrences';
import type {
  restoreOccurrenceQuery,
  setOccurrenceBody,
} from '@/lib/events/occurrences-schema';

export interface OccurrencesRes {
  upcoming: UpcomingDateDTO[];
  /**
   * The caller's view of the date the card now leads with (the first one not skipped): the card's counts
   * and the viewer's answer belong to the date it shows, which a skip or move can change.
   */
  summary?: {
    occurrenceAt: string;
    goingCount: number;
    maybeCount: number;
    viewerRsvp: 'going' | 'maybe' | null;
  } | null;
}

/** Skip a date, or move it; replaces any earlier change of that date. Host, co-host or admin. */
export const setOccurrenceApi =
  endpoint<{
    body: z.infer<
      typeof setOccurrenceBody
    >;
    res: OccurrencesRes;
  }>()(
    {
      method:
        'PUT',
      path: '/api/events/$id/occurrences',
    },
  );

/** Bring a skipped or moved date back. Host, co-host or admin. */
export const restoreOccurrenceApi =
  endpoint<{
    query: z.infer<
      typeof restoreOccurrenceQuery
    >;
    res: OccurrencesRes;
  }>()(
    {
      method:
        'DELETE',
      path: '/api/events/$id/occurrences',
    },
  );
