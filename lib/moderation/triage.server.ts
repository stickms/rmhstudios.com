/**
 * Moderation queue triage (s03-20): the grouped queue and the one decision function behind every report decision.
 *
 * - `listReportGroups` groups reports by target in SQL (`groupBy` on `entityType, entityId`), then reads the page's
 *   reasons, individual reports and reporter records with one query each.
 * - `decideReports(ids, decision)` is the single path: the admin endpoint for one report and the group endpoint
 *   for many both call it, so takedown, the macro message, the compare-and-set, the reporter notification (16) and the
 *   audit row cannot drift apart.
 */

import type {
  Prisma,
  ReportStatus,
} from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { clearPinnedForComment } from '@/lib/feed/conversation-controls.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { takedownStamp } from '@/lib/profile/stamps.server';
import { createNotification } from '@/lib/notifications.server';
import { takedownRing } from '@/lib/profile/webrings.server';
import { hideMusicContent } from '@/lib/rmhmusic/learn/moderation.server';
import { notifyReportersOfOutcome } from '@/lib/moderation/my-reports.server';
import { noteCountsFor } from '@/lib/moderation/notes.server';
import {
  snippet,
  windowStart,
} from '@/lib/moderation/my-reports';
import {
  resolveUser,
  userDisplaySelect,
} from '@/lib/user-display';
import type { ReportReason } from '@/lib/moderation/report-schema';
import {
  GROUPS_PAGE_SIZE,
  MAX_COUNTED_GROUPS,
  MAX_DECIDE_REPORTS,
  MAX_REPORTS_PER_GROUP_SHOWN,
} from '@/lib/moderation/triage-schema';
import {
  groupKey,
  groupReliability,
  nextOffset,
  reasonsByGroup,
  reporterRecord,
  tallyReporters,
  type TriageFilters,
} from '@/lib/moderation/triage';
import type {
  ReportGroupRow,
  ReportGroupsPage,
} from '@/lib/moderation/triage.contract';

/* ------------------------------ the decision ------------------------------ */

export type ReportAction =
  | 'review'
  | 'resolve'
  | 'dismiss';

const STATUS_BY_ACTION =
  {
    review:
      'REVIEWING',
    resolve:
      'RESOLVED',
    dismiss:
      'DISMISSED',
  } as const;

/**
 * The report lifecycle: PENDING → REVIEWING → RESOLVED | DISMISSED (PENDING may
 * skip straight to either terminal state). RESOLVED and DISMISSED are terminal.
 */
const ALLOWED_FROM: Record<
  (typeof STATUS_BY_ACTION)[ReportAction],
  readonly ReportStatus[]
> =
  {
    REVIEWING:
      [
        'PENDING',
      ],
    RESOLVED:
      [
        'PENDING',
        'REVIEWING',
      ],
    DISMISSED:
      [
        'PENDING',
        'REVIEWING',
      ],
  };

/**
 * Take reported content down. Throws on a real failure so the caller can leave
 * the report open; content that is already gone is not a failure. A post or
 * comment is stamped `deletedBy: 'moderator'` as well as `deletedByAdmin`, so a
 * row the author had already put in the bin stops being restorable from it.
 */
export async function takedownReportedContent(
  entityType: string,
  entityId: string,
): Promise<void> {
  const now =
    new Date();
  if (
    entityType ===
    'rmhark'
  ) {
    await prisma.$transaction(
      [
        prisma.rMHark.updateMany(
          {
            where:
              {
                id: entityId,
                deletedAt:
                  null,
              },
            data: {
              deletedAt:
                now,
            },
          },
        ),
        prisma.rMHark.updateMany(
          {
            where:
              {
                id: entityId,
              },
            data: {
              deletedByAdmin: true,
              deletedBy:
                'moderator',
            },
          },
        ),
      ],
    );
  } else if (
    entityType ===
    'comment'
  ) {
    await prisma.$transaction(
      [
        prisma.rMHarkComment.updateMany(
          {
            where:
              {
                id: entityId,
                deletedAt:
                  null,
              },
            data: {
              deletedAt:
                now,
            },
          },
        ),
        prisma.rMHarkComment.updateMany(
          {
            where:
              {
                id: entityId,
              },
            data: {
              deletedByAdmin: true,
              deletedBy:
                'moderator',
            },
          },
        ),
      ],
    );
    await clearPinnedForComment(entityId);
  } else if (
    entityType ===
    'stamp'
  ) {
    await takedownStamp(
      entityId,
    );
  } else if (
    entityType ===
    'webring'
  ) {
    await takedownRing(
      entityId,
    );
  } else if (
    entityType ===
    'ladder-interview'
  ) {
    await prisma.ladderInterviewReport.updateMany(
      {
        where:
          {
            id: entityId,
          },
        data: {
          status:
            'hidden',
        },
      },
    );
  } else if (
    entityType ===
      'music-score' ||
    entityType ===
      'music-share'
  ) {
    // RMH Music: a Daily score leaves every board (kept as the learner's result); a shared
    // result link and its card go dark.
    await hideMusicContent(
      entityType,
      entityId,
      now,
    );
  }
}

