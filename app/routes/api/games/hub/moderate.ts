import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { moderateThread } from '@/lib/games/hub.server';
import { hubResponse } from '@/lib/games/hub-api.server';

/** POST /api/games/hub/moderate — admins lock, unlock, pin or unpin a thread. */
export const Route = createFileRoute('/api/games/hub/moderate')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'admin',
          rateLimit: 'write',
          body: z.object({
            threadId: z.string().min(1).max(64),
            action: z.enum(['lock', 'unlock', 'pin', 'unpin']),
          }),
        },
        ({ body }) =>
          hubResponse(async () => {
            await moderateThread(body);
            return { ok: true };
          }),
      ),
    },
  },
});
