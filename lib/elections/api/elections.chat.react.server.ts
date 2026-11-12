import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { reactElectionChatApi } from '@/lib/elections/elections.contract';
import { resolveChannel } from '@/lib/elections/channel.server';
import { postReaction } from '@/lib/elections/chat.server';
import { isReaction } from '@/lib/elections/rooms';

const body = z.object({
  cycle: z.string().max(10),
  room: z.string().max(12).optional(),
  emoji: z.string().max(8),
});

/** POST /api/elections/chat/react — one tap of a reaction, broadcast to everyone in the room (signed in; 20 / 10 s). */
export const route = apiRoute('/api/elections/chat/react', {
  POST: implement(
    reactElectionChatApi,
    {
      rateLimit: { limit: 20, windowMs: 10_000, prefix: 'elections:react' },
      body,
      label: 'elections.react',
    },
    async ({ body: b }) => {
      // A closed vocabulary: anything that is not one of the offered emoji is rejected, not relayed.
      if (!isReaction(b.emoji))
        return Response.json({ error: 'Unknown reaction' }, { status: 422 });
      const channel = await resolveChannel({ cycle: b.cycle, room: b.room });
      if (!channel) return Response.json({ error: 'Unknown election or room' }, { status: 404 });
      postReaction(channel.key, b.emoji);
      return Response.json({ ok: true });
    },
  ),
});
