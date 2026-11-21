/**
 * Contract for submitting a ranked ballot (sprint 06 #19): `POST /api/rmharks/$id/vote` with `{ ranking }`.
 * The same route takes `{ optionId }` for plain and multi-select polls (`lib/feed/api/rmharks.$id.vote.server.ts`).
 * Client-safe: types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { rankedBallotSchema } from '@/lib/feed/ranked-poll-schema';

type RankedBallotBody =
  z.infer<
    typeof rankedBallotSchema
  >;

export interface RankedBallotResponse {
  success: true;
  /** The member's ballot as stored, option ids from rank 1. */
  myRanking: string[];
  /** Ballots cast; first preferences are all that is counted while the poll is open. */
  totalVotes: number;
  options: {
    id: string;
    voteCount: number;
  }[];
}

export const submitBallotApi =
  endpoint<{
    body: RankedBallotBody;
    res: RankedBallotResponse;
  }>()(
    {
      method:
        'POST',
      path: '/api/rmharks/$id/vote',
    },
  );
