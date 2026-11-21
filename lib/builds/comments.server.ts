import { prisma } from '@/lib/prisma.server';
import { isBlockedPair } from '@/lib/messages/send.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import {
  userDisplaySelect,
  resolveUser,
} from '@/lib/user-display';
import {
  COMMENT_EDIT_WINDOW_MS,
  COMMENT_REFUSAL_MESSAGE,
  commentRights,
  visibleComment,
  type CommentRefusal,
} from '@/lib/builds/comments';
import type { BuildComment } from '@/lib/user-builds-types';

/**
 * Build comments, the server half (s06-14): the list with rights per comment, posting with lock, block and ban
 * checks, the author's edit and delete, the creator's hide and lock, and the erasure and export pieces.
 */

export type Failure =
  {
    ok: false;
    status: number;
    error: string;
  };
const fail =
  (
    status: number,
    error: string,
  ): Failure => ({
    ok: false,
    status,
    error,
  });

/** What a viewer may do in the composer, decided once per list request. */
export type ComposerState =
  | 'open'
  | 'signed-out'
  | 'locked'
  | 'restricted';

interface BuildFacts {
  id: string;
  userId: string;
  visibility: string;
  commentsLocked: boolean;
}

/** A build by id (never by slug: the comment endpoints take the id), or null. */
export async function findCommentBuild(
  id: string,
): Promise<BuildFacts | null> {
  return prisma.userBuild.findUnique(
    {
      where:
        {
          id,
        },
      select:
        {
          id: true,
          userId: true,
          visibility: true,
          commentsLocked: true,
        },
    },
  );
}

/** A PRIVATE build answers 404 to everyone but its creator and admins. */
export function canReadBuildComments(
  build: BuildFacts,
  viewerId:
    | string
    | null,
  isAdmin: boolean,
): boolean {
  return (
    build.visibility !==
      'PRIVATE' ||
    isAdmin ||
    (viewerId !==
      null &&
      viewerId ===
        build.userId)
  );
}

async function isBanned(
  userId: string,
): Promise<boolean> {
  const u =
    await prisma.user.findUnique(
      {
        where:
          {
            id: userId,
          },
        select:
          {
            bannedUntil: true,
          },
      },
    );
  return (
    !!u?.bannedUntil &&
    u.bannedUntil.getTime() >
      Date.now()
  );
}

/** Why this member may not comment on this build, or null. Bans and blocks (either direction) both read "restricted". */
export async function commentRefusal(
  build: BuildFacts,
  userId: string,
): Promise<CommentRefusal | null> {
  if (
    build.commentsLocked
  )
    return 'locked';
  if (
    await isBanned(
      userId,
    )
  )
    return 'restricted';
  if (
    await isBlockedPair(
      userId,
      build.userId,
    )
  )
    return 'restricted';
  return null;
}

export async function composerState(
  build: BuildFacts,
  viewerId:
    | string
    | null,
): Promise<ComposerState> {
  if (
    !viewerId
  )
    return 'signed-out';
  return (
    (await commentRefusal(
      build,
      viewerId,
    )) ??
    'open'
  );
}

