/**
 * Server side of flag targeting (s04-20): reading and editing a flag's allow and deny lists, explaining a flag
 * for one member, and the flag's history. Every caller is an admin endpoint; nothing here reaches a client except
 * as the DTOs in `targeting.ts`.
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import { explainFlag } from './evaluate';
import { invalidateFlags } from './flags.server';
import {
  HISTORY_PAGE_SIZE,
  MAX_TARGET_IDS,
  applyListEdit,
  describeListEdit,
  type FlagCheckDTO,
  type FlagHistoryPage,
  type FlagTargetingDTO,
  type ListEdit,
  type TargetMember,
} from './targeting';

const UNKNOWN_MEMBER =
  (
    id: string,
  ): TargetMember => ({
    id,
    name: null,
    handle:
      null,
    image:
      null,
  });

/** Members for display, in the order of `ids`; an id with no user row (it cannot happen after erasure) shows bare. */
async function membersOf(
  ids: string[],
): Promise<
  TargetMember[]
> {
  if (
    ids.length ===
    0
  )
    return [];
  const rows =
    await prisma.user.findMany(
      {
        where:
          {
            id: {
              in: ids,
            },
          },
        select:
          userDisplaySelect,
      },
    );
  const byId =
    new Map(
      rows.map(
        (
          row,
        ) => {
          const u =
            resolveUser(
              row,
            );
          return [
            u.id,
            {
              id: u.id,
              name: u.name,
              handle:
                u.handle,
              image:
                u.image,
            },
          ] as const;
        },
      ),
    );
  return ids.map(
    (
      id,
    ) =>
      byId.get(
        id,
      ) ??
      UNKNOWN_MEMBER(
        id,
      ),
  );
}

/** `@handle`, or the bare id for a member without one, for the audit line. */
async function labelsOf(
  ids: string[],
): Promise<
  string[]
> {
  const members =
    await membersOf(
      ids,
    );
  return members.map(
    (
      m,
    ) =>
      m.handle
        ? `@${m.handle}`
        : m.id,
  );
}

export async function getFlagTargeting(
  key: string,
): Promise<FlagTargetingDTO | null> {
  const row =
    await prisma.featureFlag.findUnique(
      {
        where:
          {
            key,
          },
        select:
          {
            allowUserIds: true,
            denyUserIds: true,
          },
      },
    );
  if (
    !row
  )
    return null;
  const [
    allow,
    deny,
  ] =
    await Promise.all(
      [
        membersOf(
          row.allowUserIds,
        ),
        membersOf(
          row.denyUserIds,
        ),
      ],
    );
  return {
    allow,
    deny,
    max: MAX_TARGET_IDS,
  };
}

export type EditOutcome =
  | {
      ok: true;
      targeting: FlagTargetingDTO;
    }
  | {
      ok: false;
      code: 'not-found';
    }
  | {
      ok: false;
      code: 'unknown-handle';
      handles: string[];
    }
  | {
      ok: false;
      code: 'full';
    };

/**
 * Apply an edit whose additions are handles. Resolves the handles to ids, then reads, edits and writes both
 * lists in one transaction under a per-flag lock so two admins cannot overwrite each other or pass the cap. The
 * change is logged with the handles added and removed, and this process drops its flag cache at once.
 */
export async function editFlagTargeting(args: {
  key: string;
  adminId: string;
  list: ListEdit['list'];
  addHandles: string[];
  removeIds: string[];
}): Promise<EditOutcome> {
  const {
    key,
    adminId,
    list,
    addHandles,
    removeIds,
  } =
    args;
  const found =
    addHandles.length
      ? await prisma.user.findMany(
          {
            where:
              {
                handle:
                  {
                    in: addHandles,
                  },
              },
            select:
              {
                id: true,
                handle: true,
              },
          },
        )
      : [];
  const known =
    new Set(
      found.map(
        (
          u,
        ) =>
          u.handle,
      ),
    );
  const unknown =
    addHandles.filter(
      (
        h,
      ) =>
        !known.has(
          h,
        ),
    );
  if (
    unknown.length >
    0
  )
    return {
      ok: false,
      code: 'unknown-handle',
      handles:
        unknown,
    };

  const applied =
    await prisma.$transaction(
      async (
        tx,
      ) => {
        await lockKey(
          tx,
          `flag-targeting:${key}`,
        );
        const row =
          await tx.featureFlag.findUnique(
            {
              where:
                {
                  key,
                },
              select:
                {
                  allowUserIds: true,
                  denyUserIds: true,
                },
            },
          );
        if (
          !row
        )
          return null;
        const result =
          applyListEdit(
            {
              allow:
                row.allowUserIds,
              deny: row.denyUserIds,
            },
            {
              list,
              add: found.map(
                (
                  u,
                ) =>
                  u.id,
              ),
              remove:
                removeIds,
            },
          );
        if (
          !result.ok
        )
          return result;
        await tx.featureFlag.update(
          {
            where:
              {
                key,
              },
            data: {
              allowUserIds:
                {
                  set: result
                    .lists
                    .allow,
                },
              denyUserIds:
                {
                  set: result
                    .lists
                    .deny,
                },
              updatedBy:
                adminId,
            },
          },
        );
        return result;
      },
    );
  if (
    !applied
  )
    return {
      ok: false,
      code: 'not-found',
    };
  if (
    !applied.ok
  )
    return {
      ok: false,
      code: 'full',
    };

  invalidateFlags();
  const [
    added,
    removed,
    moved,
  ] =
    await Promise.all(
      [
        labelsOf(
          applied.added,
        ),
        labelsOf(
          applied.removed,
        ),
        labelsOf(
          applied.moved,
        ),
      ],
    );
  const detail =
    describeListEdit(
      list,
      {
        added,
        removed,
        moved,
      },
    );
  if (
    detail
  ) {
    await logAdminAction(
      adminId,
      'flag.targeting',
      {
        targetType:
          'feature_flag',
        targetId:
          key,
        detail,
      },
    );
  }
  const [
    allow,
    deny,
  ] =
    await Promise.all(
      [
        membersOf(
          applied
            .lists
            .allow,
        ),
        membersOf(
          applied
            .lists
            .deny,
        ),
      ],
    );
  return {
    ok: true,
    targeting:
      {
        allow,
        deny,
        max: MAX_TARGET_IDS,
      },
  };
}

