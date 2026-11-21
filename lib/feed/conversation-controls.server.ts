/**
 * Conversation controls on feed posts (server side): per-member mute of a post's whole conversation, and the author's one
 * pinned reply.
 *
 * The mute is a `ConversationPref` row under the scope `post:<rootId>` (`lib/notify/conversation-prefs.server.ts`), read by
 * `createNotification` through `conversationKey`. The scope key is built here from a post the caller can see, never
 * accepted raw. The pin is `RMHark.pinnedCommentId`, a column, written only by the post's author.
 */
import { prisma } from '@/lib/prisma.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import {
  conversationRootId,
  firstLine,
  isIndefiniteMute,
  muteFieldsFor,
  type MuteChoice,
} from '@/lib/feed/conversation-controls';
import type {
  MuteState,
  MutedConversation,
} from '@/lib/feed/conversation-controls.contract';
import {
  getConversationPref,
  modeOf,
  scopeKeyFor,
  setConversationPref,
} from '@/lib/notify/conversation-prefs.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';

/** The scope-key prefix every post conversation shares. */
const POST_SCOPE_PREFIX =
  scopeKeyFor(
    'post',
    '',
  );

export const MUTED_CONVERSATIONS_PAGE = 50;

/** The `conversationKey` a notification about this post carries: the scope of its thread root. */
export function postConversationKey(post: {
  id: string;
  threadRootId:
    | string
    | null;
}): string {
  return scopeKeyFor(
    'post',
    conversationRootId(
      post,
    ),
  );
}

/**
 * The thread root of a post the viewer may read, or null (missing, deleted, blocked, or not visible to them). Muting from
 * any reply in a conversation therefore mutes the root's scope.
 */
export async function visibleConversationRoot(
  viewerId: string,
  postId: string,
): Promise<
  | string
  | null
> {
  const post =
    await prisma.rMHark.findFirst(
      {
        where:
          {
            id: postId,
            ...(await viewerVisiblePostWhere(
              viewerId,
            )),
          },
        select:
          {
            id: true,
            threadRootId: true,
          },
      },
    );
  return post
    ? conversationRootId(
        post,
      )
    : null;
}

function stateOf(
  pref: {
    muteUntil: Date | null;
    mentionsOnly: boolean;
    pinned: boolean;
  } | null,
  now: Date = new Date(),
): MuteState {
  const mode =
    modeOf(
      pref,
      now,
    );
  const until =
    mode ===
    'none'
      ? (pref?.muteUntil ??
        null)
      : null;
  const indefinite =
    isIndefiniteMute(
      until,
    );
  return {
    mode,
    muteUntil:
      until &&
      !indefinite
        ? until.toISOString()
        : null,
    indefinite,
  };
}

export async function getConversationMute(
  viewerId: string,
  postId: string,
): Promise<MuteState | null> {
  const root =
    await visibleConversationRoot(
      viewerId,
      postId,
    );
  if (
    !root
  )
    return null;
  return stateOf(
    await getConversationPref(
      viewerId,
      scopeKeyFor(
        'post',
        root,
      ),
    ),
  );
}

export async function setConversationMute(
  viewerId: string,
  postId: string,
  choice: MuteChoice,
): Promise<MuteState | null> {
  const root =
    await visibleConversationRoot(
      viewerId,
      postId,
    );
  if (
    !root
  )
    return null;
  const {
    muteUntil,
    mentionsOnly,
  } =
    muteFieldsFor(
      choice,
    );
  const view =
    await setConversationPref(
      viewerId,
      {
        scopeKey:
          scopeKeyFor(
            'post',
            root,
          ),
        muteUntil:
          muteUntil
            ? muteUntil.toISOString()
            : null,
        mentionsOnly,
      },
    );
  return stateOf(
    {
      muteUntil:
        view.muteUntil
          ? new Date(
              view.muteUntil,
            )
          : null,
      mentionsOnly:
        view.mentionsOnly,
      pinned:
        view.pinned,
    },
  );
}

/**
 * Back to All. Unmuting is allowed for a thread the member can no longer read (it must stay possible to undo), so it keys
 * off the post's own thread root rather than the visibility gate.
 */
export async function clearConversationMute(
  viewerId: string,
  postId: string,
): Promise<MuteState | null> {
  const post =
    await prisma.rMHark.findUnique(
      {
        where:
          {
            id: postId,
          },
        select:
          {
            id: true,
            threadRootId: true,
          },
      },
    );
  if (
    !post
  )
    return null;
  await prisma.conversationPref.deleteMany(
    {
      where:
        {
          userId:
            viewerId,
          scopeKey:
            scopeKeyFor(
              'post',
              conversationRootId(
                post,
              ),
            ),
        },
    },
  );
  return {
    mode: 'all',
    muteUntil:
      null,
    indefinite: false,
  };
}

/**
 * The member's muted conversations (a live timed mute, an open-ended one, or Mentions only), newest change first. A post the
 * member can no longer read comes back without its text so the row can still be unmuted.
 */
