/** Zod schemas for theme voting (s07-07). Server-side only; client code imports types from the contract. */
import { z } from 'zod';
import {
  MAX_THEME_CANDIDATES,
  MAX_THEME_MARKS,
  THEME_TEXT_MAX,
} from './jam-themes';

/** A shortlist: bounds are re-checked by `validateCandidates` (it owns the member-facing reasons). */
export const candidatesSchema =
  z
    .array(
      z
        .string()
        .max(
          THEME_TEXT_MAX *
            2,
        ),
    )
    .max(
      MAX_THEME_CANDIDATES *
        2,
    );

export const setCandidatesSchema =
  z.object(
    {
      candidates:
        candidatesSchema,
    },
  );

export const castVotesSchema =
  z.object(
    {
      candidateIds:
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
          .max(
            MAX_THEME_MARKS +
              4,
          ),
    },
  );

/** The voting fields the admin create form adds (all optional: a jam without them is unchanged). */
export const jamThemeVotingFields =
  {
    themeVoting:
      z
        .boolean()
        .optional(),
    themeCandidates:
      candidatesSchema.optional(),
    themeVoteOpensAt:
      z.coerce
        .date()
        .optional(),
  };
