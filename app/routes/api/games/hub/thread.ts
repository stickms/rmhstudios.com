import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createThread } from '@/lib/games/hub.server';
import { hubResponse } from '@/lib/games/hub-api.server';

/** POST /api/games/hub/thread — start a discussion in a title's Community Hub. */
export const Route = createFileRoute('/api/games/hub/thread')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            gameId: z.string().min(1).max(64),
            title: z.string().max(400),
            body: z.string().max(20_000),
          }),
        },
        ({ userId, body }) => hubResponse(() => createThread({ userId, ...body })),
      ),
    },
  },
});
