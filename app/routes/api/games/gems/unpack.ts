import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { unpackGemsApi } from '@/lib/cards/steam.contract';
import { unpackGemsBody } from '@/lib/cards/steam-schema';
import { unpackCards } from '@/lib/cards/gems.server';
import { gemsResponse } from '@/lib/cards/gems-api.server';

/** POST /api/games/gems/unpack — destroy cards you hold for gems. */
export const Route = createFileRoute('/api/games/gems/unpack')({
  server: {
    handlers: {
      POST: implement(
        unpackGemsApi,
        {
          rateLimit: 'write',
          body: unpackGemsBody,
        },
        ({ userId, body }) => gemsResponse(() => unpackCards({ userId, ...body })),
      ),
    },
  },
});
