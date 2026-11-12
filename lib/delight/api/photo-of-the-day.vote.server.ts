import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { photoVoteSchema } from '@/lib/delight/schema';
import { castVote } from '@/lib/delight/photo.server';

/** POST /api/photo-of-the-day/vote { nominationId } — one vote per member per UTC day, never your own. */
export const route = apiRoute('/api/photo-of-the-day/vote', {
  POST: defineHandler({ rateLimit: 'write', body: photoVoteSchema }, async ({ userId, body }) => {
    const r = await castVote(userId, body.nominationId);
    if (r === 'ok') return Response.json({ ok: true });
    const map = {
      'not-found': [404, 'That photo is not on today’s board'],
      own: [400, 'You cannot vote for your own photo'],
      already: [409, 'You already voted today'],
    } as const;
    const [status, error] = map[r];
    return Response.json({ error }, { status });
  }),
});
