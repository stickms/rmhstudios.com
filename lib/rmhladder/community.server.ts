import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { normalizeCompanyName } from './normalize';
import { MAX_REPORTS_PER_COMPANY, REFERRAL_MAX_OPEN_OFFERS, REFERRAL_MAX_PENDING_REQUESTS } from './community';
import { type createInterviewReportSchema, type createOfferSchema } from './community-schema';
import type { z } from 'zod';

export type Result<T> = { ok: true; value: T } | { ok: false; status: number; error: string };
const fail = (status: number, error: string): { ok: false; status: number; error: string } => ({
  ok: false,
  status,
  error,
});

/* ── F6 · referral board ─────────────────────────────────────────────────── */

export async function createOffer(userId: string, input: z.infer<typeof createOfferSchema>) {
  const open = await prisma.ladderReferralOffer.count({ where: { userId, status: 'open' } });
  if (open >= REFERRAL_MAX_OPEN_OFFERS) {
    return fail(
      409,
      `You can have ${REFERRAL_MAX_OPEN_OFFERS} open offers at a time. Close one first.`,
    );
  }
  const offer = await prisma.ladderReferralOffer.create({
    data: {
      userId,
      companyName: input.companyName,
      normalizedCompany: normalizeCompanyName(input.companyName).slice(0, 120),
      roles: input.roles,
      note: input.note || null,
      capacity: input.capacity,
    },
    select: { id: true },
  });
  return { ok: true as const, value: offer };
}

/** Open offers from other members (optionally for one company), plus the viewer's own sides. */
export async function loadBoard(userId: string, q?: string) {
  const company = q ? normalizeCompanyName(q) : '';
  const [offers, mine, sent] = await Promise.all([
    prisma.ladderReferralOffer.findMany({
      where: {
        status: 'open',
        userId: { not: userId },
        ...(company ? { normalizedCompany: { contains: company } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        companyName: true,
        roles: true,
        note: true,
        capacity: true,
        createdAt: true,
        user: { select: userDisplaySelect },
        _count: { select: { requests: { where: { status: 'accepted' } } } },
        requests: { where: { applicantId: userId }, select: { status: true } },
      },
    }),
    prisma.ladderReferralOffer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        companyName: true,
        roles: true,
        capacity: true,
        status: true,
        requests: {
          where: { status: { in: ['pending', 'accepted'] } },
          orderBy: { createdAt: 'asc' },
          take: 50,
          select: {
            id: true,
            pitch: true,
            status: true,
            createdAt: true,
            applicant: { select: userDisplaySelect },
          },
        },
      },
    }),
    prisma.ladderReferralRequest.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        status: true,
        offer: { select: { companyName: true, roles: true, user: { select: userDisplaySelect } } },
      },
    }),
  ]);
  const who = (u: Parameters<typeof resolveUser>[0]) => {
    const r = resolveUser(u);
    return { id: r.id, name: r.name, image: r.image, username: r.username };
  };
  return {
    offers: offers.map((o) => ({
      id: o.id,
      companyName: o.companyName,
      roles: o.roles,
      note: o.note,
      spotsLeft: Math.max(0, o.capacity - o._count.requests),
      createdAt: o.createdAt,
      referrer: who(o.user),
      myRequest: o.requests[0]?.status ?? null,
    })),
    mine: mine.map((o) => ({
      ...o,
      requests: o.requests.map((r) => ({ ...r, applicant: who(r.applicant) })),
    })),
    sent: sent.map((r) => ({
      id: r.id,
      status: r.status,
      companyName: r.offer.companyName,
      roles: r.offer.roles,
      referrer: who(r.offer.user),
    })),
  };
}

export async function closeOffer(userId: string, offerId: string): Promise<Result<true>> {
  const { count } = await prisma.ladderReferralOffer.updateMany({
    where: { id: offerId, userId },
    data: { status: 'closed' },
  });
  return count ? { ok: true, value: true } : fail(404, 'Offer not found.');
}

export async function createRequest(
  userId: string,
  offerId: string,
  pitch: string,
): Promise<Result<{ id: string }>> {
  const offer = await prisma.ladderReferralOffer.findUnique({
    where: { id: offerId },
    select: {
      userId: true,
      status: true,
      capacity: true,
      companyName: true,
      _count: { select: { requests: { where: { status: 'accepted' } } } },
    },
  });
  if (!offer || offer.status !== 'open') return fail(404, 'This offer is no longer open.');
  if (offer.userId === userId) return fail(400, 'You cannot request your own referral.');
  if (offer._count.requests >= offer.capacity) return fail(409, 'This offer is full.');
  const pending = await prisma.ladderReferralRequest.count({
    where: { applicantId: userId, status: 'pending' },
  });
  if (pending >= REFERRAL_MAX_PENDING_REQUESTS) {
    return fail(
      429,
      `You have ${REFERRAL_MAX_PENDING_REQUESTS} requests waiting. Withdraw one first.`,
    );
  }
  try {
    const request = await prisma.ladderReferralRequest.create({
      data: { offerId, applicantId: userId, pitch },
      select: { id: true },
    });
    void createNotification({
      userId: offer.userId,
      actorId: userId,
      type: 'SYSTEM',
      entityType: 'referral',
      entityId: request.id,
      preview: `New referral request for ${offer.companyName}`,
      link: '/rmhladder/referrals',
      dedupeUnread: true,
    });
    return { ok: true, value: request };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002')
      return fail(409, 'You already asked for this referral.');
    throw e;
  }
}

