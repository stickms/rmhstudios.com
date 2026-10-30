import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { deletePost, deleteThread } from '@/lib/games/hub.server';
import { hubResponse } from '@/lib/games/hub-api.server';

/** POST /api/games/hub/delete — delete your own thread or reply (admins: anyone's). */
export const Route = createFileRoute('/api/games/hub/delete')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('thread'), id: z.string().min(1).max(64) }),
            z.object({ kind: z.literal('post'), id: z.string().min(1).max(64) }),
          ]),
        },
        ({ userId, isAdmin, body }) =>
          hubResponse(async () => {
            if (body.kind === 'thread') await deleteThread({ userId, isAdmin, threadId: body.id });
            else await deletePost({ userId, isAdmin, postId: body.id });
            return { ok: true };
          }),
      ),
    },
  },
});