/** The list: top-level comments newest first, up to five replies each, with rights per comment. */
export async function listComments(opts: {
  build: BuildFacts;
  viewerId:
    | string
    | null;
  isAdmin: boolean;
  cursor:
    | string
    | null;
  limit: number;
}) {
  const {
    build,
    viewerId,
    isAdmin,
    cursor,
    limit,
  } =
    opts;
  const now =
    new Date();
  const viewer =
    {
      userId:
        viewerId,
      isAdmin,
      buildOwnerId:
        build.userId,
    };
  const live =
    {
      deletedAt:
        null,
    } as const;

  const rows =
    await prisma.buildComment.findMany(
      {
        where:
          {
            buildId:
              build.id,
            parentId:
              null,
            // A deleted comment stays only while it has live replies.
            OR: [
              live,
              {
                replies:
                  {
                    some: live,
                  },
              },
            ],
            ...(cursor
              ? {
                  createdAt:
                    {
                      lt: new Date(
                        cursor,
                      ),
                    },
                }
              : {}),
          },
        orderBy:
          {
            createdAt:
              'desc',
          },
        take:
          limit +
          1,
        include:
          {
            user: {
              select:
                userDisplaySelect,
            },
            replies:
              {
                where:
                  live,
                orderBy:
                  {
                    createdAt:
                      'asc',
                  },
                take: 5,
                include:
                  {
                    user: {
                      select:
                        userDisplaySelect,
                    },
                  },
              },
            _count:
              {
                select:
                  {
                    replies:
                      {
                        where:
                          live,
                      },
                  },
              },
          },
      },
    );

  const hasMore =
    rows.length >
    limit;
  const page =
    rows.slice(
      0,
      limit,
    );

  const toView =
    (
      c:
        | (typeof page)[number]
        | (typeof page)[number]['replies'][number],
      hasLiveReplies: boolean,
    ): BuildComment | null => {
      const seen =
        visibleComment(
          c,
          viewerId,
          hasLiveReplies,
        );
      if (
        !seen
      )
        return null;
      return {
        id: c.id,
        content:
          seen.showContent
            ? c.content
            : '',
        createdAt:
          c.createdAt.toISOString(),
        updatedAt:
          c.updatedAt.toISOString(),
        edited:
          c.editedAt !==
          null,
        state:
          seen.state,
        // A tombstone carries neither the text nor who wrote it.
        user:
          seen.state ===
          'deleted'
            ? {
                id: '',
                name: null,
                image: null,
                username:
                  null,
              }
            : resolveUser(
                c.user,
              ),
        ...commentRights(
          c,
          viewer,
          now,
        ),
      };
    };

  const items: BuildComment[] =
    [];
  for (const row of page) {
    const view =
      toView(
        row,
        row
          ._count
          .replies >
          0,
      );
    if (
      !view
    )
      continue;
    const replies =
      row.replies
        .map(
          (
            r,
          ) =>
            toView(
              r,
              false,
            ),
        )
        .filter(
          (
            r,
          ): r is BuildComment =>
            r !==
            null,
        );
    items.push(
      {
        ...view,
        replyCount:
          row
            ._count
            .replies,
        replies,
      },
    );
  }

  const last =
    page[
      page.length -
        1
    ];
  return {
    items,
    nextCursor:
      hasMore &&
      last
        ? last.createdAt.toISOString()
        : null,
    hasMore,
    locked:
      build.commentsLocked,
    canLock:
      viewerId !==
        null &&
      viewerId ===
        build.userId,
    composer:
      await composerState(
        build,
        viewerId,
      ),
  };
}

export type CreatedComment =
  | {
      ok: true;
      comment: BuildComment & {
        parentId:
          | string
          | null;
      };
      content: string;
    }
  | Failure;

/** Post a comment or reply. The lock is re-read inside the transaction that writes, so a close cannot be raced past. */
export async function createComment(
  build: BuildFacts,
  userId: string,
  input: {
    content: string;
    parentId?:
      | string
      | undefined;
  },
): Promise<CreatedComment> {
  const refusal =
    await commentRefusal(
      build,
      userId,
    );
  if (
    refusal
  )
    return fail(
      403,
      COMMENT_REFUSAL_MESSAGE[
        refusal
      ],
    );

  if (
    input.parentId
  ) {
    const parent =
      await prisma.buildComment.findFirst(
        {
          where:
            {
              id: input.parentId,
              buildId:
                build.id,
              deletedAt:
                null,
            },
          select:
            {
              userId: true,
            },
        },
      );
    if (
      !parent
    )
      return fail(
        404,
        'Parent comment not found',
      );
    // A reply to a member who blocked you (or whom you blocked) is refused like any other interaction.
    if (
      await isBlockedPair(
        userId,
        parent.userId,
      )
    )
      return fail(
        403,
        COMMENT_REFUSAL_MESSAGE.restricted,
      );
  }

  const content =
    input.content.trim();
  const created =
    await prisma.$transaction(
      async (
        tx,
      ) => {
        const fresh =
          await tx.userBuild.findUnique(
            {
              where:
                {
                  id: build.id,
                },
              select:
                {
                  commentsLocked: true,
                },
            },
          );
        if (
          !fresh ||
          fresh.commentsLocked
        )
          return null;
        const row =
          await tx.buildComment.create(
            {
              data: {
                buildId:
                  build.id,
                userId,
                content,
                parentId:
                  input.parentId ??
                  null,
              },
              include:
                {
                  user: {
                    select:
                      userDisplaySelect,
                  },
                },
            },
          );
        await tx.userBuild.update(
          {
            where:
              {
                id: build.id,
              },
            data: {
              commentCount:
                {
                  increment: 1,
                },
            },
          },
        );
        return row;
      },
    );
  if (
    !created
  )
    return fail(
      403,
      COMMENT_REFUSAL_MESSAGE.locked,
    );

  return {
    ok: true,
    content,
    comment:
      {
        id: created.id,
        content:
          created.content,
        createdAt:
          created.createdAt.toISOString(),
        updatedAt:
          created.updatedAt.toISOString(),
        edited: false,
        state:
          'visible',
        user: resolveUser(
          created.user,
        ),
        parentId:
          created.parentId,
        canEdit: true,
        canDelete: true,
        canHide: false,
        canReport: false,
      },
  };
}

