import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { howToPlaySchema } from '@/lib/devplatform/how-to-play-schema';
import { howToPlayApi } from '@/lib/devplatform/how-to-play.contract';
import { aiAvailable, howToPlay } from '@/lib/devplatform/ai.server';

export const Route = createFileRoute('/api/games/how-to-play')({
  server: {
    handlers: {
      POST: implement(
        howToPlayApi,
        { rateLimit: 'ai', body: howToPlaySchema },
        async ({ body }) => {
          if (!aiAvailable())
            return Response.json({ error: 'AI is not available' }, { status: 503 });
          const answer = await howToPlay(body.gameId, body.question).catch(() => null);
          if (!answer)
            return Response.json({ error: 'No answer available right now' }, { status: 502 });
          return Response.json({ answer });
        },
      ),
    },
  },
});
