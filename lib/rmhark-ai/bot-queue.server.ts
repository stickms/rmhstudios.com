/**
 * Storage for the off-peak bot queue: ordinary bot posts, and the bot
 * conversation pre-written with each, generated in DeepSeek's off-peak hours
 * and released through the day (design:
 * docs/superpowers/specs/2026-11-20-bot-offpeak-queue-design.md).
 *
 * The worker sees it as `BotDeps.queue` (optional: absent, every post is
 * generated live as before). Claiming a post and publishing a comment are each
 * atomic, so overlapping ticks cannot publish one row twice.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

export interface QueuedCommentInput {
  botId: string;
  content: string;
  delayMs: number;
  replies: QueuedCommentInput[];
}

export interface QueuedPostInput {
  botId: string;
  content: string;
  imagePrompt:
    | string
    | null;
  expiresAt: Date;
  comments: QueuedCommentInput[];
}

export interface ClaimedPost {
  id: bigint;
  content: string;
  imagePrompt:
    | string
    | null;
  hasComments: boolean;
}

export interface DueComment {
  id: bigint;
  botId: string;
  content: string;
  /** The RMHark the queued post became. */
  postId: string;
  /** The published comment this one answers; null for a top-level comment. */
  parentCommentId:
    | string
    | null;
  /** True for a reply whose parent has not published (it is never due then). */
  isReply: boolean;
}

export interface BotQueueRepo {
  /** Unpublished, unexpired queued posts per bot. */
  pendingCounts(
    now: Date,
  ): Promise<
    Map<
      string,
      number
    >
  >;
  /** Delete unpublished queued posts past their expiry. Returns how many. */
  deleteExpired(
    now: Date,
  ): Promise<number>;
  /** Store a post and its comment tree in one transaction. */
  enqueue(
    p: QueuedPostInput,
  ): Promise<void>;
  /** Atomically take the bot's oldest unexpired queued post; null when none. */
  claimNext(
    botId: string,
    now: Date,
  ): Promise<ClaimedPost | null>;
  /** Give a claimed post back after a failed publish. */
  unclaim(
    id: bigint,
  ): Promise<void>;
  /** Record the RMHark a claimed post became and start its top-level comments' delays. */
  markPublished(
    id: bigint,
    postId: string,
    at: Date,
  ): Promise<void>;
  /** Comments due by `now`, oldest first. */
  dueComments(
    now: Date,
    limit: number,
  ): Promise<
    DueComment[]
  >;
  /** Insert a due comment as a real comment, mark it published and start its replies' delays. */
  publishComment(
    c: DueComment,
    at: Date,
  ): Promise<string>;
  /** Discard a queued comment and everything under it. */
  discardSubtree(
    id: bigint,
    at: Date,
  ): Promise<void>;
  /** Whether a human has replied to this (published) comment. */
  humanRepliedTo(
    commentId: string,
  ): Promise<boolean>;
  /** Of these RMHark ids, the ones published from the queue with a pre-written conversation. */
  scriptedPostIds(
    postIds: string[],
  ): Promise<
    Set<string>
  >;
}

async function createComments(
  tx: Prisma.TransactionClient,
  queuedPostId: bigint,
  parentId:
    | bigint
    | null,
  comments: QueuedCommentInput[],
): Promise<void> {
  for (const c of comments) {
    const row =
      await tx.botQueuedComment.create(
        {
          data: {
            queuedPostId,
            botId:
              c.botId,
            parentId,
            content:
              c.content,
            delayMs:
              c.delayMs,
          },
          select:
            {
              id: true,
            },
        },
      );
    if (
      c
        .replies
        .length >
      0
    )
      await createComments(
        tx,
        queuedPostId,
        row.id,
        c.replies,
      );
  }
}

