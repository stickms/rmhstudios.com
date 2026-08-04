/**
 * Impersonation reports (J2) — filing and the moderator's comparison view.
 *
 * Rides `ContentReport` (no schema change was available); see
 * `lib/handles/impersonation.ts` for how the impersonated account is carried.
 */

import { prisma } from '@/lib/prisma.server';
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { listProfileLinks } from '@/lib/profile-links/links.server';
import { getPreviouslyKnownAs } from '@/lib/handles/history.server';
import {
  IMPERSONATION_ENTITY_TYPE,
  encodeImpersonationDetails,
  nameSimilarity,
  parseImpersonationDetails,
  type ImpersonationComparisonSide,
} from '@/lib/handles/impersonation';

export type FileImpersonationResult =
  | { ok: true; reportId: string; alreadyReported: boolean }
  | { ok: false; reason: 'unknown-account' | 'same-account' | 'self-report'; message: string };

/**
 * File an impersonation report.
 *
 * Both account ids are resolved before anything is written: a report whose
 * "impersonated account" does not exist is not evidence, it is a free-text note
 * with extra steps.
 */
export async function fileImpersonationReport(
  reporterId: string,
  input: { accusedUserId: string; impersonatedUserId: string; note?: string },
): Promise<FileImpersonationResult> {
  const { accusedUserId, impersonatedUserId, note } = input;

  if (accusedUserId === impersonatedUserId) {
    return {
      ok: false,
      reason: 'same-account',
      message: 'An account cannot impersonate itself',
    };
  }
  if (accusedUserId === reporterId) {
    return {
      ok: false,
      reason: 'self-report',
      message: 'You cannot report your own account for impersonating someone',
    };
  }

  const [accused, impersonated] = await Promise.all([
    prisma.user.findUnique({ where: { id: accusedUserId }, select: { id: true } }),
    prisma.user.findUnique({
      where: { id: impersonatedUserId },
      select: { id: true, handle: true },
    }),
  ]);
  if (!accused || !impersonated) {
    return { ok: false, reason: 'unknown-account', message: 'Account not found' };
  }

  // One open impersonation report per (reporter, accused) — the same
  // deduplication `POST /api/moderation/report` applies, so a frustrated
  // reporter pressing the button four times does not become four queue items.
  const existing = await prisma.contentReport.findFirst({
    where: {
      reporterId,
      entityType: IMPERSONATION_ENTITY_TYPE,
      entityId: accusedUserId,
      status: { in: ['PENDING', 'REVIEWING'] },
    },
    select: { id: true },
  });
  if (existing) return { ok: true, reportId: existing.id, alreadyReported: true };

  const report = await prisma.contentReport.create({
    data: {
      reporterId,
      entityType: IMPERSONATION_ENTITY_TYPE,
      entityId: accusedUserId,
      // `OTHER` because `ReportReason` has no IMPERSONATION member and adding
      // one is a schema change. `entityType` carries the category instead.
      reason: 'OTHER',
      details: encodeImpersonationDetails({
        impersonatedUserId: impersonated.id,
        impersonatedHandle: impersonated.handle,
        note,
      }),
      targetUserId: accusedUserId,
    },
    select: { id: true },
  });

  void notifyAdminsOfReview({
    preview: 'New impersonation report needs review',
    kind: 'reports',
  });

  return { ok: true, reportId: report.id, alreadyReported: false };
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

export interface ImpersonationComparison {
  reportId: string;
  note: string;
  accused: ImpersonationComparisonSide | null;
  impersonated: ImpersonationComparisonSide | null;
  /** 0–1 similarity of the two display names. */
  nameSimilarity: number;
  /** Hosts BOTH accounts claim — the query the `ProfileLink.host` index exists for. */
  contestedHosts: { host: string; accusedVerified: boolean; impersonatedVerified: boolean }[];
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
