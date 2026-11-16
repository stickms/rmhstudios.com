/**
 * Zod schemas for friends' progress (`GET /api/rmhmusic/friends`, Phase 6 plan 1.5). The response
 * schema is also the server's last filter: an object schema drops any key it does not name, so a
 * friend's id, handle, e-mail, instrument, input or latency can never reach a viewer.
 */
import { z } from 'zod';
import { FRIENDS_LIMITS } from './friends';

/** `?limit=3` (the home's section) or `?limit=100` (the Friends page). */
export const friendsQuery =
  z.object(
    {
      limit:
        z.coerce
          .number()
          .int()
          .refine(
            (
              n,
            ) =>
              (
                FRIENDS_LIMITS as readonly number[]
              ).includes(
                n,
              ),
            {
              message:
                'limit is 3 or 100',
            },
          )
          .default(
            100,
          ),
    },
  );

export const friendProgressSchema =
  z.object(
    {
      /** Who: a display name and an avatar, nothing that identifies the account. */
      user: z.object(
        {
          name: z
            .string()
            .nullable(),
          image:
            z
              .string()
              .nullable(),
        },
      ),
      daily:
        z.object(
          {
            streak:
              z
                .number()
                .int()
                .min(
                  0,
                ),
            today:
              z.boolean(),
          },
        ),
      units:
        z.object(
          {
            finished:
              z
                .number()
                .int()
                .min(
                  0,
                ),
            total:
              z
                .number()
                .int()
                .min(
                  0,
                ),
            last: z
              .string()
              .nullable(),
          },
        ),
      songs:
        z.array(
          z.object(
            {
              songId:
                z.string(),
              title:
                z.string(),
              composer:
                z.string(),
              mode: z.enum(
                [
                  'wait',
                  'play',
                ],
              ),
              bestScore:
                z
                  .number()
                  .int(),
            },
          ),
        ),
    },
  );

export const friendsRes =
  z.object(
    {
      /** The viewer's own friends switch: off, the list is empty (no one-sided watching). */
      optedIn:
        z.boolean(),
      /** Friends who share, before the limit. */
      total:
        z
          .number()
          .int()
          .min(
            0,
          ),
      friends:
        z.array(
          friendProgressSchema,
        ),
    },
  );