export async function listMutedConversations(
  viewerId: string,
  cursor:
    | string
    | null,
  limit: number = MUTED_CONVERSATIONS_PAGE,
): Promise<{
  items: MutedConversation[];
  nextCursor:
    | string
    | null;
}> {
  const now =
    new Date();
  const rows =
    await prisma.conversationPref.findMany(
      {
        where:
          {
            userId:
              viewerId,
            scopeKey:
              {
                startsWith:
                  POST_SCOPE_PREFIX,
              },
            OR: [
              {
                muteUntil:
                  {
                    gt: now,
                  },
              },
              {
                mentionsOnly: true,
              },
            ],
          },
        orderBy:
          [
            {
              updatedAt:
                'desc',
            },
            {
              scopeKey:
                'asc',
            },
          ],
        take:
          limit +
          1,
        ...(cursor &&
        cursor.startsWith(
          POST_SCOPE_PREFIX,
        )
          ? {
              skip: 1,
              cursor:
                {
                  userId_scopeKey:
                    {
                      userId:
                        viewerId,
                      scopeKey:
                        cursor,
                    },
                },
            }
          : {}),
        select:
          {
            scopeKey: true,
            muteUntil: true,
            mentionsOnly: true,
            pinned: true,
          },
      },
    );
  const hasMore =
    rows.length >
    limit;
  const page =
    hasMore
      ? rows.slice(
          0,
          limit,
        )
      : rows;
  const rootIds =
    page.map(
      (
        r,
      ) =>
        r.scopeKey.slice(
          POST_SCOPE_PREFIX.length,
        ),
    );

  const posts =
    rootIds.length
      ? await prisma.rMHark.findMany(
          {
            where:
              {
                id: {
                  in: rootIds,
                },
                ...(await viewerVisiblePostWhere(
                  viewerId,
                )),
              },
            select:
              {
                id: true,
                content: true,
                user: {
                  select:
                    userDisplaySelect,
                },
              },
          },
        )
      : [];
  const byId =
    new Map(
      posts.map(
        (
          p,
        ) => [
          p.id,
          p,
        ],
      ),
    );

  const items =
    page.map(
      (
        r,
        i,
      ): MutedConversation => {
        const rootId =
          rootIds[
            i
          ] as string;
        const post =
          byId.get(
            rootId,
          );
        const author =
          post
            ? resolveUser(
                post.user,
              )
            : null;
        return {
          rootId,
          ...stateOf(
            r,
            now,
          ),
          post: post
            ? {
                text: firstLine(
                  post.content,
                ),
                author:
                  author?.name ??
                  author?.handle ??
                  '',
                link: `/u/${author?.handle ?? post.user.id}/post/${rootId}`,
              }
            : null,
        };
      },
    );
  return {
    items,
    nextCursor:
      hasMore
        ? (page[
            page.length -
              1
          ]
            ?.scopeKey ??
          null)
        : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Pinned reply                                                                */
/* -------------------------------------------------------------------------- */

export type PinReplyResult =
  | {
      ok: true;
      pinnedReplyId:
        | string
        | null;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };

/** Pin one reply to the top of the actor's own post, replacing any earlier pin. */
export async function pinReply(
  postId: string,
  commentId: string,
  actorId: string,
): Promise<PinReplyResult> {
  const post =
    await prisma.rMHark.findUnique(
      {
        where:
          {
            id: postId,
          },
        select:
          {
            userId: true,
            deletedAt: true,
          },
      },
    );
  if (
    !post ||
    post.deletedAt
  )
    return {
      ok: false,
      status: 404,
      error:
        'Post not found',
    };
  if (
    post.userId !==
    actorId
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'Only the post author can pin a reply',
    };
  }
  const comment =
    await prisma.rMHarkComment.findUnique(
      {
        where:
          {
            id: commentId,
          },
        select:
          {
            rmheetId: true,
            parentId: true,
            hiddenAt: true,
            deletedAt: true,
          },
      },
    );
  if (
    !comment ||
    comment.rmheetId !==
      postId
  ) {
    return {
      ok: false,
      status: 404,
      error:
        'Reply not found',
    };
  }
  if (
    comment.hiddenAt ||
    comment.deletedAt
  ) {
    return {
      ok: false,
      status: 409,
      error:
        'A hidden or deleted reply cannot be pinned',
    };
  }
  if (
    comment.parentId
  ) {
    return {
      ok: false,
      status: 422,
      error:
        'Only a direct reply to the post can be pinned',
    };
  }
  await prisma.rMHark.update(
    {
      where:
        {
          id: postId,
        },
      data: {
        pinnedCommentId:
          commentId,
      },
    },
  );
  return {
    ok: true,
    pinnedReplyId:
      commentId,
  };
}

export async function unpinReply(
  postId: string,
  actorId: string,
): Promise<PinReplyResult> {
  const post =
    await prisma.rMHark.findUnique(
      {
        where:
          {
            id: postId,
          },
        select:
          {
            userId: true,
            deletedAt: true,
          },
      },
    );
  if (
    !post ||
    post.deletedAt
  )
    return {
      ok: false,
      status: 404,
      error:
        'Post not found',
    };
  if (
    post.userId !==
    actorId
  ) {
    return {
      ok: false,
      status: 403,
      error:
        'Only the post author can unpin a reply',
    };
  }
  await prisma.rMHark.update(
    {
      where:
        {
          id: postId,
        },
      data: {
        pinnedCommentId:
          null,
      },
    },
  );
  return {
    ok: true,
    pinnedReplyId:
      null,
  };
}

/** Called when a reply is hidden or deleted: if it was the pinned one, the post has no pinned reply any more. */
export async function clearPinnedReplyIf(
  postId: string,
  commentId: string,
): Promise<void> {
  await prisma.rMHark.updateMany(
    {
      where:
        {
          id: postId,
          pinnedCommentId:
            commentId,
        },
      data: {
        pinnedCommentId:
          null,
      },
    },
  );
}

/**
 * A reply removed by a moderator, an admin takedown or a community mod: the post's pin must not keep naming it. Takes only
 * the reply id because those paths do not carry the post.
 */
export async function clearPinnedForComment(commentId: string): Promise<void> {
  await prisma.rMHark.updateMany({
    where: { pinnedCommentId: commentId },
    data: { pinnedCommentId: null },
  });
}
