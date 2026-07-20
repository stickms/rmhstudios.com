import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { feedEventBus } from '@/lib/feed-sse';
import { notifyMentions } from '@/lib/feed/notify-mentions.server';
import { getActiveBan } from '@/lib/admin-audit.server';
import { awardXp } from '@/lib/xp/engine.server';
import { progressQuests } from '@/lib/quests/engine.server';
import { progressAchievement } from '@/lib/achievements/engine.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import type { FeedItem } from '@/lib/feed-types';

const MAX_SEGMENTS = 25;

const schema = z.object({
  segments: z.array(z.string().min(1).max(MAX_RMHARK_LENGTH)).min(2).max(MAX_SEGMENTS),
});

/**
 * POST /api/rmharks/thread — create an authored thread (a chain of the author's
 * own posts). The first segment is the root (appears in the feed); the rest are
 * follow-ups linked via `threadRootId` and read on /thread/$rootId. Text-only.
 * Returns the root as a FeedItem so the composer can optimistically prepend it.
 */
export const Route = createFileRoute('/api/rmharks/thread')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ban = await getActiveBan(userId);
          if (ban) {
            return Response.json(
              { error: `Your account is suspended${ban.reason ? `: ${ban.reason}` : ''}` },
              { status: 403 },
            );
          }

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 5,
            windowMs: 60_000,
            prefix: 'rmhark-thread',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many requests' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } },
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          const segments = parsed.data.segments.map((s) => s.trim()).filter(Boolean);
          if (segments.length < 2) {
            return Response.json({ error: 'A thread needs at least 2 posts' }, { status: 400 });
          }

          // Create the whole chain atomically. All rows in one transaction get an
          // identical DB now(), so set explicit millisecond-offset createdAt to
          // keep the thread order deterministic.
          const base = Date.now();
          const root = await prisma.$transaction(async (tx) => {
            const created = await tx.rMHark.create({
              data: {
                content: segments[0],
                userId,
                audience: 'PUBLIC',
                threadReplyCount: segments.length - 1,
                createdAt: new Date(base),
              },
              include: { user: { select: userDisplaySelect } },
            });
            // Follow-up segments need no returned rows, so insert them in ONE
            // createMany instead of N awaited creates (perf audit §2.10 — the old
            // loop held the pool connection + row-lock across up to 24 serial
            // round-trips). Millisecond-offset createdAt preserves thread order.
            if (segments.length > 1) {
              await tx.rMHark.createMany({
                data: segments.slice(1).map((content, idx) => ({
                  content,
                  userId,
                  audience: 'PUBLIC' as const,
                  threadRootId: created.id,
                  createdAt: new Date(base + idx + 1),
                })),
              });
            }
            return created;
          });

          const item: FeedItem = {
            id: root.id,
            type: 'rmhark',
            createdAt: root.createdAt.toISOString(),
            content: root.content,
            user: resolveUser(root.user),
            likeCount: 0,
            commentCount: 0,
            repostCount: 0,
            viewCount: 0,
            liked: false,
            reposted: false,
            reactions: [],
            threadReplyCount: segments.length - 1,
          };

          // Broadcast the root to followers' live feeds (segments stay off-feed).
          feedEventBus.publish({
            type: 'rmhark.created',
            rmharkId: item.id,
            payload: item,
            timestamp: item.createdAt,
            authorId: userId,
          });

          // Moderation pre-screen (all segments, best-effort, non-blocking).
          void screenNewContent({
            entityType: 'rmhark',
            entityId: root.id,
            authorId: userId,
            text: segments.join('\n\n'),
          });

          // Mentions across the whole thread → notify, linking to the thread.
          try {
            const author = item.user;
            if (author) {
              await notifyMentions({
                content: segments.join('\n'),
                author: {
                  id: author.id,
                  name: author.name ?? null,
                  image: author.image ?? null,
                  handle: author.handle ?? null,
                },
                postId: root.id,
                entityType: 'rmhark',
                entityId: root.id,
                link: `/thread/${root.id}`,
                timestamp: item.createdAt,
              });
            }
          } catch (err) {
            console.error('Thread mention notification error:', err);
          }

          // Progression + posting achievements (best-effort).
          try {
            await awardXp(userId, 25);
            await progressQuests(userId, 'post');
            const count = await prisma.rMHark.count({ where: { userId, deletedAt: null } });
            await progressAchievement(userId, 'social.first_post', { setProgress: count });
            await progressAchievement(userId, 'social.posts_10', { setProgress: count });
            await progressAchievement(userId, 'social.posts_100', { setProgress: count });
          } catch (e) {
            console.error('Thread achievement error:', e);
          }

          return Response.json(item, { status: 201 });
        } catch (error) {
          console.error('Thread create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
