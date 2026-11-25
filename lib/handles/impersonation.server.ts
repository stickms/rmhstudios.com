/**
 * Impersonation reports (J2) — filing and the moderator's comparison view.
 *
 * Rides `ContentReport` (no schema change was available); see
 * `lib/handles/impersonation.ts` for how the impersonated account is carried.
 */

import { prisma } from '@/lib/prisma.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { notice } from '@/lib/notifications/notice-keys';
import { listProfileLinks } from '@/lib/profile-links/links.server';
import { getPreviouslyKnownAs } from '@/lib/handles/history.server';
import {
  IMPERSONATION_ENTITY_TYPE,
  encodeImpersonationDetails,
  nameSimilarity,
  parseImpersonationDetails,
  impersonationPreviewLine,
  type ImpersonationComparison,
  type ImpersonationComparisonSide,
} from '@/lib/handles/impersonation';

export type FileImpersonationResult =
  | { ok: true; reportId: string; alreadyReported: boolean }
  | { ok: false; reason: 'unknown-account' | 'same-account' | 'self-report'; message: string };

/**
 * File an impersonation report.
 *
 * Both accounts are resolved before anything is written: a report whose "impersonated account" does not exist is not
 * evidence, it is a free-text note with extra steps. The impersonated account arrives as an id (the reporter's own, for
 * "Me") or as a handle, which is looked up here.
 */
export async function fileImpersonationReport(
  reporterId: string,
  input: { accusedUserId: string; impersonatedUserId?: string; impersonatedHandle?: string; note?: string },
): Promise<FileImpersonationResult> {
  const { accusedUserId, impersonatedHandle, note } = input;

  const [accused, impersonated] = await Promise.all([
    prisma.user.findUnique({ where: { id: accusedUserId }, select: { id: true } }),
    impersonatedHandle !== undefined
      ? prisma.user.findUnique({ where: { handle: impersonatedHandle }, select: { id: true, handle: true } })
      : input.impersonatedUserId !== undefined
        ? prisma.user.findUnique({ where: { id: input.impersonatedUserId }, select: { id: true, handle: true } })
        : Promise.resolve(null),
  ]);
  if (!accused || !impersonated) {
    return { ok: false, reason: 'unknown-account', message: 'Account not found' };
  }

  if (accused.id === impersonated.id) {
    return {
      ok: false,
      reason: 'same-account',
      message: 'An account cannot impersonate itself',
    };
  }
  if (accused.id === reporterId) {
    return {
      ok: false,
      reason: 'self-report',
      message: 'You cannot report your own account for impersonating someone',
    };
  }

  // One open impersonation report per (reporter, accused) — the same
  // deduplication `POST /api/moderation/report` applies, so a frustrated
  // reporter pressing the button four times does not become four queue items.
  // The check and the insert run under a transaction-scoped advisory lock on
  // the pair, so two requests sent together cannot both pass the check.
  const filed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`impersonation-report:${reporterId}:${accused.id}`}))`;
    const existing = await tx.contentReport.findFirst({
      where: {
        reporterId,
        entityType: IMPERSONATION_ENTITY_TYPE,
        entityId: accused.id,
        status: { in: ['PENDING', 'REVIEWING'] },
      },
      select: { id: true },
    });
    if (existing) return { reportId: existing.id, alreadyReported: true };

    const report = await tx.contentReport.create({
      data: {
        reporterId,
        entityType: IMPERSONATION_ENTITY_TYPE,
        entityId: accused.id,
        // `OTHER` because `ReportReason` has no IMPERSONATION member and adding
        // one is a schema change. `entityType` carries the category instead.
        reason: 'OTHER',
        details: encodeImpersonationDetails({
          impersonatedUserId: impersonated.id,
          impersonatedHandle: impersonated.handle,
          note,
        }),
        targetUserId: accused.id,
      },
      select: { id: true },
    });
    return { reportId: report.id, alreadyReported: false };
  });
  if (filed.alreadyReported) return { ok: true, reportId: filed.reportId, alreadyReported: true };

  void notifyAdminsOfReview({
    notice: notice('admin-review-impersonation', {}),
    kind: 'reports',
  });

  return { ok: true, reportId: filed.reportId, alreadyReported: false };
}

async function comparisonSide(userId: string): Promise<ImpersonationComparisonSide | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, handle: true, name: true, image: true, createdAt: true },
  });
  if (!user) return null;

  const [former, links] = await Promise.all([
    getPreviouslyKnownAs(user.id, { currentHandle: user.handle }),
    listProfileLinks(user.id),
  ]);

  return {
    userId: user.id,
    handle: user.handle,
    name: user.name,
    image: user.image,
    createdAt: user.createdAt.toISOString(),
    previousHandles: former.map((entry) => ({
      handle: entry.handle,
      changedAt: entry.changedAt.toISOString(),
    })),
    claimedHosts: links
      .filter((link) => link.host)
      .map((link) => ({ host: link.host as string, verified: link.verifiedAt !== null })),
  };
}

/**
 * Build the side-by-side a moderator opens the report with.
 *
 * Everything here is a fact about the two accounts — creation dates, former
 * handles, claimed domains and which of them are proven. It draws no
 * conclusion: an account that claims a domain it has not verified while the
 * other has verified it is *evidence*, not a verdict.
 */
export async function getImpersonationComparison(
  reportId: string,
): Promise<ImpersonationComparison | null> {
  const report = await prisma.contentReport.findUnique({
    where: { id: reportId },
    select: { id: true, entityType: true, entityId: true, details: true },
  });
  if (!report || report.entityType !== IMPERSONATION_ENTITY_TYPE) return null;

  const parsed = parseImpersonationDetails(report.details);
  const [accused, impersonated] = await Promise.all([
    comparisonSide(report.entityId),
    parsed ? comparisonSide(parsed.impersonatedUserId) : Promise.resolve(null),
  ]);

  const impersonatedHosts = new Map(
    (impersonated?.claimedHosts ?? []).map((entry) => [entry.host, entry.verified]),
  );
  const contestedHosts = (accused?.claimedHosts ?? [])
    .filter((entry) => impersonatedHosts.has(entry.host))
    .map((entry) => ({
      host: entry.host,
      accusedVerified: entry.verified,
      impersonatedVerified: impersonatedHosts.get(entry.host) ?? false,
    }));

  return {
    reportId: report.id,
    note: parsed?.note ?? report.details ?? '',
    accused,
    impersonated,
    nameSimilarity: nameSimilarity(accused?.name, impersonated?.name),
    contestedHosts,
  };
}

/**
 * The line the queue shows for each reported account: who it is said to be pretending to be, read from the stored
 * header of its open impersonation reports. Admin queue only. Keyed by the accused account's id.
 */
export async function impersonationPreviews(accusedIds: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (accusedIds.length === 0) return out;
  const rows = await prisma.contentReport.findMany({
    where: { entityType: IMPERSONATION_ENTITY_TYPE, entityId: { in: [...accusedIds] }, status: { in: ['PENDING', 'REVIEWING'] } },
    select: { entityId: true, details: true },
    orderBy: { createdAt: 'asc' },
    take: 500,
  });
  const byAccused = new Map<string, (string | null)[]>();
  for (const row of rows) byAccused.set(row.entityId, [...(byAccused.get(row.entityId) ?? []), row.details]);
  for (const id of accusedIds) out.set(id, impersonationPreviewLine(byAccused.get(id) ?? []));
  return out;
}
