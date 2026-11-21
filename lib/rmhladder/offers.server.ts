/**
 * RMHLadder offers — the server half (sprint 03, feature 17).
 *
 * Every read and write is scoped through the application's `userId`: an
 * application or offer that is not the caller's is a 404, the same answer as one
 * that does not exist. A deadline feeds the existing follow-up mechanism
 * (`LadderApplication.followUpDate`, read by the alerts dispatch and the
 * calendar feed) rather than a new job.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { offerBody, offerPatchBody } from '@/lib/rmhladder/offers-schema';
import {
  AMOUNT_FIELDS,
  MAX_OFFERS_PER_MEMBER,
  appendRevision,
  dayKey,
  followUpForDeadline,
  offerProblems,
  revisionFor,
  type OfferDto,
  type OfferRevision,
  type OfferState,
  type OpenApplication,
  type PendingOfferApplication,
} from '@/lib/rmhladder/offers';
import type { z } from 'zod';

type Body = z.infer<typeof offerBody>;
type Patch = z.infer<typeof offerPatchBody>;

export type Result<T> =
  | {
      ok: true;
      value: T;
    }
  | {
      ok: false;
      status: number;
      error: string;
    };
const fail = (
  status: number,
  error: string,
): {
  ok: false;
  status: number;
  error: string;
} => ({
  ok: false,
  status,
  error,
});

const offerInclude = {
  application: {
    select: {
      id: true,
      followUpDate: true,
      job: {
        select: {
          title: true,
          payMinAnnual: true,
          payMaxAnnual: true,
          payCurrency: true,
          company: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  },
} satisfies Prisma.LadderOfferInclude;

type OfferRow = Prisma.LadderOfferGetPayload<{
  include: typeof offerInclude;
}>;

const OPEN_APPLICATION_LIMIT = 200;
const CLOSED_STATUSES = ['rejected', 'withdrawn'] as const;

function toDay(date: Date | null): string | null {
  return date ? dayKey(date) : null;
}

function fromDay(day: string | null | undefined): Date | null | undefined {
  if (day === undefined) return undefined;
  return day === null ? null : new Date(`${day}T00:00:00.000Z`);
}

function big(value: string | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : BigInt(value);
}

export function toOfferDto(row: OfferRow): OfferDto {
  const job = row.application.job;
  return {
    id: row.id,
    applicationId: row.applicationId,
    currency: row.currency,
    basePay: row.basePay.toString(),
    payPeriod: row.payPeriod as OfferDto['payPeriod'],
    hoursPerWeek: row.hoursPerWeek,
    bonusAmount: row.bonusAmount === null ? null : row.bonusAmount.toString(),
    bonusPercent: row.bonusPercent,
    signOn: row.signOn === null ? null : row.signOn.toString(),
    equityGrant: row.equityGrant === null ? null : row.equityGrant.toString(),
    equityYears: row.equityYears,
    equityNote: row.equityNote,
    location: row.location,
    remote: row.remote as OfferDto['remote'],
    ptoDays: row.ptoDays,
    startDate: toDay(row.startDate),
    deadline: toDay(row.deadline),
    notes: row.notes,
    state: row.state as OfferState,
    revisions: Array.isArray(row.revisions) ? (row.revisions as unknown as OfferRevision[]) : [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    company: job.company.name,
    title: job.title,
    postingPay:
      job.payMinAnnual && job.payMaxAnnual
        ? {
            min: job.payMinAnnual,
            max: job.payMaxAnnual,
            currency: job.payCurrency ?? 'USD',
          }
        : null,
  };
}

/** The member's offers (with their applications and jobs, one query), plus what the page needs around them. */
export async function listOffers(userId: string): Promise<{
  offers: OfferDto[];
  pending: PendingOfferApplication[];
  openApplications: OpenApplication[];
}> {
  const [rows, pendingRows, openRows] = await Promise.all([
    prisma.ladderOffer.findMany({
      where: {
        userId,
      },
      include: offerInclude,
      orderBy: {
        createdAt: 'desc',
      },
      take: MAX_OFFERS_PER_MEMBER,
    }),
    prisma.ladderApplication.findMany({
      where: {
        userId,
        status: 'offer',
        offer: null,
      },
      select: {
        id: true,
        job: {
          select: {
            title: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: OPEN_APPLICATION_LIMIT,
    }),
    prisma.ladderApplication.findMany({
      where: {
        userId,
        status: {
          notIn: [...CLOSED_STATUSES],
        },
      },
      select: {
        id: true,
        status: true,
        job: {
          select: {
            title: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: OPEN_APPLICATION_LIMIT,
    }),
  ]);
  return {
    offers: rows.map(toOfferDto),
    pending: pendingRows.map((row) => ({
      applicationId: row.id,
      company: row.job.company.name,
      title: row.job.title,
    })),
    openApplications: openRows.map((row) => ({
      id: row.id,
      company: row.job.company.name,
      title: row.job.title,
      status: row.status,
    })),
  };
}

const PROBLEM_MESSAGE = {
  hoursRequired: 'Hourly pay needs hours per week',
  bonusBoth: 'Give the bonus as an amount or a percent, not both',
  equityPair: 'Equity needs both a grant value and a vesting length',
} as const;

function problemOf(offer: Parameters<typeof offerProblems>[0]): string | null {
  const [first] = offerProblems(offer);
  return first ? PROBLEM_MESSAGE[first] : null;
}

/** Applies a deadline to the application's follow-up date, as a write to include in a transaction. */
function followUpWrite(applicationId: string, deadline: Date | null | undefined, existing: Date | null, now: Date) {
  if (!deadline) return null;
  const next = followUpForDeadline(deadline, existing, now);
  if (!next) return null;
  return prisma.ladderApplication.update({
    where: {
      id: applicationId,
    },
    data: {
      followUpDate: next,
    },
    select: {
      id: true,
    },
  });
}

export async function recordOffer(userId: string, input: Body, now = new Date()): Promise<Result<OfferDto>> {
  const application = await prisma.ladderApplication.findFirst({
    where: {
      id: input.applicationId,
      userId,
    },
    select: {
      id: true,
      followUpDate: true,
      offer: {
        select: {
          id: true,
        },
      },
    },
  });
  if (!application) return fail(404, 'Application not found');
  if (application.offer) return fail(409, 'This application already has an offer');
  const problem = problemOf(input);
  if (problem) return fail(400, problem);
  const count = await prisma.ladderOffer.count({
    where: {
      userId,
    },
  });
  if (count >= MAX_OFFERS_PER_MEMBER) {
    return fail(409, `You can keep ${MAX_OFFERS_PER_MEMBER} offers. Delete one first.`);
  }

  const deadline = fromDay(input.deadline) ?? null;
  const create = prisma.ladderOffer.create({
    data: {
      userId,
      applicationId: application.id,
      currency: input.currency,
      basePay: BigInt(input.basePay),
      payPeriod: input.payPeriod,
      hoursPerWeek: input.hoursPerWeek,
      bonusAmount: big(input.bonusAmount) ?? null,
      bonusPercent: input.bonusPercent,
      signOn: big(input.signOn) ?? null,
      equityGrant: big(input.equityGrant) ?? null,
      equityYears: input.equityYears,
      equityNote: input.equityNote,
      location: input.location,
      remote: input.remote,
      ptoDays: input.ptoDays,
      startDate: fromDay(input.startDate) ?? null,
      deadline,
      notes: input.notes,
    },
    include: offerInclude,
  });
  const followUp = followUpWrite(application.id, deadline, application.followUpDate, now);
  const event = prisma.ladderApplicationEvent.create({
    data: {
      applicationId: application.id,
      userId,
      type: 'offer_recorded',
    },
  });
  const [row] = await prisma.$transaction([create, event, ...(followUp ? [followUp] : [])]);
  return {
    ok: true,
    value: toOfferDto(row as OfferRow),
  };
}

export async function updateOffer(
  userId: string,
  id: string,
  patch: Patch,
  now = new Date(),
): Promise<Result<OfferDto>> {
  const row = await prisma.ladderOffer.findFirst({
    where: {
      id,
      userId,
    },
    include: offerInclude,
  });
  if (!row) return fail(404, 'Offer not found');
  if (row.state !== 'open') return fail(409, 'This offer has already been decided');

  const stored = toOfferDto(row);
  const amountsBefore = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, stored[f]])) as Record<
    (typeof AMOUNT_FIELDS)[number],
    unknown
  >;
  const amountsAfter = Object.fromEntries(
    AMOUNT_FIELDS.map((f) => [f, patch[f] !== undefined ? patch[f] : stored[f]]),
  ) as Record<(typeof AMOUNT_FIELDS)[number], unknown>;
  const problem = problemOf(amountsAfter as unknown as Parameters<typeof offerProblems>[0]);
  if (problem) return fail(400, problem);

  const revision = revisionFor(amountsBefore, amountsAfter, now);
  const deadline = fromDay(patch.deadline);
  const data: Prisma.LadderOfferUpdateInput = {
    ...(patch.currency !== undefined && {
      currency: patch.currency,
    }),
    ...(patch.basePay !== undefined && {
      basePay: BigInt(patch.basePay),
    }),
    ...(patch.payPeriod !== undefined && {
      payPeriod: patch.payPeriod,
    }),
    ...(patch.hoursPerWeek !== undefined && {
      hoursPerWeek: patch.hoursPerWeek,
    }),
    ...(patch.bonusAmount !== undefined && {
      bonusAmount: big(patch.bonusAmount),
    }),
    ...(patch.bonusPercent !== undefined && {
      bonusPercent: patch.bonusPercent,
    }),
    ...(patch.signOn !== undefined && {
      signOn: big(patch.signOn),
    }),
    ...(patch.equityGrant !== undefined && {
      equityGrant: big(patch.equityGrant),
    }),
    ...(patch.equityYears !== undefined && {
      equityYears: patch.equityYears,
    }),
    ...(patch.equityNote !== undefined && {
      equityNote: patch.equityNote,
    }),
    ...(patch.location !== undefined && {
      location: patch.location,
    }),
    ...(patch.remote !== undefined && {
      remote: patch.remote,
    }),
    ...(patch.ptoDays !== undefined && {
      ptoDays: patch.ptoDays,
    }),
    ...(patch.startDate !== undefined && {
      startDate: fromDay(patch.startDate),
    }),
    ...(deadline !== undefined && {
      deadline,
    }),
    ...(patch.notes !== undefined && {
      notes: patch.notes,
    }),
    ...(revision && {
      revisions: appendRevision(stored.revisions, revision) as unknown as Prisma.InputJsonValue,
    }),
  };

  const update = prisma.ladderOffer.update({
    where: {
      id: row.id,
    },
    data,
    include: offerInclude,
  });
  const followUp = followUpWrite(row.applicationId, deadline, row.application.followUpDate, now);
  const [updated] = await prisma.$transaction([update, ...(followUp ? [followUp] : [])]);
  return {
    ok: true,
    value: toOfferDto(updated as OfferRow),
  };
}

export async function deleteOffer(userId: string, id: string): Promise<Result<true>> {
  const { count } = await prisma.ladderOffer.deleteMany({
    where: {
      id,
      userId,
    },
  });
  return count === 0
    ? fail(404, 'Offer not found')
    : {
        ok: true,
        value: true,
      };
}

/**
 * Accept or decline an open offer. Accept marks the offer accepted and the
 * application's outcome; it withdraws only the applications the member ticked
 * (and only their own, still open, other applications) and declines any offer
 * those had. Decline marks the offer declined.
 */
export async function decideOffer(
  userId: string,
  id: string,
  input: {
    decision: 'accept' | 'decline';
    withdrawApplicationIds: string[];
  },
): Promise<
  Result<{
    offer: OfferDto;
    withdrawn: number;
  }>
> {
  const row = await prisma.ladderOffer.findFirst({
    where: {
      id,
      userId,
    },
    include: offerInclude,
  });
  if (!row) return fail(404, 'Offer not found');
  if (row.state !== 'open') return fail(409, 'This offer has already been decided');

  if (input.decision === 'decline') {
    const declined = await prisma.ladderOffer.update({
      where: {
        id: row.id,
      },
      data: {
        state: 'declined',
      },
      include: offerInclude,
    });
    return {
      ok: true,
      value: {
        offer: toOfferDto(declined),
        withdrawn: 0,
      },
    };
  }

  const ticked = [...new Set(input.withdrawApplicationIds)].filter((appId) => appId !== row.applicationId);
  const targets = ticked.length
    ? await prisma.ladderApplication.findMany({
        where: {
          id: {
            in: ticked,
          },
          userId,
          status: {
            notIn: [...CLOSED_STATUSES],
          },
        },
        select: {
          id: true,
          status: true,
        },
      })
    : [];
  const targetIds = targets.map((t) => t.id);

  const accept = prisma.ladderOffer.update({
    where: {
      id: row.id,
    },
    data: {
      state: 'accepted',
    },
    include: offerInclude,
  });
  const outcome = prisma.ladderApplication.update({
    where: {
      id: row.applicationId,
    },
    data: {
      status: 'offer',
      outcome: 'accepted',
    },
    select: {
      id: true,
    },
  });
  const acceptEvent = prisma.ladderApplicationEvent.create({
    data: {
      applicationId: row.applicationId,
      userId,
      type: 'offer_accepted',
    },
  });
  const withdrawals = targets.length
    ? [
        prisma.ladderApplication.updateMany({
          where: {
            id: {
              in: targetIds,
            },
            userId,
          },
          data: {
            status: 'withdrawn',
          },
        }),
        prisma.ladderOffer.updateMany({
          where: {
            applicationId: {
              in: targetIds,
            },
            userId,
            state: 'open',
          },
          data: {
            state: 'declined',
          },
        }),
        prisma.ladderApplicationEvent.createMany({
          data: targets.map((target) => ({
            applicationId: target.id,
            userId,
            type: 'status_changed',
            fromStatus: target.status,
            toStatus: 'withdrawn' as const,
          })),
        }),
      ]
    : [];
  const [accepted] = await prisma.$transaction([accept, outcome, acceptEvent, ...withdrawals]);
  return {
    ok: true,
    value: {
      offer: toOfferDto(accepted as OfferRow),
      withdrawn: targets.length,
    },
  };
}

/** All of a member's offers for the account export and the RMHLadder export. */
export async function exportLadderOffers(userId: string): Promise<OfferDto[]> {
  const rows = await prisma.ladderOffer.findMany({
    where: {
      userId,
    },
    include: offerInclude,
    orderBy: {
      createdAt: 'asc',
    },
  });
  return rows.map(toOfferDto);
}
