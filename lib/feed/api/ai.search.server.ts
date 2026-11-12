import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { aiSearchApi } from '@/lib/feed/compose-assist.contract';
import { z } from 'zod';
import { answerSearch, isAITextConfigured, type AISearchSource } from '@/lib/ai/text.server';
import { universalSearch } from '@/lib/search/universal.server';

/**
 * POST /api/ai/search — a natural-language answer over search results.
 *
 * Grounded in exactly what the search tabs return: it runs the same
 * `universalSearch` pass (people, posts, builds, blog, news, library, games,
 * apps, pages), then asks DeepSeek to summarise the top hits. The model reads
 * results; it never retrieves them. No embeddings or vector index involved.
 *
 * This route used to run its own keyword `contains` query, so the AI answer was
 * drawn from a different — and worse — result set than the list beneath it.
 */
const schema = z.object({ q: z.string().min(2).max(200) });

/** Hits handed to the model. Enough for coverage, small enough to stay cheap. */
const MAX_SOURCES = 30;

export const route = apiRoute('/api/ai/search', {
  POST: implement(
    aiSearchApi,
    {
      rateLimit: { limit: 15, windowMs: 60_000, prefix: 'ai-search' },
      body: schema,
      allowEmptyBody: true,
    },
    async ({ userId, body }) => {
      if (!isAITextConfigured())
        return Response.json({ error: 'AI is unavailable' }, { status: 503 });

      const q = body.q.trim();

      // `assist` is on here: the user explicitly asked for a considered
      // answer, so spending the expansion call on a weak query is warranted.
      const results = await universalSearch({
        query: q,
        tab: 'top',
        viewerId: userId,
        signedIn: true,
        assist: true,
      });

      const sources: AISearchSource[] = results.top.slice(0, MAX_SOURCES).map((hit) => ({
        kind: hit.kind,
        title: hit.title,
        snippet: (hit.snippet ?? hit.subtitle ?? '').slice(0, 240),
      }));

      if (sources.length === 0) {
        return {
          answer: `I couldn't find anything matching "${q}". Try a more specific search.`,
          sourceCount: 0,
          ...(results.meta.suggestion ? { suggestion: results.meta.suggestion } : {}),
        };
      }

      const answer = await answerSearch(q, sources);
      return {
        answer,
        sourceCount: sources.length,
        confidence: results.meta.confidence,
      };
    },
  ),
});
