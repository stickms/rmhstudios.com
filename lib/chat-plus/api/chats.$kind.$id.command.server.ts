import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { runChatCommandApi } from '@/lib/chat-plus/chat.contract';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { commandSchema, runChatCommand } from '@/lib/chat-plus/commands.server';

/**
 * POST /api/chats/$kind/$id/command — run a server-side slash command (M4):
 * /roll, /flip, /poll, /checklist, /tip. Client-only commands (/remind, /gif)
 * never reach here. The result message is created and broadcast by the server so
 * nothing others rely on (dice, a coin, a tip) is computed by the client.
 */
export const route = apiRoute('/api/chats/$kind/$id/command', {
  POST: implement(
    runChatCommandApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'chat-command' }, body: commandSchema },
    async ({ params, userId, session, body }) => {
      const access = await requireChat(params, userId, { write: true });
      if (access instanceof Response) return access;
      const res = await runChatCommand(access, body.text, session.user.name ?? 'Someone');
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json(
        { message: res.message.message, kind: res.message.kind },
        { status: 201 },
      );
    },
  ),
});
