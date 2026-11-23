import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { getNewsDiscussionApi, openNewsDiscussionApi } from '@/lib/news-wire/news-wire.contract';
import { ensureDiscussionPost, getDiscussionState } from '@/lib/news-wire/discussion.server';

const slug = z.string().min(1).max(200);

/**
 * /api/news/discussion — an RMH News article's comments and reposts (lib/news-wire/discussion.server.ts).
 *
 * GET is open to signed-out readers (the counts are public) and never makes anything. POST is signed-in only: it is
 * the first step of commenting on or reposting an article, and makes the article's discussion post if it has none.
 * Both read the viewer's own repost, so neither is micro-cached.
 */
export const route = apiRoute('/api/news/discussion', {
  GET: implement(
    getNewsDiscussionApi,
    { auth: 'optional', rateLimit: 'read', query: z.object({ slug }), microCache: false },
    async ({ query, userId }) => {
      const state = await getDiscussionState(query.slug, userId);
      if (!state) return Response.json({ error: 'Not found' }, { status: 404 });
      return state;
    },
  ),
  POST: implement(
    openNewsDiscussionApi,
    {
      rateLimit: { policy: 'write', scope: 'user', prefix: 'news-discussion', limit: 20, windowMs: 60_000 },
      body: z.object({ slug }),
    },
    async ({ body, userId }) => {
      const state = await ensureDiscussionPost(body.slug, userId);
      if (!state) return Response.json({ error: 'Not found' }, { status: 404 });
      return state;
    },
  ),
});
