import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { saveShowcase } from '@/lib/games/showcase.server';

/** POST /api/games/showcase — choose the achievements and badges featured on your profile. */
export const Route = createFileRoute('/api/games/showcase')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({
            achievements: z.array(z.string().max(64)).max(12),
            badges: z.array(z.string().max(80)).max(12),
          }),
        },
        async ({ userId, body }) => Response.json(await saveShowcase(userId, body)),
      ),
    },
  },
});
