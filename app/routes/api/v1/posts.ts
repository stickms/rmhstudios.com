import { createFileRoute } from '@tanstack/react-router';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { MAX_RMHARK_LENGTH } from '@/lib/rmhark-schema';
import { createPost } from '@/lib/social/engagement.server';
import { restrictionMessage } from '@/lib/moderation/restrictions.server';
import { parsePage, page, serializeOwnPost } from '@/lib/api/serializers.server';
import { pinnedOrderFor } from '@/lib/feed/profile-pins.server';
import { hasScope } from '@/lib/api/scopes';
import { communityPostFields } from '@/lib/api/v1/communities-schema';
import { createCommunityPostForKey } from '@/lib/api/v1/communities.server';
import { quizPollFields, refineQuizPoll } from '@/lib/feed/quiz-poll-schema';
import { MAX_POLL_OPTIONS, MAX_POLL_OPTION_LENGTH, MAX_POLL_QUESTION_LENGTH, MIN_POLL_OPTIONS } from '@/lib/rmhark-limits';

/** A poll on a new post (s07-19): single or multiple choice, optionally a quiz with its answer by position. */
const apiPollSchema = z
  .object({
    question: z.string().min(1).max(MAX_POLL_QUESTION_LENGTH),
    options: z.array(z.string().min(1).max(MAX_POLL_OPTION_LENGTH)).min(MIN_POLL_OPTIONS).max(MAX_POLL_OPTIONS),
    multiSelect: z.boolean().optional(),
    durationHours: z.number().int().min(1).max(720).optional(),
    ...quizPollFields,
  })
  .superRefine(refineQuizPoll);

const createSchema = z
  .object({
    content: z.string().max(MAX_RMHARK_LENGTH).optional(),
    poll: apiPollSchema.optional(),
    media_ids: z.array(z.string()).max(4).optional(),
    audience: z.enum(['PUBLIC', 'FOLLOWERS', 'PRIVATE']).optional(),
    ...communityPostFields,
  })
  .refine((v) => (v.content?.trim().length ?? 0) > 0 || (v.media_ids?.length ?? 0) > 0 || !!v.poll, {
    message: 'A post needs text content, a poll or at least one image.',
  });

/** The envelope's `type` for a community refusal, by status (the gate's own codes are not in the catalog). */
const REFUSAL_TYPE = {
  400: 'invalid_request_error',
  403: 'authorization_error',
  404: 'not_found_error',
  409: 'conflict_error',
  422: 'invalid_request_error',
} as const;

/**
 * GET  /api/v1/posts — your recent posts (keyset by ?cursor=<ISO createdAt>).
 * POST /api/v1/posts — create a post on your account.
 */
export const Route = createFileRoute('/api/v1/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json }) => {
            const { limit, cursor } = parsePage(new URL(request.url));
            const posts = await prisma.rMHark.findMany({
              where: { userId, deletedAt: null, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
              orderBy: { createdAt: 'desc' },
              take: limit,
              select: { id: true, content: true, createdAt: true, likeCount: true, commentCount: true, repostCount: true, viewCount: true, audience: true, imageUrls: true, imageAlts: true, gifUrl: true, gifAlt: true, isSensitive: true, contentWarning: true, pinnedCommentId: true },
            });
            const pinnedOrder = await pinnedOrderFor(posts.map((p) => p.id));
            return json(
              page(
                posts.map((p) => ({ ...p, pinnedOrder: pinnedOrder.get(p.id) ?? null })).map(serializeOwnPost),
                limit,
                (p) => p.createdAt.toISOString(),
              ),
            );
          },
          { scope: 'read:posts' }
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error, scopes, requestId }) => {
            // A moderator's timeout on posting holds for a key too, whatever the post is (s14-17).
            const restricted = await restrictionMessage(userId, 'post');
            if (restricted) return error('feature_restricted', restricted, 403);

            const body = await request.json().catch(() => null);
            const parsed = createSchema.safeParse(body);
            if (!parsed.success) {
              return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);
            }

            // Posting into a community also needs `write:communities`: a key that only holds `write:posts`
            // never gained it. Refused here, before any gate or write runs.
            if (parsed.data.communityId && parsed.data.poll) {
              return error('invalid_request', 'A poll cannot be combined with communityId.', 400);
            }
            if (parsed.data.communityId) {
              if (!hasScope(scopes, 'write:communities')) {
                return error(
                  'insufficient_scope',
                  'Posting into a community requires the "write:communities" scope, which this key does not have.',
                  403,
                  { 'X-Accepted-Scope': 'write:posts write:communities' },
                );
              }
              const made = await createCommunityPostForKey({
                userId,
                communityId: parsed.data.communityId,
                content: parsed.data.content ?? '',
                audience: parsed.data.audience ?? 'PUBLIC',
                mediaIds: parsed.data.media_ids ?? [],
                mediaAlts: parsed.data.media_alts ?? [],
                flairId: parsed.data.flairId,
              });
              if (made.kind === 'held') return json({ status: 'held', id: made.id }, 202);
              if (made.kind === 'refused') {
                const code = made.code ?? 'forbidden';
                // The gate's own code and end time ride in the standard envelope (a timeout's `endsAt`).
                return json(
                  {
                    error: {
                      type: REFUSAL_TYPE[made.status],
                      code,
                      message: made.message,
                      request_id: requestId,
                      ...(made.endsAt !== undefined ? { endsAt: made.endsAt } : {}),
                    },
                  },
                  made.status,
                );
              }
              const c = made.post;
              return json(
                {
                  id: c.id,
                  content: c.content,
                  audience: c.audience,
                  createdAt: c.createdAt,
                  communityId: c.communityId,
                  flairId: c.flairId,
                },
                201,
              );
            }

            const result = await createPost({
              userId,
              content: parsed.data.content ?? '',
              audience: parsed.data.audience ?? 'PUBLIC',
              mediaIds: parsed.data.media_ids ?? [],
              ...(parsed.data.poll ? { poll: parsed.data.poll } : {}),
            });
            if (!result.ok || !result.post) {
              return error('invalid_media', result.error ?? 'Could not create post', 400);
            }
            const p = result.post;
            return json({ id: p.id, content: p.content, audience: p.audience, createdAt: p.createdAt }, 201);
          },
          { scope: 'write:posts', idempotent: true }
        ),
    },
  },
});
