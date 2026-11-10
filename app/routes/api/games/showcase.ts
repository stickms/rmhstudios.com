import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { saveShowcaseApi } from '@/lib/cards/steam.contract';
import { saveShowcaseBody } from '@/lib/cards/steam-schema';
import { saveShowcase } from '@/lib/games/showcase.server';

/** POST /api/games/showcase — choose the achievements and badges featured on your profile. */
export const Route = createFileRoute('/api/games/showcase')({
  server: {
    handlers: {
      POST: implement(
        saveShowcaseApi,
        {
          rateLimit: 'write',
          body: saveShowcaseBody,
        },
        async ({ userId, body }) => Response.json(await saveShowcase(userId, body)),
      ),
    },
  },
});
