import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { pollVoteSchema, voteDmPoll } from '@/lib/chat-plus/polls.server';

/**
 * POST /api/chats/dm/$id/vote — vote on a `/poll` posted in a DM. (Group polls
 * keep their existing route, `/api/group-chats/$id/messages/$messageId/vote`.)
 */
export const Route = createFileRoute('/api/chats/$kind/$id/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'chat-poll-vote' },
          body: pollVoteSchema,
        },
        async ({ params, userId, body }) => {
          const access = await requireChat(params, userId, { write: true });
          if (access instanceof Response) return access;
          const res = await voteDmPoll(access, body.messageId, body.optionIdx);
          if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
          return Response.json({ poll: res.poll });
        },
      ),
    },
  },
});
