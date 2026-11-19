/**
 * Site moderation of user-created things: remove, edit or restore a post,
 * reply, community, space, vibe or persona, with a reason the owner is told,
 * and optionally a strike and a feature timeout in the same action.
 *
 * Every admin path that takes user content down should come through
 * `moderateContent`, so the owner always gets a notice with the reason, the
 * audit log always gets a row, and a strike always links to what earned it.
 */

import { prisma } from '@/lib/prisma.server';
import { feedEventBus } from '@/lib/feed-sse';
import {
  unlinkPostHashtags,
  linkPostHashtags,
} from '@/lib/tags-extract.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { setActivity } from '@/lib/presence.server';
import { issueStrike } from '@/lib/moderation/strikes.server';
import {
  ACCOUNT_STATUS_LINK,
  restrictFeature,
} from '@/lib/moderation/restrictions.server';
import type { RestrictableFeature } from '@/lib/moderation/restrictions';
import {
  EDITABLE_FIELDS,
  RESTORABLE,
  TYPE_NOUN,
  type ModerateContentResult,
  type ModeratableType,
  type ModerationAction,
} from '@/lib/moderation/content';
import { REMOVED_POST_TEXT } from '@/lib/moderation/removed-text';
import { VIBE_REMOVED_STATUS } from '@/lib/rmhvibe/vibe-status';

export class ModerationError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(
      message,
    );
  }
}

interface Target {
  ownerId:
    | string
    | null;
  /** A short human name for the notice ("“Neon city”", or a post's first words). */
  label: string;
  removed: boolean;
}

function snippet(
  text:
    | string
    | null
    | undefined,
  max = 60,
): string {
  const t =
    (
      text ??
      ''
    )
      .replace(
        /\s+/g,
        ' ',
      )
      .trim();
  if (
    !t
  )
    return '';
  return t.length >
    max
    ? `${t.slice(0, max - 1)}…`
    : t;
}

async function loadTarget(
  type: ModeratableType,
  id: string,
): Promise<Target | null> {
  switch (
    type
  ) {
    case 'rmhark': {
      const r =
        await prisma.rMHark.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                userId: true,
                content: true,
                deletedAt: true,
                deletedByAdmin: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.userId,
            label:
              snippet(
                r.content,
              ),
            removed:
              !!r.deletedAt &&
              r.deletedByAdmin,
          }
        : null;
    }
    case 'comment': {
      const r =
        await prisma.rMHarkComment.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                userId: true,
                content: true,
                deletedAt: true,
                deletedByAdmin: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.userId,
            label:
              snippet(
                r.content,
              ),
            removed:
              !!r.deletedAt &&
              r.deletedByAdmin,
          }
        : null;
    }
    case 'community': {
      const r =
        await prisma.community.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                createdById: true,
                name: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.createdById,
            label:
              r.name,
            removed: false,
          }
        : null;
    }
    case 'space': {
      // A Space is a titled live room (GroupCall, 2026-11-19); an untitled row
      // is a private voice call and is never reportable as a Space.
      const r =
        await prisma.groupCall.findFirst(
          {
            where:
              {
                id,
                title: {
                  not: null,
                },
              },
            select:
              {
                hostId: true,
                title: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.hostId,
            label:
              r.title ?? '',
            removed: false,
          }
        : null;
    }
    case 'vibe': {
      const r =
        await prisma.vibePage.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                ownerId: true,
                title: true,
                prompt: true,
                status: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.ownerId,
            label:
              snippet(
                r.title ||
                  r.prompt,
              ),
            removed:
              r.status ===
              VIBE_REMOVED_STATUS,
          }
        : null;
    }
    case 'persona': {
      const r =
        await prisma.aiPersona.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                ownerId: true,
                name: true,
              },
          },
        );
      return r
        ? {
            ownerId:
              r.ownerId,
            label:
              r.name,
            removed: false,
          }
        : null;
    }
  }
}

