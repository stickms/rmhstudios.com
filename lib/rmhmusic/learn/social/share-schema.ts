/**
 * Zod schemas for sharing a result (Phase 6 plan 1.4, `lib/music-social/share.contract.ts`). The
 * client names WHAT to share and whether to show its name; everything the link shows comes from
 * the stored row (`share.server.ts`).
 */
import { z } from 'zod';
import { isUtcDate } from '../sprint/generate';
import { SONG_ID_RE } from '../songs/catalog';

/** Body of `POST /api/rmhmusic/share`: a Daily date, or a song and mode; the name is opt-in. */
export const createShareBody =
  z.discriminatedUnion(
    'kind',
    [
      z.object(
        {
          kind: z.literal(
            'daily',
          ),
          date: z
            .string()
            .refine(
              isUtcDate,
              {
                message:
                  'Not a YYYY-MM-DD date',
              },
            ),
          showName:
            z
              .boolean()
              .default(
                false,
              ),
        },
      ),
      z.object(
        {
          kind: z.literal(
            'song',
          ),
          songId:
            z
              .string()
              .max(
                64,
              )
              .regex(
                SONG_ID_RE,
              ),
          mode: z.enum(
            [
              'wait',
              'play',
            ],
          ),
          showName:
            z
              .boolean()
              .default(
                false,
              ),
        },
      ),
    ],
  );

const dailyPayloadSchema =
  z.object(
    {
      v: z.literal(
        1,
      ),
      kind: z.literal(
        'daily',
      ),
      date: z.string(),
      score:
        z
          .number()
          .int(),
      stars:
        z
          .number()
          .int(),
      right:
        z
          .number()
          .int()
          .nullable(),
      played:
        z
          .number()
          .int(),
      skipped:
        z
          .number()
          .int(),
      avgMs:
        z
          .number()
          .int()
          .nullable(),
    },
  );

const songPayloadSchema =
  z.object(
    {
      v: z.literal(
        1,
      ),
      kind: z.literal(
        'song',
      ),
      songId:
        z.string(),
      mode: z.enum(
        [
          'wait',
          'play',
        ],
      ),
      version:
        z.enum(
          [
            'piano',
            'guitar',
            'voice',
          ],
        ),
      score:
        z
          .number()
          .int(),
      stars:
        z
          .number()
          .int(),
    },
  );

export const sharePayloadSchema =
  z.discriminatedUnion(
    'kind',
    [
      dailyPayloadSchema,
      songPayloadSchema,
    ],
  );

/** One of the learner's own links, as the share dialog and the Shared links list show it. */
export const shareSummarySchema =
  z.object(
    {
      /** The internal id: what "Stop sharing" names (the token is only in `path`). */
      id: z.string(),
      /** `/rmhmusic/r/<token>`; the client puts its own origin in front. */
      path: z.string(),
      payload:
        sharePayloadSchema,
      showName:
        z.boolean(),
      createdAt:
        z.string(),
      expiresAt:
        z.string(),
    },
  );

export const shareListRes =
  z.object(
    {
      shares:
        z.array(
          shareSummarySchema,
        ),
    },
  );

export const stopShareRes =
  z.object(
    {
      ok: z.literal(
        true,
      ),
      stopped:
        z
          .number()
          .int()
          .min(
            0,
          ),
    },
  );

/**
 * A shared result as its public page shows it (`GET /api/rmhmusic/r/$token`). One "gone" for every
 * reason a link cannot be seen; a live one carries the stored snapshot, the name and picture only
 * when the link shows them, and nothing else about the learner.
 */
export const sharedResultRes =
  z.discriminatedUnion(
    'state',
    [
      z.object(
        {
          state:
            z.literal(
              'gone',
            ),
        },
      ),
      z.object(
        {
          state:
            z.literal(
              'live',
            ),
          /** The share's id: what "Report" names (never the token). */
          id: z.string(),
          payload:
            sharePayloadSchema,
          name: z
            .string()
            .nullable(),
          image:
            z
              .string()
              .nullable(),
          /** A Daily result of today (UTC): a signed-in viewer is offered today's challenge. */
          today:
            z.boolean(),
        },
      ),
    ],
  );
