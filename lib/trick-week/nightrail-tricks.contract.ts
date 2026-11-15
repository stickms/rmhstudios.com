/**
 * Contracts for Nightrail's trick of the week (redesign audit C1, batch 10): this
 * week's entries, submitting a trick and voting. A submit the server cannot match to a
 * recorded high score answers 422 `{ error: 'score-not-recorded' }`. Client-safe.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { TricksPayload, voteTrickSchema } from '@/lib/trick-week/trick-week';
import type { submitTrickSchema } from '@features/nightrail/engine/trick-schema';

export const getNightrailTricksApi = endpoint<{ res: TricksPayload }>()({
  method: 'GET',
  path: '/api/nightrail/tricks',
});

/** `kept` is set when the member already had a bigger trick this week. */
export const submitNightrailTrickApi = endpoint<{
  body: z.infer<typeof submitTrickSchema>;
  res: { id: string; kept?: true };
}>()({ method: 'POST', path: '/api/nightrail/tricks' });

/** Voting the trick you already voted for withdraws it (`myVoteTrickId: null`). */
export const voteNightrailTrickApi = endpoint<{
  body: z.infer<typeof voteTrickSchema>;
  res: { myVoteTrickId: string | null };
}>()({ method: 'POST', path: '/api/nightrail/tricks/vote' });
