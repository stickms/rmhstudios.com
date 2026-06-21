import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { askFeed, isAITextConfigured } from '@/lib/ai/text.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';

/** POST /api/ai/ask-feed — answer a question grounded in recent feed posts. */
const schema = z.object({ question: z.string().min(3).max(300) });

const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'what', 'who', 'how', 'why', 'when', 'with', 'about', 'this', 'that', 'people', 'feed']);

export const Route = createFileRoute('/api/ai/ask-feed')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          if (!isAITextConfigured()) return Response.json({ error: 'AI is unavailable' }, { status: 503 });
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'ask-feed' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const hidden = await getHiddenAuthorIds(session.user.id);
          const terms = parsed.data.question
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter((w) => w.length > 3 && !STOPWORDS.has(w))
            .slice(0, 6);

          const where = {
            deletedAt: null,
            audience: 'PUBLIC' as const,
            unlockPrice: null,
            ...(hidden.length ? { userId: { notIn: hidden } } : {}),
            ...(terms.length ? { OR: terms.map((t) => ({ content: { contains: t, mode: 'insensitive' as const } })) } : {}),
          };

          let posts = await prisma.rMHark.findMany({
            where,
            orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
            take: 60,
            select: { content: true, user: { select: { name: true, handle: true } } },
          });
          // Fall back to recent posts if the keyword search found nothing.
          if (posts.length === 0) {
            posts = await prisma.rMHark.findMany({
              where: { deletedAt: null, audience: 'PUBLIC', unlockPrice: null, ...(hidden.length ? { userId: { notIn: hidden } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: 60,
              select: { content: true, user: { select: { name: true, handle: true } } },
            });
          }
          if (posts.length === 0) {
            return Response.json({ answer: "There aren't enough posts to answer that yet." });
          }

          const answer = await askFeed(
            parsed.data.question,
            posts.map((p) => ({ author: p.user?.name || p.user?.handle || 'user', content: p.content }))
          );
          return Response.json({ answer, sourceCount: posts.length });
        } catch (error) {
          console.error('Ask-feed error:', error);
          return Response.json({ error: 'Could not answer' }, { status: 500 });
        }
      },
    },
  },
});
