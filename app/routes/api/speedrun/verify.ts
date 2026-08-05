/**
 * `/api/speedrun/verify` — the review queue (design K1).
 *
 * GET lists what is waiting. POST either drains the queue through the verifier
 * again (`{ action: 'drain' }` — the worker pass, on demand until it is wired
 * into `server/jobs`) or records a human verdict on one run.
 *
 * Admin-only: the manual queue exists for the runs automation cannot settle, and
 * the value of a verdict is entirely in who is allowed to give one.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  getPendingQueue,
  reverifyPending,
  reviewEntry,
  SpeedrunError,
} from '@/lib/speedrun/speedrun.server';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const bodySchema = z.union([
  z.object({
    action: z.literal('drain'),
    limit: z.number().int().min(1).max(200).optional(),
  }),
  z.object({
    action: z.literal('review'),
    entryId: z.string().min(1).max(64),
    status: z.enum(['verified', 'rejected']),
    reason: z.string().max(200).optional(),
  }),
]);

export const Route = createFileRoute('/api/speedrun/verify')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: querySchema },
        async ({ query }) => Response.json({ pending: await getPendingQueue(query.limit) }),
      ),

      POST: defineHandler(
        { auth: 'admin', rateLimit: 'write', body: bodySchema },
        async ({ body }) => {
          if (body.action === 'drain') {
            return Response.json({ result: await reverifyPending(body.limit) });
          }
          try {
            const entry = await reviewEntry(body);
            return Response.json({ entry });
          } catch (error) {
            if (error instanceof SpeedrunError && error.code === 'ENTRY_NOT_FOUND') {
              return Response.json({ error: 'No such run.' }, { status: 404 });
            }
            throw error;
          }
        },
      ),
    },
  },
});
