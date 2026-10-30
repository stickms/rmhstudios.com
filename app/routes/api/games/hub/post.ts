import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { createPost } from '@/lib/games/hub.server';
import { hubResponse } from '@/lib/games/hub-api.server';

/** POST /api/games/hub/post — reply in a discussion. */
export const Route = createFileRoute('/api/games/hub/post')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({ threadId: z.string().min(1).max(64), body: z.string().max(10_000) }),
        },
        ({ userId, body }) => hubResponse(() => createPost({ userId, ...body })),
      ),
    },
  },
});