/** How the stored flag resolves for the member with this handle; `null` when the flag or the member is missing. */
export async function checkFlagForHandle(
  key: string,
  handle: string,
): Promise<FlagCheckDTO | null> {
  const [
    flag,
    user,
  ] =
    await Promise.all(
      [
        prisma.featureFlag.findUnique(
          {
            where:
              {
                key,
              },
            select:
              {
                key: true,
                enabled: true,
                rolloutPercent: true,
                allowUserIds: true,
                denyUserIds: true,
              },
          },
        ),
        prisma.user.findUnique(
          {
            where:
              {
                handle,
              },
            select:
              userDisplaySelect,
          },
        ),
      ],
    );
  if (
    !flag ||
    !user
  )
    return null;
  const u =
    resolveUser(
      user,
    );
  const {
    on,
    reason,
  } =
    explainFlag(
      {
        key: flag.key,
        enabled:
          flag.enabled,
        rolloutPercent:
          flag.rolloutPercent,
      },
      u.id,
      {
        allow:
          new Set(
            flag.allowUserIds,
          ),
        deny: new Set(
          flag.denyUserIds,
        ),
      },
    );
  return {
    member:
      {
        id: u.id,
        name: u.name,
        handle:
          u.handle,
        image:
          u.image,
      },
    on,
    reason,
  };
}

/** The flag's admin audit entries, newest first. */
export async function flagHistory(
  key: string,
  cursor:
    | string
    | undefined,
): Promise<FlagHistoryPage> {
  const rows =
    await prisma.adminAuditLog.findMany(
      {
        where:
          {
            targetType:
              'feature_flag',
            targetId:
              key,
          },
        orderBy:
          [
            {
              createdAt:
                'desc',
            },
            {
              id: 'desc',
            },
          ],
        take:
          HISTORY_PAGE_SIZE +
          1,
        ...(cursor
          ? {
              skip: 1,
              cursor:
                {
                  id: cursor,
                },
            }
          : {}),
        include:
          {
            admin:
              {
                select:
                  userDisplaySelect,
              },
          },
      },
    );
  const hasMore =
    rows.length >
    HISTORY_PAGE_SIZE;
  const page =
    hasMore
      ? rows.slice(
          0,
          HISTORY_PAGE_SIZE,
        )
      : rows;
  return {
    items:
      page.map(
        (
          r,
        ) => {
          const a =
            resolveUser(
              r.admin,
            );
          return {
            id: r.id,
            action:
              r.action,
            detail:
              r.detail,
            createdAt:
              r.createdAt.toISOString(),
            admin:
              {
                id: a.id,
                name: a.name,
                handle:
                  a.handle,
                image:
                  a.image,
              },
          };
        },
      ),
    nextCursor:
      hasMore
        ? (page[
            page.length -
              1
          ]
            ?.id ??
          null)
        : null,
  };
}

/**
 * Erasure: take a member's id out of every flag's allow and deny lists. Account deletion anonymises the user row
 * in place, so nothing cascades into these arrays. A pre-transaction step like `releaseSeatsOf`: it reads the
 * flags that name the member, then rewrites only those rows (idempotent, so a re-run of a failed sweep is safe).
 * Model calls rather than raw SQL, and the `Array.isArray` guard lets the erasure tests' recording stub through.
 */
export async function removeMemberFromFlagLists(
  userId: string,
): Promise<void> {
  const rows = await prisma.featureFlag.findMany({
    where: {
      OR: [
        { allowUserIds: { has: userId } },
        { denyUserIds: { has: userId } },
      ],
    },
    select: { key: true, allowUserIds: true, denyUserIds: true },
  });
  if (!Array.isArray(rows) || rows.length === 0) return;
  await prisma.$transaction(
    rows.map((row) =>
      prisma.featureFlag.update({
        where: { key: row.key },
        data: {
          allowUserIds: row.allowUserIds.filter((id) => id !== userId),
          denyUserIds: row.denyUserIds.filter((id) => id !== userId),
        },
      }),
    ),
  );
  invalidateFlags();
}