export interface Decision {
  action: ReportAction;
  moderatorId: string;
  note?:
    | string
    | undefined;
  /** Macro-filled message sent to the reported author as a notification (resolve only). */
  message?:
    | string
    | undefined;
  /** Take the reported content down while resolving. */
  deleteContent?:
    | boolean
    | undefined;
}

export interface DecideResult {
  status: ReportStatus;
  /** Reports moved to the new status by this call. */
  decided: string[];
  /** Ids that match no report. */
  missing: string[];
  /** Reports left alone: `status` is what they already were, null when another moderator won the race. */
  skipped: {
    id: string;
    status: ReportStatus | null;
  }[];
  /** Targets whose takedown failed; their reports were left open. */
  takedownFailed: {
    entityType: string;
    entityId: string;
  }[];
}

/**
 * Decide reports. Each report is claimed with a compare-and-set on the status it was read in, all in one batch
 * transaction, so a report another moderator decided meanwhile is skipped rather than overwritten. The takedown runs
 * once per target before the claim; a failed takedown leaves that target's reports open (resolving them with the
 * content still up would drop them from the queue). The reported author is messaged once per target and each
 * reporter is told the outcome once (16). One audit row is written per target.
 */
export async function decideReports(
  ids: readonly string[],
  decision: Decision,
): Promise<DecideResult> {
  const newStatus =
    STATUS_BY_ACTION[
      decision
        .action
    ];
  const terminal =
    newStatus ===
      'RESOLVED' ||
    newStatus ===
      'DISMISSED';
  const from =
    ALLOWED_FROM[
      newStatus
    ];
  const result: DecideResult =
    {
      status:
        newStatus,
      decided:
        [],
      missing:
        [],
      skipped:
        [],
      takedownFailed:
        [],
    };

  const rows =
    await prisma.contentReport.findMany(
      {
        where:
          {
            id: {
              in: [
                ...ids,
              ],
            },
          },
        select:
          {
            id: true,
            status: true,
            entityType: true,
            entityId: true,
            targetUserId: true,
            moderatorNote: true,
          },
      },
    );
  const found =
    new Set(
      rows.map(
        (
          r,
        ) =>
          r.id,
      ),
    );
  result.missing =
    ids.filter(
      (
        id,
      ) =>
        !found.has(
          id,
        ),
    );

  let eligible =
    rows.filter(
      (
        r,
      ) =>
        from.includes(
          r.status,
        ),
    );
  for (const r of rows)
    if (
      !from.includes(
        r.status,
      )
    )
      result.skipped.push(
        {
          id: r.id,
          status:
            r.status,
        },
      );

  if (
    decision.deleteContent &&
    decision.action ===
      'resolve'
  ) {
    const failed =
      new Set<string>();
    for (const target of new Set(
      eligible.map(
        (
          r,
        ) =>
          groupKey(
            r.entityType,
            r.entityId,
          ),
      ),
    )) {
      const sample =
        eligible.find(
          (
            r,
          ) =>
            groupKey(
              r.entityType,
              r.entityId,
            ) ===
            target,
        );
      if (
        !sample
      )
        continue;
      try {
        await takedownReportedContent(
          sample.entityType,
          sample.entityId,
        );
      } catch (e) {
        console.error(
          'Report content takedown failed:',
          e,
        );
        failed.add(
          target,
        );
        result.takedownFailed.push(
          {
            entityType:
              sample.entityType,
            entityId:
              sample.entityId,
          },
        );
      }
    }
    eligible =
      eligible.filter(
        (
          r,
        ) =>
          !failed.has(
            groupKey(
              r.entityType,
              r.entityId,
            ),
          ),
      );
  }

  if (
    eligible.length ===
    0
  )
    return result;

  const now =
    new Date();
  const counts =
    await prisma.$transaction(
      eligible.map(
        (
          r,
        ) =>
          prisma.contentReport.updateMany(
            {
              where:
                {
                  id: r.id,
                  status:
                    {
                      in: [
                        ...from,
                      ],
                    },
                },
              data: {
                status:
                  newStatus,
                moderatorNote:
                  decision.note?.trim() ||
                  decision.message ||
                  r.moderatorNote,
                // REVIEWING is not a resolution: never carry a resolver/time on it.
                resolvedById:
                  terminal
                    ? decision.moderatorId
                    : null,
                resolvedAt:
                  terminal
                    ? now
                    : null,
              },
            },
          ),
      ),
    );
  const claimed =
    eligible.filter(
      (
        _,
        i,
      ) =>
        counts[
          i
        ]
          ?.count ===
        1,
    );
  result.decided =
    claimed.map(
      (
        r,
      ) =>
        r.id,
    );
  for (const [
    i,
    r,
  ] of eligible.entries())
    if (
      counts[
        i
      ]
        ?.count !==
      1
    )
      result.skipped.push(
        {
          id: r.id,
          status:
            null,
        },
      );
  if (
    claimed.length ===
    0
  )
    return result;

  const byTarget =
    new Map<
      string,
      typeof claimed
    >();
  for (const r of claimed) {
    const key =
      groupKey(
        r.entityType,
        r.entityId,
      );
    byTarget.set(
      key,
      [
        ...(byTarget.get(
          key,
        ) ??
          []),
        r,
      ],
    );
  }

  if (
    decision.message &&
    decision.action ===
      'resolve'
  ) {
    for (const reports of byTarget.values()) {
      const first =
        reports[0];
      if (
        !first?.targetUserId
      )
        continue;
      await createNotification(
        {
          userId:
            first.targetUserId,
          type: 'SYSTEM',
          entityType:
            'report',
          entityId:
            first.id,
          preview:
            decision.message,
        },
      );
    }
  }

  // s03-16: each reporter hears the outcome once. A failure here must not undo the decision.
  if (
    terminal
  ) {
    try {
      await notifyReportersOfOutcome(
        result.decided,
      );
    } catch (e) {
      console.error(
        'Reporter outcome notification failed:',
        e,
      );
    }
  }

  for (const reports of byTarget.values()) {
    const first =
      reports[0];
    if (
      !first
    )
      continue;
    const details =
      [
        reports.length >
        1
          ? `${reports.length} reports`
          : null,
        decision.deleteContent
          ? 'content removed'
          : null,
      ].filter(
        Boolean,
      );
    await logAdminAction(
      decision.moderatorId,
      `report.${decision.action}`,
      {
        targetType:
          first.entityType,
        targetId:
          first.entityId,
        detail:
          details.length
            ? details.join(
                ', ',
              )
            : undefined,
      },
    );
  }
  return result;
}