export type Done<
  T,
> =
  | ({
      ok: true;
    } & T)
  | Failure;

/**
 * The author fixes their words within 30 minutes of posting. The window is checked by the database clock inside the
 * UPDATE itself (so a slow app server cannot extend it), and the row is looked up with its build in the WHERE.
 */
export async function editComment(
  buildId: string,
  commentId: string,
  userId: string,
  content: string,
): Promise<
  Done<{
    content: string;
  }>
> {
  const minutes =
    COMMENT_EDIT_WINDOW_MS /
    60_000;
  const changed =
    await prisma.$executeRaw`
    UPDATE "build_comment"
    SET "content" = ${content}, "editedAt" = now(), "updatedAt" = now()
    WHERE "id" = ${commentId} AND "buildId" = ${buildId} AND "userId" = ${userId}
      AND "deletedAt" IS NULL
      AND "createdAt" > now() - (${minutes}::int * interval '1 minute')`;
  if (
    changed ===
    1
  )
    return {
      ok: true,
      content,
    };

  const row =
    await prisma.buildComment.findFirst(
      {
        where:
          {
            id: commentId,
            buildId,
            deletedAt:
              null,
          },
        select:
          {
            userId: true,
          },
      },
    );
  if (
    !row
  )
    return fail(
      404,
      'Comment not found',
    );
  if (
    row.userId !==
    userId
  )
    return fail(
      403,
      'Forbidden',
    );
  return fail(
    409,
    'This comment can no longer be edited',
  );
}

/**
 * Soft delete by the author, or by an admin as moderation. The flag flip is a compare-and-set, so the build's
 * `commentCount` drops exactly once however many times (or from however many tabs) it is called.
 */
export async function deleteComment(
  buildId: string,
  commentId: string,
  viewerId: string,
  isAdmin: boolean,
): Promise<
  Done<object>
> {
  const row =
    await prisma.buildComment.findFirst(
      {
        where:
          {
            id: commentId,
            buildId,
            deletedAt:
              null,
          },
        select:
          {
            userId: true,
          },
      },
    );
  if (
    !row
  )
    return fail(
      404,
      'Comment not found',
    );
  const author =
    row.userId ===
    viewerId;
  if (
    !author &&
    !isAdmin
  )
    return fail(
      403,
      'Forbidden',
    );

  await prisma.$transaction(
    async (
      tx,
    ) => {
      const flipped =
        await tx.buildComment.updateMany(
          {
            where:
              {
                id: commentId,
                buildId,
                deletedAt:
                  null,
              },
            data: {
              deletedAt:
                new Date(),
              deletedBy:
                author
                  ? 'author'
                  : 'moderator',
            },
          },
        );
      if (
        flipped.count !==
        1
      )
        return;
      await tx.userBuild.updateMany(
        {
          where:
            {
              id: buildId,
              commentCount:
                {
                  gt: 0,
                },
            },
          data: {
            commentCount:
              {
                decrement: 1,
              },
          },
        },
      );
      if (
        !author
      ) {
        await recordAdminActionIn(
          tx,
          viewerId,
          'build.comment.delete',
          {
            targetType:
              'BuildComment',
            targetId:
              commentId,
            detail: `author:${row.userId}`,
          },
        );
      }
    },
  );
  return {
    ok: true,
  };
}

