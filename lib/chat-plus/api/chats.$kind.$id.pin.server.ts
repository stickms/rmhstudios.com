import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { setChatPinApi } from '@/lib/chat-plus/chat.contract';
import { requireChat } from '@/lib/chat-plus/route-helpers.server';
import { setPin } from '@/lib/chat-plus/pins.server';

const schema = z.object({ messageId: z.string().min(1).max(40), pinned: z.boolean() });

/** POST /api/chats/$kind/$id/pin — pin or unpin a message (M6). Any participant. */
export const route = apiRoute('/api/chats/$kind/$id/pin', {
  POST: implement(
    setChatPinApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'chat-pin' }, body: schema },
    async ({ params, userId, body }) => {
      const access = await requireChat(params, userId, { write: true });
      if (access instanceof Response) return access;
      const res = await setPin(access, body.messageId, body.pinned);
      if (!res.ok) return Response.json({ error: res.error }, { status: res.status });
      return Response.json({ success: true });
    },
  ),
});
