import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteAwayApi, getAwayApi, putAwayApi } from '@/lib/messages/away.contract';
import { putAwayBody } from '@/lib/messages/away-schema';
import { autoRepliedChatIds, clearAway, getAway, setAway } from '@/lib/messages/away.server';

/**
 * GET    /api/messages/away - the caller's own away message and the chats it has answered this period.
 * PUT    /api/messages/away - set or change it (text, days in the caller's time zone, profile line).
 * DELETE /api/messages/away - turn it off.
 * Session only; only the caller's own row.
 */
export const route = apiRoute('/api/messages/away', {
  GET: implement(getAwayApi, { rateLimit: 'read' }, async ({ userId }) => {
    const away = await getAway(userId);
    return { away, autoRepliedChatIds: away ? await autoRepliedChatIds(away.id) : [] };
  }),
  PUT: implement(putAwayApi, { rateLimit: 'write', body: putAwayBody }, async ({ userId, body }) => {
    const result = await setAway(userId, body);
    if (!result.ok) return Response.json({ error: 'Invalid away window', code: result.code }, { status: 400 });
    return { away: result.away };
  }),
  DELETE: implement(deleteAwayApi, { rateLimit: 'write' }, async ({ userId }) => {
    await clearAway(userId);
    return { success: true as const };
  }),
});
