import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { isLocked } from '@/lib/feed/map-feed-item.server';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { apiAuthorSelect, serializePostPoll, serializePublicPost } from '@/lib/api/serializers.server';
import { pinnedOrderFor } from '@/lib/feed/profile-pins.server';
import { resolveEndedResult } from '@/lib/feed/ranked-poll.server';
import { quizRevealFor } from '@/lib/feed/quiz-poll';
import { countsHiddenFrom } from '@/lib/feed/quiet-counts';
import { deleteOwnPost } from '@/lib/social/engagement.server';

/**
 * GET    /api/v1/posts/{id} — a single post the caller may read (403 while it is a
 *        priced post they have not unlocked).
 * DELETE /api/v1/posts/{id} — soft-delete one of your own posts.
 */
export const Route = createFileRoute('/api/v1/posts/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const post = await prisma.rMHark.findUnique({
              where: { id: params.id },
              select: {
                id: true, userId: true, content: true, audience: true, communityId: true, createdAt: true, deletedAt: true,
                likeCount: true, commentCount: true, repostCount: true, viewCount: true, imageUrls: true, imageAlts: true, gifUrl: true, gifAlt: true, isSensitive: true, contentWarning: true, pinnedCommentId: true,
                unlockPrice: true, unlocks: { where: { userId }, select: { id: true } },
                user: { select: apiAuthorSelect },
                poll: {
                  select: {
                    id: true, question: true, multiSelect: true, ranked: true, resultJson: true, closesAt: true, closedAt: true,
                    correctOptionId: true, explanation: true,
                    // The key owner's own vote, so a quiz's answer is theirs once they have answered.
                    options: { orderBy: { position: 'asc' }, select: { id: true, text: true, votes: { where: { userId }, select: { id: true }, take: 1 } } },
                  },
                },
              },
            });
            // Same rule as every other post read: exists, not deleted, audience,
            // not by a hidden author, and a private community's posts are members-only.
            if (!post || !(await canReadThread(post, userId))) {
              return error('not_found', 'Post not found.', 404);
            }
            // Audience access is not paid access: a priced post's body and images are
            // for its author and for viewers who unlocked it, as on the web reader.
            if (isLocked(post, userId)) {
              return error('forbidden', 'This post is locked. Unlock it on RMH Studios to read it.', 403);
            }
            const pinnedOrder = (await pinnedOrderFor([post.id])).get(post.id) ?? null;
            // A ranked poll's count: stored when it ended, computed on this read if the job has not run yet.
            const counted = post.poll ? await resolveEndedResult(post.poll) : null;
            const poll = post.poll
              ? serializePostPoll(
                  post.poll,
                  counted,
                  countsHiddenFrom(post.userId, post.user.profile?.hideCountsOnMine, userId),
                  quizRevealFor(
                    post.poll,
                    { viewerId: userId, authorId: post.userId },
                    post.poll.options.some((o) => o.votes.length > 0),
                  )
                )
              : null;
            return json({ ...serializePublicPost({ ...post, pinnedOrder }, userId), poll });
          },
          { scope: 'read:posts' }
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, error, noContent }) => {
            const result = await deleteOwnPost(userId, params.id);
            if (!result.found) return error('not_found', 'Post not found.', 404);
            if (result.forbidden) return error('forbidden', 'You can only delete your own posts.', 403);
            return noContent();
          },
          { scope: 'write:posts', idempotent: true }
        ),
    },
  },
});
