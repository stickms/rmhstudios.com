import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { createHubThreadApi } from '@/lib/cards/steam.contract';
import { createHubThreadBody } from '@/lib/cards/steam-schema';
import { createThread } from '@/lib/games/hub.server';
import { hubResponse } from '@/lib/games/hub-api.server';

/** POST /api/games/hub/thread — start a discussion in a title's Community Hub. */
export const Route = createFileRoute('/api/games/hub/thread')({
  server: {
    handlers: {
      POST: implement(
        createHubThreadApi,
        {
          rateLimit: 'write',
          body: createHubThreadBody,
        },
        ({ userId, body }) => hubResponse(() => createThread({ userId, ...body })),
      ),
    },
  },
});
