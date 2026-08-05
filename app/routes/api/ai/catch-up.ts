import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { catchUp } from '@/lib/ai/catch-up.server';

/**
 * POST /api/ai/catch-up — "what did I miss?" for a DM, group chat, or Space (A6).
 *
 * Thin by design: every permission decision lives in `lib/ai/catch-up.server`,
 * next to the reads it guards, so this file cannot drift from it. The route's
 * only jobs are shape validation and turning a typed error into a status.
 *
 * `auth` is left at its default (`'required'`) — a catch-up is by definition
 * scoped to a specific reader's view of a conversation, so there is no coherent
 * anonymous version of this request.
 */

/**
 * Ids on this platform are cuids (`c` + base36) with a UUID minority on newer
 * tables. Bounded and character-restricted so a malformed id is a 400 here
 * rather than a Prisma error deeper in.
 */
const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

const schema = z.object({
  kind: z.enum(['thread', 'group-chat', 'space']),
  id: idSchema,
  /**
   * Epoch ms. Optional because the common case — opening a conversation after
   * a while — has no client-side notion of "since", and the server's cap on
   * message count already bounds the work.
   */
  sinceMs: z.number().int().positive().optional(),
});

export const Route = createFileRoute('/api/ai/catch-up')({
  server: {
    handlers: {
      POST: defineHandler({ rateLimit: 'ai', body: schema }, async ({ userId, body }) => {
        const result = await catchUp({
          kind: body.kind,
          id: body.id,
          userId,
          sinceMs: body.sinceMs,
        });
        return Response.json(result);
      }),
    },
  },
});