/** A report's "Delete comment": the same soft delete and count, by a moderator. Idempotent. */
export async function moderatorDeleteComment(
  commentId: string,
): Promise<void> {
  const row =
    await prisma.buildComment.findFirst(
      {
        where:
          {
            id: commentId,
            deletedAt:
              null,
          },
        select:
          {
            buildId: true,
          },
      },
    );
  if (
    !row
  )
    return;
  await prisma.$transaction(
    async (
      tx,
    ) => {
      const flipped =
        await tx.buildComment.updateMany(
          {
            where:
              {
                id: commentId,
                deletedAt:
                  null,
              },
            data: {
              deletedAt:
                new Date(),
              deletedBy:
                'moderator',
            },
          },
        );
      if (
        flipped.count !==
        1
      )
        return;
      await tx.userBuild.updateMany(
        {
          where:
            {
              id: row.buildId,
              commentCount:
                {
                  gt: 0,
                },
            },
          data: {
            commentCount:
              {
                decrement: 1,
              },
          },
        },
      );
    },
  );
}

/**
 * The creator hides (or unhides) one comment. The write is a conditional `updateMany` scoped to the build's creator,
 * so only they can ever match a row. `commentCount` does not change: a hidden comment is still readable behind "Show".
 */
export async function hideComment(
  buildId: string,
  commentId: string,
  viewerId: string,
  hidden: boolean,
): Promise<
  Done<{
    hidden: boolean;
  }>
> {
  const result =
    await prisma.buildComment.updateMany(
      {
        where:
          {
            id: commentId,
            buildId,
            deletedAt:
              null,
            userId:
              {
                not: viewerId,
              },
            build:
              {
                userId:
                  viewerId,
              },
          },
        data: hidden
          ? {
              hiddenAt:
                new Date(),
              hiddenById:
                viewerId,
            }
          : {
              hiddenAt:
                null,
              hiddenById:
                null,
            },
      },
    );
  if (
    result.count ===
    1
  )
    return {
      ok: true,
      hidden,
    };

  const build =
    await prisma.userBuild.findUnique(
      {
        where:
          {
            id: buildId,
          },
        select:
          {
            userId: true,
          },
      },
    );
  if (
    !build
  )
    return fail(
      404,
      'Build not found',
    );
  if (
    build.userId !==
    viewerId
  )
    return fail(
      403,
      'Forbidden',
    );
  return fail(
    404,
    'Comment not found',
  );
}

/** The creator closes or reopens comments. Existing comments stay. */
export async function setCommentsLocked(
  buildId: string,
  viewerId: string,
  locked: boolean,
): Promise<
  Done<{
    locked: boolean;
  }>
> {
  const result =
    await prisma.userBuild.updateMany(
      {
        where:
          {
            id: buildId,
            userId:
              viewerId,
          },
        data: {
          commentsLocked:
            locked,
        },
      },
    );
  if (
    result.count ===
    1
  )
    return {
      ok: true,
      locked,
    };
  const build =
    await prisma.userBuild.findUnique(
      {
        where:
          {
            id: buildId,
          },
        select:
          {
            id: true,
          },
      },
    );
  return build
    ? fail(
        403,
        'Forbidden',
      )
    : fail(
        404,
        'Build not found',
      );
}

/**
 * Account erasure: build comments stay (published words stay under "Deleted user", the way post comments do). The
 * only unlinking is the reference to a creator who hid comments, which would otherwise point at an anonymised row.
 */
export function buildCommentErasureOps(
  userId: string,
) {
  return [
    prisma.buildComment.updateMany(
      {
        where:
          {
            hiddenById:
              userId,
          },
        data: {
          hiddenById:
            null,
        },
      },
    ),
  ] as const;
}

/** The data export: the comments the member wrote (build title and slug, text, dates). Never who hid them. */
export async function exportBuildComments(
  userId: string,
) {
  const rows =
    await prisma.buildComment.findMany(
      {
        where:
          {
            userId,
          },
        orderBy:
          {
            createdAt:
              'asc',
          },
        take: 5000,
        select:
          {
            content: true,
            createdAt: true,
            editedAt: true,
            deletedAt: true,
            build:
              {
                select:
                  {
                    title: true,
                    slug: true,
                  },
              },
          },
      },
    );
  return rows.map(
    (
      r,
    ) => ({
      buildTitle:
        r
          .build
          .title,
      buildSlug:
        r
          .build
          .slug,
      content:
        r.content,
      createdAt:
        r.createdAt.toISOString(),
      editedAt:
        r.editedAt?.toISOString() ??
        null,
      deletedAt:
        r.deletedAt?.toISOString() ??
        null,
    }),
  );
}
