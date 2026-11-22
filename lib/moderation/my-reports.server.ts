/**
 * Your reports (s03-16): the reports a member filed, as they may see them.
 *
 * - `listMyReports` returns only the caller's rows, only allow-listed columns, and builds each content label with
 *   the caller's current visibility of the content.
 * - `withdrawReport` takes back a PENDING report; the row stays for the reporter's history and leaves the admin
 *   queue (DISMISSED with `withdrawnAt`).
 * - `notifyReportersOfOutcome` tells each reporter once that their report was decided. The admin action and feature
 *   20's bulk decisions both call it after the status change.
 */

import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { createNotification } from '@/lib/notifications.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import type { ReportEntityType, ReportReason } from '@/lib/moderation/report-schema';
import {
  MY_REPORTS_LINK,
  MY_REPORTS_PAGE_SIZE,
  REPORT_OUTCOME_ENTITY_TYPE,
  canWithdraw,
  outcomeOf,
  reporterStatus,
  snippet,
  statusWhere,
  unavailableTarget,
  windowStart,
  type MyReportsFilter,
  type ReportTarget,
} from '@/lib/moderation/my-reports';
import type { MyReport, MyReportsPage } from '@/lib/moderation/my-reports.contract';

type Row = { entityType: string; entityId: string };

const ids = (rows: Row[], type: string) => rows.filter((r) => r.entityType === type).map((r) => r.entityId);

/**
 * What the reporter may see of each reported thing, keyed `type:id`. A post, reply, build or profile that is gone,
 * hidden from them or blocked shows as unavailable (no text, no link); types with nothing safe to show (a direct
 * message, an upload, a score) show only their kind.
 */
async function targetsFor(viewerId: string, rows: Row[]): Promise<Map<string, ReportTarget>> {
  const out = new Map<string, ReportTarget>();
  const set = (kind: ReportEntityType, id: string, target: ReportTarget) => out.set(`${kind}:${id}`, target);

  const postIds = ids(rows, 'rmhark');
  if (postIds.length) {
    const visible = await viewerVisiblePostWhere(viewerId);
    const posts = await prisma.rMHark.findMany({
      where: { id: { in: postIds }, ...visible },
      select: { id: true, content: true },
    });
    for (const p of posts) {
      set('rmhark', p.id, {
        kind: 'rmhark',
        available: true,
        name: snippet(p.content) || null,
        href: `/thread/${p.id}`,
      });
    }
  }

  const commentIds = ids(rows, 'comment');
  if (commentIds.length) {
    const comments = await prisma.rMHarkComment.findMany({
      where: { id: { in: commentIds }, deletedAt: null, rmhark: await viewerVisiblePostWhere(viewerId) },
      select: { id: true, content: true, rmheetId: true },
    });
    for (const c of comments) {
      set('comment', c.id, {
        kind: 'comment',
        available: true,
        name: snippet(c.content) || null,
        href: `/thread/${c.rmheetId}`,
      });
    }
  }

  const userIds = ids(rows, 'user');
  const buildIds = ids(rows, 'build');
  const blocked = userIds.length || buildIds.length ? new Set(await getBlockedAuthorIds(viewerId)) : new Set<string>();
  if (userIds.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: userIds.filter((id) => !blocked.has(id)) }, handle: { not: null } },
      select: { id: true, handle: true },
    });
    for (const u of users) {
      if (u.handle) {
        set('user', u.id, { kind: 'user', available: true, name: `@${u.handle}`, href: `/u/${u.handle}` });
      }
    }
  }

  if (buildIds.length) {
    const builds = await prisma.userBuild.findMany({
      where: {
        id: { in: buildIds },
        OR: [{ visibility: 'PUBLIC', userId: { notIn: [...blocked] } }, { userId: viewerId }],
      },
      select: { id: true, slug: true, title: true },
    });
    for (const b of builds) {
      set('build', b.id, { kind: 'build', available: true, name: snippet(b.title), href: `/builds/${b.slug}` });
    }
  }

  return out;
}

/** Types whose content is looked up above; any other type shows only its kind. */
const LOOKED_UP: ReadonlySet<string> = new Set(['rmhark', 'comment', 'user', 'build']);

