import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { askFeedApi } from '@/lib/feed/compose-assist.contract';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { askFeed, isAITextConfigured } from '@/lib/ai/text.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { communityVisibleWhere } from '@/lib/feed/audience.server';

/** POST /api/ai/ask-feed — answer a question grounded in recent feed posts. */
const schema = z.object({ question: z.string().min(3).max(300) });

const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'what',
  'who',
  'how',
  'why',
  'when',
  'with',
  'about',
  'this',
  'that',
  'people',
  'feed',
]);

export const route = apiRoute('/api/ai/ask-feed', {
  POST: implement(
    askFeedApi,
    {
      rateLimit: { limit: 10, windowMs: 60_000, prefix: 'ask-feed' },
      body: schema,
      allowEmptyBody: true,
    },
    async ({ userId, body }) => {
      if (!isAITextConfigured())
        return Response.json({ error: 'AI is unavailable' }, { status: 503 });

      const hidden = await getHiddenAuthorIds(userId);
      const terms = body.question
        .toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !STOPWORDS.has(w))
        .slice(0, 6);

      const where = {
        deletedAt: null,
        audience: 'PUBLIC' as const,
        // A private community's posts only feed the answer of its own members.
        ...communityVisibleWhere(userId),
        unlockPrice: null,
        ...(hidden.length ? { userId: { notIn: hidden } } : {}),
        ...(terms.length
          ? {
              OR: terms.map((t) => ({
                content: { contains: t, mode: 'insensitive' as const },
              })),
            }
          : {}),
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
          where: {
            deletedAt: null,
            audience: 'PUBLIC',
            ...communityVisibleWhere(userId),
            unlockPrice: null,
            ...(hidden.length ? { userId: { notIn: hidden } } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take: 60,
          select: { content: true, user: { select: { name: true, handle: true } } },
        });
      }
      if (posts.length === 0) {
        return { answer: "There aren't enough posts to answer that yet." };
      }

      const answer = await askFeed(
        body.question,
        posts.map((p) => ({
          author: p.user?.name || p.user?.handle || 'user',
          content: p.content,
        })),
      );
      return { answer, sourceCount: posts.length };
    },
  ),
});
