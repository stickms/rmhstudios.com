import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { answerSearch, isAITextConfigured, type AISearchSource } from '@/lib/ai/text.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

/**
 * POST /api/ai/search — a natural-language answer over search results.
 *
 * Pulls the top matching posts, builds, and blog entries for the query (same
 * corpus the plain /api/search tab uses), then asks DeepSeek to summarise them
 * into a short grounded answer. This is the "ask, don't scroll" layer on top of
 * the existing keyword search — no embeddings or vector index required.
 */
const schema = z.object({ q: z.string().min(2).max(200) });

const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'what', 'who', 'how', 'why', 'when', 'where', 'with',
  'about', 'this', 'that', 'find', 'show', 'give', 'does', 'has', 'have', 'can',
]);

function extractTerms(q: string): string[] {
  return [
    ...new Set(
      q
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    ),
  ].slice(0, 6);
}

export const Route = createFileRoute('/api/ai/search')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAITextConfigured()) return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'ai-search' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });
          const q = parsed.data.q.trim();

          const terms = extractTerms(q);
          const hidden = await getHiddenAuthorIds(session.user.id);
          const orTerms = terms.length ? terms : [q];

          const [posts, builds, blog] = await Promise.all([
            prisma.rMHark.findMany({
              where: {
                deletedAt: null,
                audience: 'PUBLIC',
                unlockPrice: null,
                ...(hidden.length ? { userId: { notIn: hidden } } : {}),
                OR: orTerms.map((t) => ({ content: { contains: t, mode: 'insensitive' as const } })),
              },
              orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
              take: 24,
              select: { content: true, user: { select: { name: true, handle: true } } },
            }),
            prisma.userBuild.findMany({
              where: {
                visibility: 'PUBLIC',
                OR: orTerms.flatMap((t) => [
                  { title: { contains: t, mode: 'insensitive' as const } },
                  { description: { contains: t, mode: 'insensitive' as const } },
                ]),
              },
              orderBy: { publishedAt: 'desc' },
              take: 10,
              select: { title: true, description: true },
            }),
            prisma.blogPost.findMany({
              where: {
                OR: orTerms.flatMap((t) => [
                  { title: { contains: t, mode: 'insensitive' as const } },
                  { description: { contains: t, mode: 'insensitive' as const } },
                ]),
              },
              orderBy: { createdAt: 'desc' },
              take: 8,
              select: { title: true, description: true },
            }),
          ]);

          const sources: AISearchSource[] = [
            ...posts.map((p) => ({
              kind: 'post' as const,
              title: p.user?.name || p.user?.handle || 'user',
              snippet: p.content.slice(0, 240),
            })),
            ...builds.map((b) => ({ kind: 'build' as const, title: b.title, snippet: (b.description || '').slice(0, 240) })),
            ...blog.map((b) => ({ kind: 'blog' as const, title: b.title, snippet: (b.description || '').slice(0, 240) })),
          ];

          if (sources.length === 0) {
            return Response.json({ answer: `I couldn't find anything matching "${q}". Try a more specific search.`, sourceCount: 0 });
          }

          const answer = await answerSearch(q, sources);
          return Response.json({ answer, sourceCount: sources.length });
        } catch (error) {
          console.error('AI search error:', error);
          return Response.json({ error: 'Could not answer' }, { status: 500 });
        }
      },
    },
  },
});
