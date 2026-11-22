/**
 * Adapters from the v1 shapes (`/api/v1/communities*`, `/api/v1/me/communities`, `POST /api/v1/posts` with a
 * `communityId`) to the functions the site uses. Visibility is the site's: `getCommunity` (a private community the
 * key owner is not in is `null` here, never the locked preview), `getCommunityFeed` (the same query, audience rule,
 * removed and held handling and mapping as the community page, so counts are already quiet) and `listRules`.
 * Posting goes through `prepareCommunityPost`, the call the site's create path makes. Every function acts as the key
 * owner and takes no other member's id; member lists are never returned.
 */
import { prisma } from '@/lib/prisma.server';
import {
  getCommunity,
  getCommunityFeed,
} from '@/lib/communities/detail.server';
import { listRules } from '@/lib/communities/rules.server';
import { listFlairs } from '@/lib/communities/flairs.server';
import { getCommunitySettings } from '@/lib/communities/settings.server';
import { prepareCommunityPost } from '@/lib/communities/post-gate.server';
import {
  HELD_BY,
  recordModItem,
} from '@/lib/communities/automod.server';
import { enqueuePostAlert } from '@/lib/communities/post-alerts.server';
import { linkPostHashtags } from '@/lib/tags-extract.server';
import { resolveMediaForPost } from '@/lib/media/attach.server';
import { enqueueProgression } from '@/lib/social/engagement-effects.server';
import { countsHiddenFrom } from '@/lib/feed/quiet-counts';
import type { FeedItem } from '@/lib/feed-types';

export interface ApiCommunity {
  id: string;
  slug: string;
  name: string;
  description:
    | string
    | null;
  icon:
    | string
    | null;
  color:
    | string
    | null;
  isPrivate: boolean;
  memberCount: number;
  createdAt: string;
  isMember: boolean;
  role:
    | 'MEMBER'
    | 'MOD'
    | 'ADMIN'
    | null;
  posting: {
    verification: {
      level: string;
      value: number;
    };
    flairRequired: boolean;
    requireImageAlt: boolean;
  };
  flairs: {
    id: string;
    name: string;
    color: string;
  }[];
}

/** The community as the key owner may see it, or null (missing, or private and the owner is not in it). */
export async function getCommunityForKey(
  slug: string,
  userId: string,
): Promise<ApiCommunity | null> {
  const c =
    await getCommunity(
      slug,
      userId,
    );
  if (
    !c ||
    c.locked
  )
    return null;
  const [
    settings,
    flairs,
  ] =
    await Promise.all(
      [
        getCommunitySettings(
          c.id,
        ),
        listFlairs(
          c.id,
        ),
      ],
    );
  const rule =
    settings?.verification;
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    description:
      c.description,
    icon: c.icon,
    color:
      c.color,
    isPrivate:
      c.isPrivate,
    memberCount:
      c.memberCount,
    createdAt:
      c.createdAt,
    isMember:
      c.joined,
    role:
      c.role ===
        'MOD' ||
      c.role ===
        'ADMIN' ||
      c.role ===
        'MEMBER'
        ? c.role
        : null,
    posting:
      {
        verification:
          {
            level:
              rule?.level ??
              'none',
            value:
              rule?.value ??
              0,
          },
        flairRequired:
          settings?.flairRequired ??
          false,
        requireImageAlt:
          settings?.requireImageAlt ??
          false,
      },
    flairs:
      flairs.map(
        (
          f,
        ) => ({
          id: f.id,
          name: f.name,
          color:
            f.color,
        }),
      ),
  };
}

/** A community's rules as the site shows them, or null when the owner cannot see the community. */
export async function getRulesForKey(
  slug: string,
  userId: string,
) {
  const c =
    await getCommunity(
      slug,
      userId,
    );
  if (
    !c ||
    c.locked
  )
    return null;
  const rules =
    await listRules(
      c.id,
    );
  return rules.map(
    (
      r,
    ) => ({
      id: r.id,
      position:
        r.position,
      title:
        r.title,
      description:
        r.description,
    }),
  );
}

/**
 * One community post in the shape `/api/v1/feed` returns (`serializePublicPost`). The counts are what
 * `getCommunityFeed` left on the item: already nulled when the author hides them from this viewer
 * (quiet counts), so a withheld figure stays `null` and nothing is re-derived here.
 */
