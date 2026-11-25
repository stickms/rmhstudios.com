import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { listStoriesApi } from '@/lib/reading/stories.contract';
import { storiesQuery } from '@/lib/reading/stories-schema';
import { listPublicStories } from '@/lib/reading/stories.server';

/**
 * The stories index (s13-12): public, stories with a published article, newest first. The same for every reader and
 * changed only when an editor links an article, so it takes the short shared-list window.
 */
export const route = apiRoute('/api/news/stories', {
  GET: implement(
    listStoriesApi,
    { auth: 'none', rateLimit: 'read', query: storiesQuery, cache: CACHE_POLICY.liveList },
    async ({ query }) => listPublicStories(query.cursor ?? null),
  ),
});
