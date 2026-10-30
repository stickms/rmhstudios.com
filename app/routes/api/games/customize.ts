import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { saveLook } from '@/lib/games/showcase.server';

/** POST /api/games/customize — choose your profile background and avatar frame (only ones your badges unlocked). */
export const Route = createFileRoute('/api/games/customize')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            background: z.string().max(80).nullable(),
            frame: z.string().max(80).nullable(),
          }),
        },
        async ({ userId, body }) => Response.json(await saveLook(userId, body)),
      ),
    },
  },
});
