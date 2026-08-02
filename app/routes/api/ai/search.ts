import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
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

export const Route = createFileRoute('/api/ai/search')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', body: schema, allowEmptyBody: true },
        async ({ request, body }) => {
          if (!isAITextConfigured())
            return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'ai-search' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const q = body.q.trim();

          // `assist` is on here: the user explicitly asked for a considered
          // answer, so spending the expansion call on a weak query is warranted.
          const results = await universalSearch({
            query: q,
            tab: 'top',
            viewerId: session.user.id,
            signedIn: true,
            assist: true,
          });

          const sources: AISearchSource[] = results.top.slice(0, MAX_SOURCES).map((hit) => ({
            kind: hit.kind,
            title: hit.title,
            snippet: (hit.snippet ?? hit.subtitle ?? '').slice(0, 240),
          }));

          if (sources.length === 0) {
            return Response.json({
              answer: `I couldn't find anything matching "${q}". Try a more specific search.`,
              sourceCount: 0,
              ...(results.meta.suggestion ? { suggestion: results.meta.suggestion } : {}),
            });
          }

          const answer = await answerSearch(q, sources);
          return Response.json({
            answer,
            sourceCount: sources.length,
            confidence: results.meta.confidence,
          });
        },
      ),
    },
  },
});