export function serializeCommunityPost(
  item: FeedItem,
  viewerId:
    | string
    | null,
) {
  const hidden =
    item.likeCount ===
      null ||
    item.likeCount ===
      undefined ||
    countsHiddenFrom(
      item
        .user
        ?.id,
      item
        .user
        ?.hideCounts,
      viewerId,
    );
  const count =
    (
      v:
        | number
        | null
        | undefined,
    ) =>
      hidden
        ? null
        : (v ??
          0);
  return {
    id: item.id,
    content:
      item.content ??
      '',
    imageUrls:
      item.imageUrls ??
      [],
    imageAlts:
      item.imageAlts ??
      [],
    gifUrl:
      item.gifUrl ??
      null,
    gifAlt:
      item.gifAlt ??
      null,
    sensitive:
      item.isSensitive ??
      false,
    contentWarning:
      item.contentWarning ??
      null,
    pinnedReplyId:
      null as
        | string
        | null,
    createdAt:
      item.createdAt,
    author:
      {
        id:
          item
            .user
            ?.id ??
          '',
        name:
          item
            .user
            ?.name ??
          null,
        handle:
          item
            .user
            ?.handle ??
          null,
        image:
          item
            .user
            ?.image ??
          null,
      },
    metrics:
      {
        likes:
          count(
            item.likeCount,
          ),
        comments:
          count(
            item.commentCount,
          ),
        reposts:
          count(
            item.repostCount,
          ),
        views:
          count(
            item.viewCount,
          ),
      },
    flair:
      item.communityFlair
        ? {
            id: item
              .communityFlair
              .id,
            name: item
              .communityFlair
              .name,
            color:
              item
                .communityFlair
                .color,
          }
        : null,
  };
}

/** The community's newest posts as the site's community feed returns them to the owner, or null. */
export async function getPostsForKey(
  slug: string,
  userId: string,
  opts: {
    cursor?:
      | string
      | undefined;
    flair?:
      | string
      | undefined;
    limit: number;
  },
) {
  const feed =
    await getCommunityFeed(
      slug,
      userId,
      {
        cursor:
          opts.cursor ??
          null,
        limit:
          opts.limit,
        flairId:
          opts.flair ??
          null,
      },
    );
  if (
    !feed
  )
    return null;
  return {
    data: feed.items.map(
      (
        i,
      ) =>
        serializeCommunityPost(
          i,
          userId,
        ),
    ),
    nextCursor:
      feed.nextCursor,
  };
}

/** The key owner's memberships, newest first (keyset by membership id). */
export async function listMembershipsForKey(
  userId: string,
  opts: {
    cursor?:
      | string
      | undefined;
    limit: number;
  },
) {
  const rows =
    await prisma.communityMember.findMany(
      {
        where:
          {
            userId,
          },
        orderBy:
          [
            {
              joinedAt:
                'desc',
            },
            {
              id: 'desc',
            },
          ],
        take:
          opts.limit +
          1,
        ...(opts.cursor
          ? {
              skip: 1,
              cursor:
                {
                  id: opts.cursor,
                },
            }
          : {}),
        select:
          {
            id: true,
            role: true,
            joinedAt: true,
            community:
              {
                select:
                  {
                    id: true,
                    slug: true,
                    name: true,
                    icon: true,
                    isPrivate: true,
                    memberCount: true,
                  },
              },
          },
      },
    );
  const more =
    rows.length >
    opts.limit;
  const pageRows =
    more
      ? rows.slice(
          0,
          opts.limit,
        )
      : rows;
  return {
    data: pageRows.map(
      (
        m,
      ) => ({
        id: m
          .community
          .id,
        slug: m
          .community
          .slug,
        name: m
          .community
          .name,
        icon: m
          .community
          .icon,
        isPrivate:
          m
            .community
            .isPrivate,
        memberCount:
          m
            .community
            .memberCount,
        role: m.role,
        joinedAt:
          m.joinedAt.toISOString(),
      }),
    ),
    nextCursor:
      more
        ? (pageRows[
            pageRows.length -
              1
          ]
            ?.id ??
          null)
        : null,
  };
}

export type CommunityPostResult =
  | {
      kind: 'refused';
      status:
        | 400
        | 403
        | 404
        | 409
        | 422;
      code:
        | string
        | null;
      message: string;
      endsAt?:
        | string
        | null;
    }
  | {
      kind: 'held';
      id: string;
    }
  | {
      kind: 'created';
      post: {
        id: string;
        content: string;
        audience: string;
        createdAt: Date;
        communityId: string;
        flairId:
          | string
          | null;
      };
    };

class MediaRefused extends Error {}

/**
 * Create a post in a community for the key owner: `prepareCommunityPost` (the site's call), then the same rows the
 * site writes. A hold is stored as the AutoMod soft-delete marker and queued for the mods; it is not counted,
 * hashtag-linked or announced until a mod approves it (`resolvePost`).
 */
