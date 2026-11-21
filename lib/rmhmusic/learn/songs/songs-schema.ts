/**
 * Zod schemas for the song results endpoints (`songs.contract.ts`). The shape checks live here;
 * the rules (one result per note, each possible, the recomputed score) are `scoring.ts`
 * `checkSongRun`, applied by `songs.server.ts`.
 */
import { z } from 'zod';
import { durationMsSchema } from '@/lib/rmhmusic/history-schema';
import { ZERO_MS } from '../scoring/timing';
import { isSongId } from './catalog';
import { MAX_WRONG } from './scoring';

/** More notes than any song has; the exact count is checked against the song. */
const MAX_NOTES = 400;

const songId =
  z
    .string()
    .max(
      64,
    )
    .refine(
      isSongId,
      {
        message:
          'Unknown song',
      },
    );
const mode =
  z.enum(
    [
      'wait',
      'play',
    ],
  );

const playNote =
  z.object(
    {
      outcome:
        z.enum(
          [
            'right',
            'wrong',
            'missed',
          ],
        ),
      offMs:
        z
          .number()
          .min(
            -ZERO_MS,
          )
          .max(
            ZERO_MS,
          )
          .nullable(),
    },
  );

export const songRunSchema =
  z.discriminatedUnion(
    'mode',
    [
      z.object(
        {
          mode: z.literal(
            'wait',
          ),
          wrong:
            z
              .array(
                z
                  .number()
                  .int()
                  .min(
                    0,
                  )
                  .max(
                    MAX_WRONG,
                  ),
              )
              .max(
                MAX_NOTES,
              )
              .readonly(),
        },
      ),
      z.object(
        {
          mode: z.literal(
            'play',
          ),
          notes:
            z
              .array(
                playNote,
              )
              .max(
                MAX_NOTES,
              )
              .readonly(),
          extras:
            z
              .number()
              .int()
              .min(
                0,
              )
              .max(
                4 *
                  MAX_NOTES,
              ),
        },
      ),
    ],
  );

/** Body of `POST /api/rmhmusic/songs/best`: one finished run of one song. */
export const songBestBody =
  z.object(
    {
      songId,
      run: songRunSchema,
      /** How long the run took, from the client's clock; recorded in the practice log. */
      durationMs:
        durationMsSchema,
    },
  );

const best =
  z.object(
    {
      songId:
        z.string(),
      mode,
      bestScore:
        z
          .number()
          .int()
          .min(
            0,
          )
          .max(
            100,
          ),
    },
  );

/** `GET /api/rmhmusic/songs`: the learner's best per song per mode. */
export const songBestsRes =
  z.object(
    {
      bests:
        z.array(
          best,
        ),
    },
  );

/** The run's recomputed score and the best now kept. */
export const songBestRes =
  z.object(
    {
      outcome:
        z.literal(
          'saved',
        ),
      best: best.extend(
        {
          score:
            z
              .number()
              .int()
              .min(
                0,
              )
              .max(
                100,
              ),
        },
      ),
    },
  );