// ── remove ────────────────────────────────────────────────────────────────

async function removePost(
  id: string,
): Promise<void> {
  const post =
    await prisma.rMHark.findUnique(
      {
        where:
          {
            id,
          },
        select:
          {
            userId: true,
            deletedAt: true,
            communityId: true,
          },
      },
    );
  if (
    !post
  )
    return;
  const now =
    new Date();
  const firstDelete =
    !post.deletedAt;
  await prisma.$transaction(
    async (
      tx,
    ) => {
      // `deletedBy: 'moderator'` as well as `deletedByAdmin`: a post the author
      // had already binned stops being restorable from the bin.
      await tx.rMHark.update(
        {
          where:
            {
              id,
            },
          data: {
            deletedAt:
              post.deletedAt ??
              now,
            deletedByAdmin: true,
            deletedBy:
              'moderator',
          },
        },
      );
      if (
        firstDelete
      ) {
        await unlinkPostHashtags(
          tx,
          id,
        );
        await tx.user.updateMany(
          {
            where:
              {
                id: post.userId,
                postCount:
                  {
                    gt: 0,
                  },
              },
            data: {
              postCount:
                {
                  decrement: 1,
                },
            },
          },
        );
        if (
          post.communityId
        ) {
          await tx.community.updateMany(
            {
              where:
                {
                  id: post.communityId,
                  postCount:
                    {
                      gt: 0,
                    },
                },
              data: {
                postCount:
                  {
                    decrement: 1,
                  },
              },
            },
          );
        }
      }
    },
  );
  feedEventBus.publishPostEngagement(
    id,
    {
      type: 'rmhark.deleted',
      rmharkId:
        id,
      payload:
        {
          id,
          deletedAt:
            (
              post.deletedAt ??
              now
            ).toISOString(),
          deletedByAdmin: true,
          content:
            REMOVED_POST_TEXT,
        },
      timestamp:
        now.toISOString(),
    },
  );
}

async function removeCommunity(
  id: string,
): Promise<void> {
  // The community's posts would otherwise survive as ordinary posts (the
  // relation is SET NULL), lifting posts out of a private community into the
  // open feed. They go down with it, marked as moderation.
  const now =
    new Date();
  const posts =
    await prisma.rMHark.findMany(
      {
        where:
          {
            communityId:
              id,
            deletedAt:
              null,
          },
        select:
          {
            id: true,
            userId: true,
          },
      },
    );
  const perAuthor =
    new Map<
      string,
      number
    >();
  for (const p of posts)
    perAuthor.set(
      p.userId,
      (perAuthor.get(
        p.userId,
      ) ??
        0) +
        1,
    );
  await prisma.$transaction(
    async (
      tx,
    ) => {
      await tx.rMHark.updateMany(
        {
          where:
            {
              communityId:
                id,
              deletedAt:
                null,
            },
          data: {
            deletedAt:
              now,
            deletedByAdmin: true,
            deletedBy:
              'moderator',
          },
        },
      );
      for (const p of posts)
        await unlinkPostHashtags(
          tx,
          p.id,
        );
      for (const [
        userId,
        n,
      ] of perAuthor) {
        await tx.user.updateMany(
          {
            where:
              {
                id: userId,
                postCount:
                  {
                    gte: n,
                  },
              },
            data: {
              postCount:
                {
                  decrement:
                    n,
                },
            },
          },
        );
      }
      await tx.community.delete(
        {
          where:
            {
              id,
            },
        },
      );
    },
    {
      timeout: 60_000,
    },
  );
}