export async function createCommunityPostForKey(args: {
  userId: string;
  communityId: string;
  content: string;
  audience:
    | 'PUBLIC'
    | 'FOLLOWERS'
    | 'PRIVATE';
  mediaIds: string[];
  mediaAlts: string[];
  flairId:
    | string
    | undefined;
}): Promise<CommunityPostResult> {
  const {
    userId,
    communityId,
    flairId,
  } =
    args;
  const content =
    args.content.trim();
  // The gate sees one image per media id; the alts are index-aligned and clamped to them.
  const imageUrls =
    args.mediaIds;
  const imageAlts =
    args.mediaAlts
      .slice(
        0,
        imageUrls.length,
      )
      .map(
        (
          a,
        ) =>
          a.trim(),
      );

  const prepared =
    await prepareCommunityPost(
      {
        communityId,
        userId,
        content,
        imageUrls,
        imageAlts,
        flairId,
      },
    );
  if (
    !prepared.ok
  ) {
    const r =
      prepared.refusal;
    return {
      kind: 'refused',
      status:
        r.status,
      code: r.code,
      message:
        r
          .body
          .error,
      ...(r
        .body
        .endsAt !==
      undefined
        ? {
            endsAt:
              r
                .body
                .endsAt,
          }
        : {}),
    };
  }
  const {
    held,
    holdRule,
    flagRule,
  } =
    prepared;

  let created;
  try {
    created =
      await prisma.$transaction(
        async (
          tx,
        ) => {
          const post =
            await tx.rMHark.create(
              {
                data: {
                  content,
                  userId,
                  audience:
                    args.audience,
                  communityId,
                  imageAlts,
                  ...(held
                    ? {
                        deletedAt:
                          new Date(),
                        deletedBy:
                          HELD_BY,
                      }
                    : {}),
                },
                select:
                  {
                    id: true,
                    content: true,
                    audience: true,
                    createdAt: true,
                  },
              },
            );
          if (
            args
              .mediaIds
              .length >
            0
          ) {
            const attached =
              await resolveMediaForPost(
                {
                  prisma:
                    tx,
                },
                {
                  userId,
                  mediaIds:
                    args.mediaIds,
                  postId:
                    post.id,
                },
              );
            if (
              !attached.ok
            )
              throw new MediaRefused(
                attached.error,
              );
            await tx.rMHark.update(
              {
                where:
                  {
                    id: post.id,
                  },
                data: {
                  imageUrls:
                    attached.urls,
                },
              },
            );
          }
          if (
            !held
          ) {
            await linkPostHashtags(
              tx,
              post.id,
              post.content,
              post.createdAt,
            );
            await tx.user.update(
              {
                where:
                  {
                    id: userId,
                  },
                data: {
                  postCount:
                    {
                      increment: 1,
                    },
                },
              },
            );
            await tx.community.update(
              {
                where:
                  {
                    id: communityId,
                  },
                data: {
                  postCount:
                    {
                      increment: 1,
                    },
                },
              },
            );
          }
          if (
            flairId
          )
            await tx.communityPostFlair.create(
              {
                data: {
                  postId:
                    post.id,
                  flairId,
                },
              },
            );
          return post;
        },
      );
  } catch (e) {
    if (
      e instanceof
      MediaRefused
    )
      return {
        kind: 'refused',
        status: 400,
        code: 'invalid_media',
        message:
          e.message,
      };
    throw e;
  }

  if (
    held ||
    flagRule
  ) {
    await recordModItem(
      {
        communityId,
        entityType:
          'rmhark',
        entityId:
          created.id,
        postId:
          created.id,
        authorId:
          userId,
        action:
          held
            ? 'hold'
            : 'flag',
        ruleName:
          held
            ? holdRule
            : (flagRule ??
              'AutoMod'),
        snapshot:
          content ||
          '(media post)',
      },
    ).catch(
      (
        e,
      ) =>
        console.error(
          'automod queue error:',
          e,
        ),
    );
  }
  if (
    held
  )
    return {
      kind: 'held',
      id: created.id,
    };

  void enqueuePostAlert(
    created.id,
  );
  void enqueueProgression(
    {
      actorId:
        userId,
      xp: 25,
      questKey:
        'post',
      webhook:
        {
          event:
            'post.created',
          data: {
            postId:
              created.id,
          },
        },
    },
  );
  return {
    kind: 'created',
    post: {
      ...created,
      communityId,
      flairId:
        flairId ??
        null,
    },
  };
}