export const prismaBotQueueRepo: BotQueueRepo =
  {
    async pendingCounts(
      now,
    ) {
      const rows =
        await prisma.botQueuedPost.groupBy(
          {
            by: [
              'botId',
            ],
            where:
              {
                publishedAt:
                  null,
                expiresAt:
                  {
                    gt: now,
                  },
              },
            _count:
              {
                _all: true,
              },
          },
        );
      return new Map(
        rows.map(
          (
            r,
          ) => [
            r.botId,
            r
              ._count
              ._all,
          ],
        ),
      );
    },

    async deleteExpired(
      now,
    ) {
      const res =
        await prisma.botQueuedPost.deleteMany(
          {
            where:
              {
                publishedAt:
                  null,
                expiresAt:
                  {
                    lte: now,
                  },
              },
          },
        );
      return res.count;
    },

    async enqueue(
      p,
    ) {
      await prisma.$transaction(
        async (
          tx,
        ) => {
          const post =
            await tx.botQueuedPost.create(
              {
                data: {
                  botId:
                    p.botId,
                  content:
                    p.content,
                  imagePrompt:
                    p.imagePrompt,
                  expiresAt:
                    p.expiresAt,
                },
                select:
                  {
                    id: true,
                  },
              },
            );
          await createComments(
            tx,
            post.id,
            null,
            p.comments,
          );
        },
      );
    },

    async claimNext(
      botId,
      now,
    ) {
      // Timestamps go in as ISO strings cast to `timestamp` (the columns hold UTC without a
      // zone), the pattern lib/ops/error-inbox.server.ts uses, so the session time zone never shifts them.
      const at =
        now.toISOString();
      // One statement: the row lock + SKIP LOCKED means a concurrent tick takes the next
      // row (or none), never the same one.
      const rows =
        await prisma.$queryRaw<
          {
            id: bigint;
            content: string;
            imagePrompt:
              | string
              | null;
            hasComments: boolean;
          }[]
        >`
      UPDATE "bot_queued_post" SET "publishedAt" = ${at}::timestamp
      WHERE "id" = (
        SELECT "id" FROM "bot_queued_post"
        WHERE "botId" = ${botId} AND "publishedAt" IS NULL AND "expiresAt" > ${at}::timestamp
        ORDER BY "createdAt" ASC, "id" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id", "content", "imagePrompt",
        EXISTS (SELECT 1 FROM "bot_queued_comment" c WHERE c."queuedPostId" = "bot_queued_post"."id") AS "hasComments"`;
      return (
        rows[0] ??
        null
      );
    },

    async unclaim(
      id,
    ) {
      await prisma.botQueuedPost.updateMany(
        {
          where:
            {
              id,
              publishedPostId:
                null,
            },
          data: {
            publishedAt:
              null,
          },
        },
      );
    },

    async markPublished(
      id,
      postId,
      at,
    ) {
      await prisma.$transaction(
        [
          prisma.botQueuedPost.update(
            {
              where:
                {
                  id,
                },
              data: {
                publishedPostId:
                  postId,
                publishedAt:
                  at,
              },
            },
          ),
          prisma.$executeRaw`
        UPDATE "bot_queued_comment"
        SET "publishAt" = ${at.toISOString()}::timestamp + ("delayMs" * INTERVAL '1 millisecond')
        WHERE "queuedPostId" = ${id} AND "parentId" IS NULL AND "discardedAt" IS NULL`,
        ],
      );
    },

    async dueComments(
      now,
      limit,
    ) {
      const rows =
        await prisma.botQueuedComment.findMany(
          {
            where:
              {
                publishAt:
                  {
                    lte: now,
                  },
                publishedCommentId:
                  null,
                discardedAt:
                  null,
              },
            orderBy:
              [
                {
                  publishAt:
                    'asc',
                },
                {
                  id: 'asc',
                },
              ],
            take: limit,
            select:
              {
                id: true,
                botId: true,
                content: true,
                parentId: true,
                post: {
                  select:
                    {
                      publishedPostId: true,
                    },
                },
                parent:
                  {
                    select:
                      {
                        publishedCommentId: true,
                      },
                  },
              },
          },
        );
      return rows
        .filter(
          (
            r,
          ) =>
            r
              .post
              .publishedPostId !==
            null,
        )
        .map(
          (
            r,
          ) => ({
            id: r.id,
            botId:
              r.botId,
            content:
              r.content,
            postId:
              r
                .post
                .publishedPostId!,
            parentCommentId:
              r
                .parent
                ?.publishedCommentId ??
              null,
            isReply:
              r.parentId !==
              null,
          }),
        );
    },

    async publishComment(
      c,
      at,
    ) {
      return prisma.$transaction(
        async (
          tx,
        ) => {
          const comment =
            await tx.rMHarkComment.create(
              {
                data: {
                  rmheetId:
                    c.postId,
                  userId:
                    c.botId,
                  content:
                    c.content,
                  parentId:
                    c.parentCommentId,
                },
                select:
                  {
                    id: true,
                  },
              },
            );
          await tx.rMHark.update(
            {
              where:
                {
                  id: c.postId,
                },
              data: {
                commentCount:
                  {
                    increment: 1,
                  },
              },
            },
          );
          await tx.botQueuedComment.update(
            {
              where:
                {
                  id: c.id,
                },
              data: {
                publishedCommentId:
                  comment.id,
              },
            },
          );
          await tx.$executeRaw`
        UPDATE "bot_queued_comment"
        SET "publishAt" = ${at.toISOString()}::timestamp + ("delayMs" * INTERVAL '1 millisecond')
        WHERE "parentId" = ${c.id} AND "discardedAt" IS NULL`;
          await tx.user
            .update(
              {
                where:
                  {
                    id: c.botId,
                  },
                data: {
                  botLastPostAt:
                    at,
                },
              },
            )
            .catch(
              () =>
                undefined,
            );
          return comment.id;
        },
      );
    },

    async discardSubtree(
      id,
      at,
    ) {
      await prisma.$executeRaw`
      WITH RECURSIVE sub AS (
        SELECT "id" FROM "bot_queued_comment" WHERE "id" = ${id}
        UNION ALL
        SELECT c."id" FROM "bot_queued_comment" c JOIN sub ON c."parentId" = sub."id"
      )
      UPDATE "bot_queued_comment" SET "discardedAt" = ${at.toISOString()}::timestamp
      WHERE "id" IN (SELECT "id" FROM sub) AND "publishedCommentId" IS NULL`;
    },

    async humanRepliedTo(
      commentId,
    ) {
      const n =
        await prisma.rMHarkComment.count(
          {
            where:
              {
                parentId:
                  commentId,
                user: {
                  isBot: false,
                },
              },
          },
        );
      return (
        n >
        0
      );
    },

    async scriptedPostIds(
      postIds,
    ) {
      if (
        postIds.length ===
        0
      )
        return new Set();
      const rows =
        await prisma.botQueuedPost.findMany(
          {
            where:
              {
                publishedPostId:
                  {
                    in: postIds,
                  },
                comments:
                  {
                    some: {},
                  },
              },
            select:
              {
                publishedPostId: true,
              },
          },
        );
      return new Set(
        rows.map(
          (
            r,
          ) =>
            r.publishedPostId!,
        ),
      );
    },
  };