async function removeContent(
  type: ModeratableType,
  id: string,
): Promise<void> {
  switch (
    type
  ) {
    case 'rmhark':
      return removePost(
        id,
      );
    case 'comment':
      await prisma.rMHarkComment.updateMany(
        {
          where:
            {
              id,
            },
          data: {
            deletedByAdmin: true,
            deletedBy:
              'moderator',
          },
        },
      );
      await prisma.rMHarkComment.updateMany(
        {
          where:
            {
              id,
              deletedAt:
                null,
            },
          data: {
            deletedAt:
              new Date(),
          },
        },
      );
      return;
    case 'community':
      return removeCommunity(
        id,
      );
    case 'space': {
      const space =
        await prisma.groupCall.findFirst(
          {
            where:
              {
                id,
                title: {
                  not: null,
                },
              },
            select:
              {
                hostId: true,
                status: true,
              },
          },
        );
      if (!space) return;
      // Cascades to the room's text and voice roster.
      await prisma.groupCall.delete(
        {
          where:
            {
              id,
            },
        },
      );
      if (
        space.status ===
        'ACTIVE'
      )
        void setActivity(
          space.hostId,
          null,
        );
      return;
    }
    case 'vibe':
      // Soft: the row, its versions and its history stay for an appeal or a
      // restore; every reader treats the status as gone.
      await prisma.vibePage.update(
        {
          where:
            {
              id,
            },
          data: {
            status:
              VIBE_REMOVED_STATUS,
          },
        },
      );
      return;
    case 'persona':
      await prisma.aiPersona.delete(
        {
          where:
            {
              id,
            },
        },
      );
      return;
  }
}

// ── restore ───────────────────────────────────────────────────────────────

