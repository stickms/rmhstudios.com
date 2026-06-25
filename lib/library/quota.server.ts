/**
 * RMH Studios — Library upload quota (server-only).
 *
 * Regular users may store up to a per-account cap of uploaded books (the default
 * LIBRARY_USER_QUOTA, overridable per user). When they hit it they can either
 * delete an upload to free space or appeal to an admin for a higher cap; the
 * appeal is reviewed in the admin panel and, when approved, raises the user's
 * personal quota. Admins are uncapped and never see any of this.
 */
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { LIBRARY_USER_QUOTA } from './upload-validation';

const QUOTA_MAX = 100_000;
const REASON_MAX = 1000;

export type QuotaResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

export type QuotaStatus = {
  used: number;
  quota: number;
  isAdmin: boolean;
  /** Whether the user already has a pending appeal. */
  pending: boolean;
  /** The user's own uploads, so they can delete one to free space. */
  mine: { slug: string; title: string; coverUrl: string | null }[];
};

/** The effective cap for a user (their override, or the default). */
export async function effectiveQuota(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { libraryUploadQuota: true } });
  return user?.libraryUploadQuota ?? LIBRARY_USER_QUOTA;
}

/** Current usage + cap + the user's own uploads, for the upload dialog. */
export async function getQuotaStatus(userId: string, isAdmin: boolean): Promise<QuotaStatus> {
  const [user, docs, pending] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { libraryUploadQuota: true } }),
    prisma.libraryDocument.findMany({
      where: { uploadedByUserId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true, coverKey: true },
    }),
    prisma.libraryQuotaRequest.count({ where: { userId, status: 'pending' } }),
  ]);
  return {
    used: docs.length,
    quota: user?.libraryUploadQuota ?? LIBRARY_USER_QUOTA,
    isAdmin,
    pending: pending > 0,
    mine: docs.map((d) => ({
      slug: d.slug,
      title: d.title,
      coverUrl: d.coverKey ? `/api/library/cover/${d.id}` : null,
    })),
  };
}

/** File an appeal for a higher cap (one pending appeal at a time). */
export async function requestQuota(
  userId: string,
  requestedTotal: number,
  reason: string,
): Promise<QuotaResult<true>> {
  const total = Math.floor(Number(requestedTotal));
  if (!Number.isFinite(total) || total < 1 || total > QUOTA_MAX) {
    return { ok: false, status: 422, error: 'Requested amount looks invalid.' };
  }
  const existing = await prisma.libraryQuotaRequest.findFirst({
    where: { userId, status: 'pending' },
    select: { id: true },
  });
  if (existing) return { ok: false, status: 409, error: 'You already have a request awaiting review.' };
  await prisma.libraryQuotaRequest.create({
    data: { userId, requestedTotal: total, reason: reason.slice(0, REASON_MAX) },
  });
  return { ok: true, value: true };
}

export type QuotaRequestView = {
  id: string;
  requestedTotal: number;
  reason: string;
  createdAt: string;
  user: { id: string; handle: string | null; name: string | null; used: number; currentQuota: number };
};

/** Pending appeals for the admin review panel. */
export async function listPendingQuotaRequests(): Promise<QuotaRequestView[]> {
  const rows = await prisma.libraryQuotaRequest.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      requestedTotal: true,
      reason: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          handle: true,
          name: true,
          libraryUploadQuota: true,
          _count: { select: { libraryUploads: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    requestedTotal: r.requestedTotal,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
    user: {
      id: r.user.id,
      handle: r.user.handle,
      name: r.user.name,
      used: r.user._count.libraryUploads,
      currentQuota: r.user.libraryUploadQuota ?? LIBRARY_USER_QUOTA,
    },
  }));
}

/** Approve (raising the user's cap) or deny an appeal. */
export async function decideQuotaRequest(
  adminId: string,
  id: string,
  approve: boolean,
  grantedTotal?: number,
): Promise<QuotaResult<true>> {
  const req = await prisma.libraryQuotaRequest.findUnique({
    where: { id },
    select: { userId: true, requestedTotal: true, status: true },
  });
  if (!req) return { ok: false, status: 404, error: 'Request not found.' };
  if (req.status !== 'pending') return { ok: false, status: 409, error: 'Request was already decided.' };

  if (approve) {
    const total = Math.max(1, Math.min(QUOTA_MAX, Math.floor(Number(grantedTotal ?? req.requestedTotal))));
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.userId }, data: { libraryUploadQuota: total } }),
      prisma.libraryQuotaRequest.update({
        where: { id },
        data: { status: 'approved', decidedByUserId: adminId, decidedAt: new Date() },
      }),
    ]);
    void logAdminAction(adminId, 'library.quota.approve', { targetType: 'User', targetId: req.userId, detail: `→ ${total}` });
  } else {
    await prisma.libraryQuotaRequest.update({
      where: { id },
      data: { status: 'denied', decidedByUserId: adminId, decidedAt: new Date() },
    });
    void logAdminAction(adminId, 'library.quota.deny', { targetType: 'User', targetId: req.userId });
  }
  return { ok: true, value: true };
}