export type DecideTarget =
  {
    entityType: string;
    entityId: string;
  };

/**
 * The open reports of the listed targets. Returns null when there are more than the per-request cap, so the caller
 * refuses instead of deciding a part of a group.
 */
export async function openReportIds(
  targets: readonly DecideTarget[],
): Promise<
  | string[]
  | null
> {
  const rows =
    await prisma.contentReport.findMany(
      {
        where:
          {
            status:
              {
                in: [
                  'PENDING',
                  'REVIEWING',
                ],
              },
            OR: targets.map(
              (
                t,
              ) => ({
                entityType:
                  t.entityType,
                entityId:
                  t.entityId,
              }),
            ),
          },
        select:
          {
            id: true,
          },
        take:
          MAX_DECIDE_REPORTS +
          1,
      },
    );
  return rows.length >
    MAX_DECIDE_REPORTS
    ? null
    : rows.map(
        (
          r,
        ) =>
          r.id,
      );
}

/* -------------------------------- the queue -------------------------------- */

/** Only aggregates and the `by` fields: Prisma's groupBy typing rejects any other orderBy key. */
type GroupOrder =
  Pick<
    Prisma.ContentReportOrderByWithAggregationInput,
    | '_count'
    | '_min'
    | '_max'
    | 'entityType'
    | 'entityId'
  >;

const orderFor =
  (
    sort: TriageFilters['sort'],
  ): GroupOrder[] => {
    const tail: GroupOrder[] =
      [
        {
          entityType:
            'asc',
        },
        {
          entityId:
            'asc',
        },
      ];
    if (
      sort ===
      'oldest'
    )
      return [
        {
          _min: {
            createdAt:
              'asc',
          },
        },
        ...tail,
      ];
    if (
      sort ===
      'newest'
    )
      return [
        {
          _max: {
            createdAt:
              'desc',
          },
        },
        ...tail,
      ];
    return [
      {
        _count:
          {
            id: 'desc',
          },
      },
      {
        _max: {
          createdAt:
            'desc',
        },
      },
      ...tail,
    ];
  };