async function restoreContent(
  type: ModeratableType,
  id: string,
): Promise<void> {
  switch (
    type
  ) {
    case 'rmhark': {
      const post =
        await prisma.rMHark.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                userId: true,
                deletedAt: true,
                deletedByAdmin: true,
                communityId: true,
                content: true,
                createdAt: true,
              },
          },
        );
      if (
        !post?.deletedAt ||
        !post.deletedByAdmin
      )
        throw new ModerationError(
          409,
          'This post was not removed by moderation',
        );
      await prisma.$transaction(
        async (
          tx,
        ) => {
          await tx.rMHark.update(
            {
              where:
                {
                  id,
                },
              data: {
                deletedAt:
                  null,
                deletedByAdmin: false,
                deletedBy:
                  null,
              },
            },
          );
          await linkPostHashtags(
            tx,
            id,
            post.content,
            post.createdAt,
          );
          await tx.user.update(
            {
              where:
                {
                  id: post.userId,
                },
              data: {
                postCount:
                  {
                    increment: 1,
                  },
              },
            },
          );
          if (
            post.communityId
          ) {
            await tx.community.updateMany(
              {
                where:
                  {
                    id: post.communityId,
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
        },
      );
      return;
    }
    case 'comment': {
      const {
        count,
      } =
        await prisma.rMHarkComment.updateMany(
          {
            where:
              {
                id,
                deletedByAdmin: true,
              },
            data: {
              deletedAt:
                null,
              deletedByAdmin: false,
              deletedBy:
                null,
            },
          },
        );
      if (
        count ===
        0
      )
        throw new ModerationError(
          409,
          'This reply was not removed by moderation',
        );
      return;
    }
    case 'vibe': {
      const {
        count,
      } =
        await prisma.vibePage.updateMany(
          {
            where:
              {
                id,
                status:
                  VIBE_REMOVED_STATUS,
              },
            data: {
              status:
                'ready',
            },
          },
        );
      if (
        count ===
        0
      )
        throw new ModerationError(
          409,
          'This vibe was not removed by moderation',
        );
      return;
    }
    default:
      throw new ModerationError(
        400,
        'This kind of content cannot be restored',
      );
  }
}

// ── edit ──────────────────────────────────────────────────────────────────

/** Keep only the fields the type allows, trimmed and capped; reject empty required ones. */
function cleanFields(
  type: ModeratableType,
  fields: Record<
    string,
    string
  >,
): Record<
  string,
  | string
  | null
> {
  const out: Record<
    string,
    | string
    | null
  > =
    {};
  for (const f of EDITABLE_FIELDS[
    type
  ]) {
    if (
      !(
        f.key in
        fields
      )
    )
      continue;
    const v =
      (
        fields[
          f
            .key
        ] ??
        ''
      ).trim();
    if (
      !v &&
      !f.optional
    )
      throw new ModerationError(
        400,
        `${f.label} cannot be empty`,
      );
    if (
      v.length >
      f.max
    )
      throw new ModerationError(
        400,
        `${f.label} is longer than ${f.max} characters`,
      );
    out[
      f.key
    ] =
      v ||
      null;
  }
  if (
    Object.keys(
      out,
    )
      .length ===
    0
  )
    throw new ModerationError(
      400,
      'Nothing to change',
    );
  return out;
}

async function editContent(
  type: ModeratableType,
  id: string,
  raw: Record<
    string,
    string
  >,
): Promise<void> {
  const f =
    cleanFields(
      type,
      raw,
    );
  switch (
    type
  ) {
    case 'rmhark': {
      const post =
        await prisma.rMHark.findUnique(
          {
            where:
              {
                id,
              },
            select:
              {
                content: true,
                unlockPrice: true,
              },
          },
        );
      if (
        !post ||
        f.content ==
          null
      )
        return;
      const editedAt =
        new Date();
      await prisma.$transaction(
        [
          prisma.rMHarkEdit.create(
            {
              data: {
                rmheetId:
                  id,
                content:
                  post.content,
              },
            },
          ),
          prisma.rMHark.update(
            {
              where:
                {
                  id,
                },
              data: {
                content:
                  f.content,
                editedAt,
              },
            },
          ),
        ],
      );
      feedEventBus.publishPostEngagement(
        id,
        {
          type: 'rmhark.edited',
          rmharkId:
            id,
          payload:
            post.unlockPrice &&
            post.unlockPrice >
              0
              ? {
                  id,
                  content:
                    '',
                  locked: true,
                  unlockPrice:
                    post.unlockPrice,
                  edited: true,
                }
              : {
                  id,
                  content:
                    f.content,
                  edited: true,
                },
          timestamp:
            editedAt.toISOString(),
        },
      );
      return;
    }
    case 'comment':
      if (
        f.content ==
        null
      )
        return;
      await prisma.rMHarkComment.update(
        {
          where:
            {
              id,
            },
          data: {
            content:
              f.content,
          },
        },
      );
      return;
    case 'community':
      await prisma.community.update(
        {
          where:
            {
              id,
            },
          data: {
            ...(f.name !=
            null
              ? {
                  name: f.name,
                }
              : {}),
            ...('description' in
            f
              ? {
                  description:
                    f.description,
                }
              : {}),
          },
        },
      );
      return;
    case 'space':
      if (
        f.title ==
        null
      )
        return;
      await prisma.groupCall.updateMany(
        {
          where:
            {
              id,
              title: {
                not: null,
              },
            },
          data: {
            title:
              f.title,
          },
        },
      );
      return;
    case 'vibe':
      await prisma.vibePage.update(
        {
          where:
            {
              id,
            },
          data: {
            ...(f.title !=
            null
              ? {
                  title:
                    f.title,
                }
              : {}),
            ...('description' in
            f
              ? {
                  description:
                    f.description,
                }
              : {}),
          },
        },
      );
      return;
    case 'persona':
      await prisma.aiPersona.update(
        {
          where:
            {
              id,
            },
          data: {
            ...(f.name !=
            null
              ? {
                  name: f.name,
                }
              : {}),
            ...('tagline' in
            f
              ? {
                  tagline:
                    f.tagline,
                }
              : {}),
          },
        },
      );
      return;
  }
}

// ── the one entry point ───────────────────────────────────────────────────

export interface ModerateContentInput {
  adminId: string;
  entityType: ModeratableType;
  entityId: string;
  action: ModerationAction;
  reason: string;
  fields?:
    | Record<
        string,
        string
      >
    | undefined;
  /** Issue a strike against the owner; `expiresDays` omitted = never expires. */
  strike?:
    | {
        expiresDays?:
          | number
          | undefined;
      }
    | undefined;
  /** Time the owner out of a feature; `durationDays` null = permanent. */
  restrict?:
    | {
        feature: RestrictableFeature;
        durationDays:
          | number
          | null;
      }
    | undefined;
}

export async function moderateContent(
  input: ModerateContentInput,
): Promise<ModerateContentResult> {
  const {
    entityType:
      type,
    entityId:
      id,
    action,
  } = input;
  const target =
    await loadTarget(
      type,
      id,
    );
  if (
    !target
  )
    throw new ModerationError(
      404,
      'Content not found',
    );
  if (
    action ===
      'restore' &&
    !RESTORABLE.has(
      type,
    )
  ) {
    throw new ModerationError(
      400,
      'This kind of content cannot be restored',
    );
  }
  if (
    action ===
      'remove' &&
    target.removed
  ) {
    throw new ModerationError(
      409,
      'This has already been removed',
    );
  }

  if (
    action ===
    'remove'
  )
    await removeContent(
      type,
      id,
    );
  else if (
    action ===
    'edit'
  )
    await editContent(
      type,
      id,
      input.fields ??
        {},
    );
  else
    await restoreContent(
      type,
      id,
    );

  await logAdminAction(
    input.adminId,
    `content.${action}`,
    {
      targetType:
        type,
      targetId:
        id,
      detail: `${target.ownerId ? `owner:${target.ownerId} — ` : ''}${input.reason}`,
    },
  );

  const ownerId =
    target.ownerId;
  const notifyOwner =
    !!ownerId &&
    ownerId !==
      input.adminId;
  let strike: ModerateContentResult['strike'];
  let restrictionId:
    | string
    | undefined;

  // A restore is a reversal: it never carries a penalty.
  if (
    ownerId &&
    action !==
      'restore'
  ) {
    if (
      input.strike
    ) {
      const s =
        await issueStrike(
          {
            userId:
              ownerId,
            adminId:
              input.adminId,
            reason:
              input.reason,
            expiresDays:
              input
                .strike
                .expiresDays,
            entityType:
              type,
            entityId:
              id,
            notify: false,
          },
        );
      strike =
        {
          activeStrikes:
            s.activeStrikes,
          autoBanned:
            s.autoBanned,
        };
    }
    if (
      input.restrict
    ) {
      const r =
        await restrictFeature(
          {
            userId:
              ownerId,
            adminId:
              input.adminId,
            feature:
              input
                .restrict
                .feature,
            reason:
              input.reason,
            durationDays:
              input
                .restrict
                .durationDays,
          },
        );
      restrictionId =
        r.id;
    }
  }

  if (
    notifyOwner
  ) {
    const noun =
      TYPE_NOUN[
        type
      ];
    const named =
      target.label
        ? ` “${target.label}”`
        : '';
    const what =
      action ===
      'remove'
        ? `Your ${noun}${named} was removed by site moderation.`
        : action ===
            'edit'
          ? `Your ${noun}${named} was edited by site moderation.`
          : `Your ${noun}${named} was restored by site moderation.`;
    const why =
      action ===
      'restore'
        ? ''
        : ` Reason: ${input.reason}`;
    const strikeNote =
      strike
        ? ' A strike was added to your account; you can review or appeal it in Settings → Account status.'
        : '';
    await createNotification(
      {
        userId:
          ownerId!,
        type: 'SYSTEM',
        entityType:
          'moderation',
        entityId:
          id,
        link: ACCOUNT_STATUS_LINK,
        preview:
          `${what}${why}${strikeNote}`.slice(
            0,
            1000,
          ),
      },
    );
  }

  return {
    success: true,
    action,
    ownerId,
    strike,
    restrictionId,
  };
}
