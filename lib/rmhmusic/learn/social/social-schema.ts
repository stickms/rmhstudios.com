/**
 * Zod schemas for RMH Music's social endpoints (Phase 6, `social.contract.ts`). The rules the
 * server applies live in `prefs.server.ts` and `board.server.ts`; the pure ones in `prefs.ts` and
 * `board.ts`.
 */
import { z } from 'zod';
import { isUtcDate } from '../sprint/generate';
import { UNRANKED_REASONS } from '../sprint/plausible';

/** The learner's two switches (`GET` and `PUT /api/rmhmusic/social`). */
export const musicSocialRes =
  z.object(
    {
      board:
        z.boolean(),
      friends:
        z.boolean(),
    },
  );

/** Body of `PUT /api/rmhmusic/social`: either switch, at least one. */
export const musicSocialBody =
  z
    .object(
      {
        board:
          z
            .boolean()
            .optional(),
        friends:
          z
            .boolean()
            .optional(),
      },
    )
    .refine(
      (
        b,
      ) =>
        b.board !==
          undefined ||
        b.friends !==
          undefined,
      {
        message:
          'Nothing to change',
      },
    );

export const BOARD_SCOPES =
  [
    'everyone',
    'friends',
  ] as const;

/** Query of `GET /api/rmhmusic/sprint/board`: a date (today or yesterday, checked by the handler). */
export const boardQuery =
  z.object(
    {
      date: z
        .string()
        .refine(
          isUtcDate,
          {
            message:
              'Not a YYYY-MM-DD date',
          },
        ),
      scope:
        z
          .enum(
            BOARD_SCOPES,
          )
          .default(
            'everyone',
          ),
    },
  );

/** One row as a viewer sees it: a name and an avatar, the score, nothing else about the learner. */
export const boardRowSchema =
  z.object(
    {
      rank: z
        .number()
        .int()
        .min(
          1,
        ),
      /** The `MusicSprintDaily` id, what "Report score" names. */
      rowId:
        z.string(),
      user: z.object(
        {
          id: z.string(),
          name: z
            .string()
            .nullable(),
          image:
            z
              .string()
              .nullable(),
        },
      ),
      score:
        z
          .number()
          .int(),
      avgMs:
        z
          .number()
          .int()
          .nullable(),
      /** The run skipped the chord prompts (microphone or voice). */
      withoutChords:
        z.boolean(),
      you: z.boolean(),
    },
  );

/** The viewer's own line (`board.ts` `BoardMe`). */
export const boardMeSchema =
  z.discriminatedUnion(
    'state',
    [
      z.object(
        {
          state:
            z.literal(
              'not-played',
            ),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'started',
            ),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'ranked',
            ),
          rank: z
            .number()
            .int(),
          total:
            z
              .number()
              .int(),
          score:
            z
              .number()
              .int(),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'private',
            ),
          rank: z
            .number()
            .int(),
          total:
            z
              .number()
              .int(),
          score:
            z
              .number()
              .int(),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'unranked',
            ),
          reason:
            z.enum(
              UNRANKED_REASONS,
            ),
          score:
            z
              .number()
              .int(),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'hidden',
            ),
          score:
            z
              .number()
              .int(),
        },
      ),
    ],
  );

export const boardRes =
  z.object(
    {
      date: z.string(),
      /** Yesterday's board once the save grace window has passed: it can no longer change. */
      final:
        z.boolean(),
      /** Rows on this board (before blocks hide any from this viewer). */
      total:
        z
          .number()
          .int()
          .min(
            0,
          ),
      rows: z.array(
        boardRowSchema,
      ),
      around:
        z
          .array(
            boardRowSchema,
          )
          .nullable(),
      me: boardMeSchema,
      /** The Friends tab asked for while the viewer's own friends switch is off. */
      friendsOff:
        z
          .literal(
            true,
          )
          .optional(),
    },
  );