/** A snippet of each reported post or reply, keyed `type:id`. Other kinds have nothing safe to show here. */
async function previewsFor(
  targets: readonly DecideTarget[],
): Promise<
  Map<
    string,
    string
  >
> {
  const out =
    new Map<
      string,
      string
    >();
  const idsOf =
    (
      type: string,
    ) =>
      targets
        .filter(
          (
            t,
          ) =>
            t.entityType ===
            type,
        )
        .map(
          (
            t,
          ) =>
            t.entityId,
        );
  const postIds =
    idsOf(
      'rmhark',
    );
  const commentIds =
    idsOf(
      'comment',
    );
  const [
    posts,
    comments,
  ] =
    await Promise.all(
      [
        postIds.length
          ? prisma.rMHark.findMany(
              {
                where:
                  {
                    id: {
                      in: postIds,
                    },
                  },
                select:
                  {
                    id: true,
                    content: true,
                  },
              },
            )
          : [],
        commentIds.length
          ? prisma.rMHarkComment.findMany(
              {
                where:
                  {
                    id: {
                      in: commentIds,
                    },
                  },
                select:
                  {
                    id: true,
                    content: true,
                  },
              },
            )
          : [],
      ],
    );
  for (const p of posts)
    out.set(
      groupKey(
        'rmhark',
        p.id,
      ),
      snippet(
        p.content,
        160,
      ),
    );
  for (const c of comments)
    out.set(
      groupKey(
        'comment',
        c.id,
      ),
      snippet(
        c.content,
        160,
      ),
    );
  return out;
}

