import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { summarizeThread, isSummarizerConfigured } from '@/lib/ai/summarize.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';

type AuthorShape = { name: string | null; handle: string | null; profile: { displayName: string | null } | null };
const nameOf = (u: AuthorShape | null) => u?.profile?.displayName || u?.name || u?.handle || 'user';
const authorSelect = { name: true, handle: true, profile: { select: { displayName: true } } } as const;

// Small in-memory cache so repeat opens of the same popular thread don't re-bill.
const cache = new Map<string, { summary: string; at: number }>();
const TTL_MS = 10 * 60 * 1000;

/** GET /api/rmharks/$id/summary — AI summary of a post's comment thread. */
export const Route = createFileRoute('/api/rmharks/$id/summary')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          if (!isSummarizerConfigured()) {
            return Response.json({ error: 'Summaries are not available' }, { status: 503 });
          }
          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'thread-summary' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const { id } = params;

          // Authorize the viewer BEFORE reading (or serving cached) content — the
          // summary revealed the substance of PRIVATE/paywalled posts otherwise.
          const session = await auth.api.getSession({ headers: request.headers });
          const viewerId = session?.user?.id ?? null;
          const post = await prisma.rMHark.findUnique({
            where: { id },
            select: {
              content: true,
              userId: true,
              audience: true,
              unlockPrice: true,
              unlocks: { where: { userId: viewerId ?? '' }, select: { id: true } },
              user: { select: authorSelect },
            },
          });
          if (!post) return Response.json({ error: 'Post not found' }, { status: 404 });
          if (!(await canViewPost({ userId: post.userId, audience: post.audience }, viewerId))) {
            return Response.json({ error: 'Post not found' }, { status: 404 });
          }
          if (isLocked(post, viewerId)) {
            return Response.json({ error: 'This post is locked' }, { status: 403 });
          }

          // Cache is keyed by post id and only reached after authorization above.
          const cached = cache.get(id);
          if (cached && Date.now() - cached.at < TTL_MS) {
            return Response.json({ summary: cached.summary, cached: true });
          }

          const comments = await prisma.rMHarkComment.findMany({
            where: { rmheetId: id, deletedAt: null },
            orderBy: { createdAt: 'asc' },
            take: 80,
            select: { content: true, user: { select: authorSelect } },
          });

          if (comments.length < 3) {
            return Response.json({ summary: null, reason: 'too_short' });
          }

          const summary = await summarizeThread({
            post: { author: nameOf(post.user), content: post.content },
            comments: comments.map((c) => ({ author: nameOf(c.user), content: c.content })),
          });

          if (summary) cache.set(id, { summary, at: Date.now() });
          return Response.json({ summary });
        } catch (error) {
          console.error('Thread summary error:', error);
          return Response.json({ error: 'Could not summarize thread' }, { status: 500 });
        }
      },
    },
  },
});