export async function listMyReports(
  userId: string,
  opts: { filter?: MyReportsFilter | undefined; cursor?: string | undefined; now?: Date } = {},
): Promise<MyReportsPage> {
  const rows = await prisma.contentReport.findMany({
    where: {
      reporterId: userId,
      createdAt: { gte: windowStart(opts.now ?? new Date()) },
      ...statusWhere(opts.filter ?? 'all'),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MY_REPORTS_PAGE_SIZE + 1,
    ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    // The allow-list: no moderatorNote, resolvedById, resolvedAt or targetUserId ever leaves this query.
    select: {
      id: true,
      reason: true,
      createdAt: true,
      status: true,
      withdrawnAt: true,
      entityType: true,
      entityId: true,
    },
  });
  const hasMore = rows.length > MY_REPORTS_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, MY_REPORTS_PAGE_SIZE) : rows;
  const targets = await targetsFor(userId, page);

  const items: MyReport[] = page.map((r) => {
    const kind = r.entityType as ReportEntityType;
    const status = reporterStatus(r);
    return {
      id: r.id,
      reason: r.reason as ReportReason,
      createdAt: r.createdAt.toISOString(),
      status,
      canWithdraw: canWithdraw(status),
      target: LOOKED_UP.has(r.entityType)
        ? (targets.get(`${r.entityType}:${r.entityId}`) ?? unavailableTarget(kind))
        : { kind, available: true, name: null, href: null },
    };
  });
  return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
}

export type WithdrawResult = 'withdrawn' | 'not_found' | 'not_pending';

/**
 * Withdraw one of the caller's own reports. The ownership and the PENDING check are part of the same conditional
 * update, so a report that is not theirs is `not_found` (the same answer as one that does not exist) and one a
 * moderator already picked up is `not_pending`. The reporter is not notified of their own withdrawal.
 */
export async function withdrawReport(userId: string, reportId: string): Promise<WithdrawResult> {
  const now = new Date();
  const claimed = await prisma.contentReport.updateMany({
    where: { id: reportId, reporterId: userId, status: 'PENDING' },
    data: { status: 'DISMISSED', withdrawnAt: now, reporterNotifiedAt: now },
  });
  if (claimed.count === 1) return 'withdrawn';
  const mine = await prisma.contentReport.findFirst({
    where: { id: reportId, reporterId: userId },
    select: { id: true },
  });
  if (!mine) return 'not_found';
  // Withdrawing twice is the same answer as withdrawing once.
  const again = await prisma.contentReport.findFirst({
    where: { id: reportId, reporterId: userId, withdrawnAt: { not: null } },
    select: { id: true },
  });
  return again ? 'withdrawn' : 'not_pending';
}

/**
 * Tell each reporter, once, that their report was decided. Call it after the status moved to RESOLVED or DISMISSED
 * (the admin action; feature 20's bulk decisions). Safe to call twice and with reports that were not decided: a
 * report is announced only while `reporterNotifiedAt` is null, and the claim that sets it is the same conditional
 * write that decides who sends. A withdrawn report is never announced. The text is the two-word outcome and nothing
 * else: no moderator, note, macro message or action. Returns how many reporters were told.
 */
export async function notifyReportersOfOutcome(reportIds: readonly string[]): Promise<number> {
  if (reportIds.length === 0) return 0;
  const rows = await prisma.contentReport.findMany({
    where: {
      id: { in: [...reportIds] },
      status: { in: ['RESOLVED', 'DISMISSED'] },
      withdrawnAt: null,
      reporterNotifiedAt: null,
    },
    select: { id: true, reporterId: true, status: true, withdrawnAt: true },
  });
  let told = 0;
  for (const row of rows) {
    const outcome = outcomeOf(row);
    if (!outcome) continue;
    const claimed = await prisma.contentReport.updateMany({
      where: { id: row.id, status: row.status, withdrawnAt: null, reporterNotifiedAt: null },
      data: { reporterNotifiedAt: new Date() },
    });
    if (claimed.count !== 1) continue;
    await createNotification({
      userId: row.reporterId,
      type: 'SYSTEM',
      entityType: REPORT_OUTCOME_ENTITY_TYPE,
      entityId: row.id,
      preview: outcome === 'ACTION_TAKEN' ? notice('report-action-taken', {}) : notice('report-no-violation', {}),
      link: MY_REPORTS_LINK,
    });
    told += 1;
  }
  return told;
}

/** Everything the member wrote or caused on the reports they filed, for the account export. */
export async function exportMyReports(userId: string) {
  const rows = await prisma.contentReport.findMany({
    where: { reporterId: userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      entityType: true,
      entityId: true,
      reason: true,
      details: true,
      status: true,
      withdrawnAt: true,
      createdAt: true,
    },
  });
  return rows.map((r) => ({
    id: r.id,
    entityType: r.entityType,
    entityId: r.entityId,
    reason: r.reason,
    details: r.details,
    status: reporterStatus(r),
    withdrawnAt: r.withdrawnAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}
