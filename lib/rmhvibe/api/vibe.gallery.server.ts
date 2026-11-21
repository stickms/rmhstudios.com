import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { vibeGalleryApi } from '@/lib/rmhvibe/vibe-page.contract';
import { vibeGalleryQuerySchema } from '@/lib/rmhvibe/vibe-schema';
import { listVibePages } from '@/lib/rmhvibe/vibe.server';

/** GET /api/vibe/gallery — ready pages, searchable and paged by cursor (the Discord Activity's browse view). Public. */
export const route = apiRoute('/api/vibe/gallery', {
  GET: implement(
    vibeGalleryApi,
    {
      auth: 'none',
      rateLimit: 'read',
      query: vibeGalleryQuerySchema,
      cache: CACHE_POLICY.liveList,
    },
    ({ query }) => listVibePages(query),
  ),
});
