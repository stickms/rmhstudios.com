/**
 * Ranked-choice polls (sprint 06 #19): the zod schemas. The ballot body for `POST /api/rmharks/$id/vote`, and the
 * rule a poll that asks to be ranked must satisfy (applied by the post-create schema).
 */
import { z } from 'zod';
import {
  rankedPollIssues,
  RANKED_MAX_OPTIONS,
} from '@/lib/feed/ranked-poll';
import { MAX_POLL_OPTIONS } from '@/lib/rmhark-limits';

/** `{ ranking }`: option ids, most preferred first; the server checks they are this poll's, unique and not gapped. */
export const rankedBallotSchema =
  z
    .object(
      {
        ranking:
          z
            .array(
              z
                .string()
                .min(
                  1,
                )
                .max(
                  64,
                ),
            )
            .min(
              1,
            )
            .max(
              RANKED_MAX_OPTIONS,
            ),
      },
    )
    .strict();

/** The one-option body of plain and multi-select polls. */
export const plainVoteSchema =
  z.object(
    {
      optionId:
        z
          .string()
          .min(
            1,
          )
          .max(
            64,
          ),
    },
  );

export const voteBodySchema =
  z.union(
    [
      rankedBallotSchema,
      plainVoteSchema,
    ],
  );

/** The poll-level rules for `ranked`, as a zod refinement over a poll object. */
export function refineRankedPoll<
  T extends
    {
      ranked?:
        | boolean
        | undefined;
      multiSelect?:
        | boolean
        | undefined;
      options: unknown[];
      durationHours?:
        | number
        | undefined;
    },
>(
  poll: T,
  ctx: z.RefinementCtx,
): void {
  // Only a ranked poll may carry more than the plain-poll limit.
  if (
    !poll.ranked &&
    poll
      .options
      .length >
      MAX_POLL_OPTIONS
  ) {
    ctx.addIssue(
      {
        code: 'custom',
        message: `Poll can have at most ${MAX_POLL_OPTIONS} options`,
        path: [
          'options',
        ],
      },
    );
  }
  for (const issue of rankedPollIssues(
    {
      ranked:
        poll.ranked,
      multiSelect:
        poll.multiSelect,
      optionCount:
        poll
          .options
          .length,
      durationHours:
        poll.durationHours,
    },
  )) {
    ctx.addIssue(
      {
        code: 'custom',
        message:
          issue ===
          'RANKED_MULTI_SELECT'
            ? 'A ranked poll cannot also be multiple choice'
            : issue ===
                'RANKED_OPTION_COUNT'
              ? 'A ranked poll needs 3 to 6 options'
              : 'A ranked poll needs an end time',
        path: [
          issue ===
          'RANKED_OPTION_COUNT'
            ? 'options'
            : issue ===
                'RANKED_NEEDS_END'
              ? 'durationHours'
              : 'multiSelect',
        ],
      },
    );
  }
}
