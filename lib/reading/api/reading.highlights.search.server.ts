import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { searchHighlightsApi } from '@/lib/reading/highlights.contract';
import { highlightsSearchQuery } from '@/lib/reading/highlights-search-schema';
import { searchHighlights } from '@/lib/reading/highlights.server';

/**
 * GET /api/reading/highlights/search — the notebook's list: the caller's highlights
 * narrowed by text (highlight and note), document type, "has a note" and
 * public/private, in the chosen order. Owner-only; paginated by `cursor`.
 */
export const route = apiRoute('/api/reading/highlights/search', {
  GET: implement(
    searchHighlightsApi,
    {
      rateLimit: 'read',
      query: highlightsSearchQuery,
    },
    async ({ userId, query }) => {
      const { cursor, hasNote, ...rest } = query;
      return searchHighlights(
        userId,
        {
          ...rest,
          ...(hasNote
            ? {
                hasNote: true,
              }
            : {}),
        },
        cursor ?? null,
      );
    },
  ),
});