export async function listReportGroups(
  filters: TriageFilters,
): Promise<ReportGroupsPage> {
  const where: Prisma.ContentReportWhereInput =
    {
      status:
        filters.status,
      ...(filters.entityType
        ? {
            entityType:
              filters.entityType,
          }
        : {}),
      ...(filters
        .reasons
        .length
        ? {
            reason:
              {
                in: filters.reasons,
              },
          }
        : {}),
    };
  const by =
    [
      'entityType',
      'entityId',
    ] as const;
  const having:
    | Prisma.ContentReportScalarWhereWithAggregatesInput
    | undefined =
    filters.min >
    1
      ? {
          id: {
            _count:
              {
                gte: filters.min,
              },
          },
        }
      : undefined;

  const [
    allGroups,
    rawGroups,
    statusCounts,
  ] =
    await Promise.all(
      [
        // The total is capped: counting every group of a huge queue must not read it all.
        prisma.contentReport.groupBy(
          {
            by: [
              ...by,
            ],
            where,
            ...(having
              ? {
                  having,
                }
              : {}),
            orderBy:
              [
                {
                  entityType:
                    'asc',
                },
                {
                  entityId:
                    'asc',
                },
              ],
            take: MAX_COUNTED_GROUPS,
          },
        ),
        prisma.contentReport.groupBy(
          {
            by: [
              ...by,
            ],
            where,
            ...(having
              ? {
                  having,
                }
              : {}),
            _count:
              {
                id: true,
              },
            _min: {
              createdAt: true,
            },
            _max: {
              createdAt: true,
            },
            orderBy:
              orderFor(
                filters.sort,
              ),
            skip: filters.offset,
            take:
              GROUPS_PAGE_SIZE +
              1,
          },
        ),
        prisma.contentReport.groupBy(
          {
            by: [
              'status',
            ],
            _count:
              {
                _all: true,
              },
          },
        ),
      ],
    );
  const counts: Record<
    string,
    number
  > =
    {};
  for (const c of statusCounts)
    counts[
      c.status
    ] =
      c._count._all;

  const more =
    rawGroups.length >
    GROUPS_PAGE_SIZE;
  const page =
    more
      ? rawGroups.slice(
          0,
          GROUPS_PAGE_SIZE,
        )
      : rawGroups;
  const base =
    {
      totalGroups:
        allGroups.length,
      nextCursor:
        nextOffset(
          filters.offset,
          more,
        ),
      counts,
    };
  if (
    page.length ===
    0
  )
    return {
      ...base,
      groups:
        [],
    };

  const targets =
    page.map(
      (
        g,
      ) => ({
        entityType:
          g.entityType,
        entityId:
          g.entityId,
      }),
    );
  const [
    reasonRows,
    reportLists,
    previews,
  ] =
    await Promise.all(
      [
        prisma.contentReport.groupBy(
          {
            by: [
              'entityType',
              'entityId',
              'reason',
            ],
            where:
              {
                ...where,
                OR: targets,
              },
            _count:
              {
                id: true,
              },
          },
        ),
        Promise.all(
          targets.map(
            (
              t,
            ) =>
              prisma.contentReport.findMany(
                {
                  where:
                    {
                      ...where,
                      entityType:
                        t.entityType,
                      entityId:
                        t.entityId,
                    },
                  orderBy:
                    {
                      createdAt:
                        'desc',
                    },
                  take: MAX_REPORTS_PER_GROUP_SHOWN,
                  include:
                    {
                      reporter:
                        {
                          select:
                            userDisplaySelect,
                        },
                    },
                },
              ),
          ),
        ),
        previewsFor(
          targets,
        ),
      ],
    );

  const reporterIds =
    [
      ...new Set(
        reportLists
          .flat()
          .map(
            (
              r,
            ) =>
              r.reporterId,
          ),
      ),
    ];
  const targetUserIds =
    [
      ...new Set(
        reportLists
          .flat()
          .map(
            (
              r,
            ) =>
              r.targetUserId,
          )
          .filter(
            (
              id,
            ): id is string =>
              !!id,
          ),
      ),
    ];
  const [
    reporterCounts,
    targetUsers,
  ] =
    await Promise.all(
      [
        reporterIds.length
          ? prisma.contentReport.groupBy(
              {
                by: [
                  'reporterId',
                  'status',
                ],
                where:
                  {
                    reporterId:
                      {
                        in: reporterIds,
                      },
                    status:
                      {
                        in: [
                          'RESOLVED',
                          'DISMISSED',
                        ],
                      },
                    // A withdrawn report is not a moderator's decision about the reporter.
                    withdrawnAt:
                      null,
                    createdAt:
                      {
                        gte: windowStart(
                          new Date(),
                        ),
                      },
                  },
                _count:
                  {
                    _all: true,
                  },
              },
            )
          : [],
        targetUserIds.length
          ? prisma.user.findMany(
              {
                where:
                  {
                    id: {
                      in: targetUserIds,
                    },
                  },
                select:
                  userDisplaySelect,
              },
            )
          : [],
      ],
    );
  // s03-04: one groupBy for the visible members' moderator-note counts.
  const noteCounts =
    await noteCountsFor(
      targetUserIds,
    );
  const tallies =
    tallyReporters(
      reporterCounts.map(
        (
          r,
        ) => ({
          reporterId:
            r.reporterId,
          status:
            r.status,
          count:
            r
              ._count
              ._all,
        }),
      ),
    );
  const targetUserMap =
    new Map(
      targetUsers.map(
        (
          u,
        ) => [
          u.id,
          resolveUser(
            u,
          ),
        ],
      ),
    );
  const reasons =
    reasonsByGroup(
      reasonRows.map(
        (
          r,
        ) => ({
          entityType:
            r.entityType,
          entityId:
            r.entityId,
          reason:
            r.reason as ReportReason,
          count:
            r
              ._count
              .id,
        }),
      ),
    );

  const groups: ReportGroupRow[] =
    page.map(
      (
        g,
        i,
      ) => {
        const key =
          groupKey(
            g.entityType,
            g.entityId,
          );
        const reports =
          reportLists[
            i
          ] ??
          [];
        const owner =
          reports.find(
            (
              r,
            ) =>
              r.targetUserId,
          )?.targetUserId;
        return {
          entityType:
            g.entityType,
          entityId:
            g.entityId,
          count:
            g
              ._count
              .id,
          reasons:
            reasons.get(
              key,
            ) ??
            [],
          firstAt:
            (
              g
                ._min
                .createdAt ??
              new Date(
                0,
              )
            ).toISOString(),
          lastAt:
            (
              g
                ._max
                .createdAt ??
              new Date(
                0,
              )
            ).toISOString(),
          preview:
            previews.get(
              key,
            ) ??
            null,
          targetUser:
            owner
              ? (targetUserMap.get(
                  owner,
                ) ??
                null)
              : null,
          targetNoteCount:
            (owner &&
              noteCounts.get(
                owner,
              )) ||
            0,
          reliability:
            groupReliability(
              reports.map(
                (
                  r,
                ) =>
                  r.reporterId,
              ),
              tallies,
            ),
          reports:
            reports.map(
              (
                r,
              ) => ({
                id: r.id,
                reason:
                  r.reason,
                details:
                  r.details,
                status:
                  r.status,
                withdrawn:
                  r.withdrawnAt !==
                  null,
                createdAt:
                  r.createdAt.toISOString(),
                reporter:
                  resolveUser(
                    r.reporter,
                  ),
                reporterRecord:
                  reporterRecord(
                    tallies.get(
                      r.reporterId,
                    ),
                  ),
              }),
            ),
        };
      },
    );
  return {
    ...base,
    groups,
  };
}
