/**
 * Poll lifecycle (sprint 04 #08) — the zod input schema for `/api/rmharks/$id/poll/extend`.
 * Split from `./poll-lifecycle` so client code that only draws a poll does not bring zod along.
 */
import { z } from 'zod';

export const extendPollSchema = z
  .object({
    // The numbers are spelled out rather than built from POLL_EXTEND_DAYS so the inferred type stays a literal union.
    days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
  })
  .strict();