export async function respondToRequest(
  userId: string,
  requestId: string,
  action: 'accept' | 'pass' | 'withdraw',
): Promise<Result<{ status: string }>> {
  const request = await prisma.ladderReferralRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      applicantId: true,
      offer: { select: { id: true, userId: true, capacity: true, companyName: true } },
    },
  });
  if (!request) return fail(404, 'Request not found.');
  if (request.status !== 'pending') return fail(409, 'This request has already been answered.');

  if (action === 'withdraw') {
    if (request.applicantId !== userId) return fail(403, 'Not your request.');
    await prisma.ladderReferralRequest.update({
      where: { id: requestId },
      data: { status: 'withdrawn', respondedAt: new Date() },
    });
    return { ok: true, value: { status: 'withdrawn' } };
  }

  if (request.offer.userId !== userId) return fail(403, 'Not your offer.');
  const status = action === 'accept' ? 'accepted' : 'passed';
  class Full extends Error {}
  const outcome = await prisma
    .$transaction(async (tx) => {
      // Guard on status so two concurrent answers cannot both land.
      const { count } = await tx.ladderReferralRequest.updateMany({
        where: { id: requestId, status: 'pending' },
        data: { status, respondedAt: new Date() },
      });
      if (!count) return 'raced' as const;
      if (action === 'accept') {
        const accepted = await tx.ladderReferralRequest.count({
          where: { offerId: request.offer.id, status: 'accepted' },
        });
        if (accepted > request.offer.capacity) throw new Full(); // rolls the accept back
        if (accepted >= request.offer.capacity) {
          await tx.ladderReferralOffer.update({
            where: { id: request.offer.id },
            data: { status: 'closed' },
          });
        }
      }
      return 'done' as const;
    })
    .catch((e: unknown) => (e instanceof Full ? ('full' as const) : Promise.reject(e)));
  if (outcome === 'full')
    return fail(409, 'You have already accepted as many referrals as you offered.');
  if (outcome === 'raced') return fail(409, 'This request has already been answered.');

  void createNotification({
    userId: request.applicantId,
    actorId: userId,
    type: 'SYSTEM',
    entityType: 'referral',
    entityId: requestId,
    preview:
      action === 'accept'
        ? `Your referral request for ${request.offer.companyName} was accepted`
        : `Your referral request for ${request.offer.companyName} was passed on`,
    link: '/rmhladder/referrals',
  });
  return { ok: true, value: { status } };
}

/* ── F8 · interview reports ──────────────────────────────────────────────── */

export async function listInterviewReports(companyId: string) {
  const where = { companyId, status: 'visible' };
  const [reports, agg] = await Promise.all([
    prisma.ladderInterviewReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        roleTitle: true,
        rounds: true,
        questionTypes: true,
        outcome: true,
        difficulty: true,
        body: true,
        createdAt: true,
      },
    }),
    prisma.ladderInterviewReport.aggregate({
      where,
      _count: { _all: true },
      _avg: { difficulty: true },
    }),
  ]);
  return {
    reports,
    count: agg._count._all,
    avgDifficulty: agg._avg.difficulty === null ? null : Math.round(agg._avg.difficulty * 10) / 10,
  };
}

export async function createInterviewReport(
  userId: string,
  input: z.infer<typeof createInterviewReportSchema>,
): Promise<Result<{ id: string }>> {
  const company = await prisma.ladderCompany.findUnique({
    where: { id: input.companyId },
    select: { id: true },
  });
  if (!company) return fail(404, 'Company not found.');
  const mine = await prisma.ladderInterviewReport.count({
    where: { userId, companyId: input.companyId },
  });
  if (mine >= MAX_REPORTS_PER_COMPANY) {
    return fail(
      409,
      `You can share up to ${MAX_REPORTS_PER_COMPANY} interview reports per company.`,
    );
  }
  const report = await prisma.ladderInterviewReport.create({
    data: { ...input, body: input.body || null, userId },
    select: { id: true },
  });
  return { ok: true, value: report };
}
