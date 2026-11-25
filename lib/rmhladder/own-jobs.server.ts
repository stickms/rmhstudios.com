/**
 * RMHLadder own jobs (sprint 13, feature 08) — the server half: add, change, delete, list and export the jobs a member
 * found elsewhere, and erase them with the account.
 *
 * An own job is a `LadderJob` with `ownerId = the member` and `sourcePlatform = manual`; its company is a
 * `LadderCompany` with the same owner (`normalizedName = own:<userId>:<name>`, so it can never collide with or be found
 * as a catalogue company), unless the typed name matches a catalogue company, in which case the job links to that
 * (read-only) row. The link a member gives is stored, never fetched: no request is made to it here or anywhere else.
 *
 * Every read and write here is scoped to `ownerId = the caller`: another member's job answers 404, the same as a job
 * that does not exist. For other modules (sprint 13 feature 10 reads these for the owner only) the surface is:
 *   - `listOwnJobs(userId)`                       the caller's own jobs, newest first
 *   - `createOwnJob(userId, body)` / `updateOwnJob(userId, id, body)` / `deleteOwnJob(userId, id)`
 *   - `exportLadderOwnJobs(userId)`               the account export section
 *   - `ladderOwnJobErasureOps(userId)`            the `anonymizeAccount` operations
 * and, from `./own-jobs`, `catalogJobWhere()`, `catalogCompanyWhere()`, `ownerOrCatalogJobWhere(userId)`.
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { refusalBody, type ErrorCode } from '@/lib/errors/codes';
import { normalizeCompanyName, normalizeTitle } from '@/lib/rmhladder/normalize';
import {
  LADDER_OWN_JOB_LIMIT,
  annualizePay,
  catalogCompanyWhere,
  deadlineToDate,
  deadlineToDay,
  type OwnJobEmploymentType,
  type OwnJobPayPeriod,
  type OwnJobRemoteStatus,
  type OwnJobView,
} from '@/lib/rmhladder/own-jobs';
import type { OwnJobBody } from '@/lib/rmhladder/own-jobs-schema';

export type OwnJobResult<T> =
  { ok: true; value: T } | { ok: false; status: number; body: { error: string; code: ErrorCode; max?: number } };

const refuse = (status: number, code: ErrorCode, params?: { max: number }): OwnJobResult<never> => ({
  ok: false,
  status,
  body: refusalBody(code, params),
});

/** The company a job hangs from, as the views need it. */
const withCompany = { company: { select: { id: true, name: true, ownerId: true } } } as const;

interface JobRow {
  id: string;
  title: string;
  locationRaw: string | null;
  remoteStatus: string;
  employmentType: string;
  applicationDeadline: Date | null;
  originalPostingUrl: string;
  compensationMin: number | null;
  compensationMax: number | null;
  payPeriod: string | null;
  payCurrency: string | null;
  discoveredAt: Date;
  company: { name: string; ownerId: string | null };
}

/** The company's own key: `own:<userId>:<normalized name>`. */
export function ownCompanyKey(userId: string, name: string): string {
  const normalized = normalizeCompanyName(name) || name.trim().toLowerCase();
  return `own:${userId}:${normalized}`;
}

export function toOwnJobView(row: JobRow): OwnJobView {
  return {
    id: row.id,
    title: row.title,
    company: row.company.name,
    ownCompany: row.company.ownerId !== null,
    link: row.originalPostingUrl || null,
    location: row.locationRaw,
    remoteStatus: row.remoteStatus as OwnJobRemoteStatus,
    employmentType: row.employmentType as OwnJobEmploymentType,
    deadline: deadlineToDay(row.applicationDeadline),
    payMin: row.compensationMin,
    payMax: row.compensationMax,
    payPeriod: (row.payPeriod as OwnJobPayPeriod | null) ?? 'year',
    payCurrency: row.payCurrency ?? 'USD',
    createdAt: row.discoveredAt.toISOString(),
  };
}

/** The columns a typed job maps to (a typed pay figure also lands on the annual axis the catalogue sorts by). */
export function ownJobColumns(body: OwnJobBody) {
  const low = body.payMin ?? body.payMax;
  const high = body.payMax ?? body.payMin;
  const hasPay = low !== null && high !== null;
  return {
    title: body.title,
    normalizedTitle: normalizeTitle(body.title),
    programType: body.employmentType === 'internship' ? ('internship' as const) : ('entry_level' as const),
    locationRaw: body.location,
    remoteStatus: body.remoteStatus,
    employmentType: body.employmentType,
    applicationDeadline: deadlineToDate(body.deadline),
    sourceUrl: body.link ?? '',
    originalPostingUrl: body.link ?? '',
    compensationMin: hasPay ? Math.round(low) : null,
    compensationMax: hasPay ? Math.round(high) : null,
    compensationCurrency: hasPay ? body.payCurrency : null,
    compensationInterval: hasPay ? body.payPeriod : null,
    payMinAnnual: hasPay ? annualizePay(low, body.payPeriod) : null,
    payMaxAnnual: hasPay ? annualizePay(high, body.payPeriod) : null,
    payCurrency: hasPay ? body.payCurrency : null,
    payPeriod: hasPay ? body.payPeriod : null,
  };
}

type Tx = Prisma.TransactionClient;

/** A catalogue company the typed name matches (read-only, shared), else the member's own company row. */
async function resolveCompany(tx: Tx, userId: string, name: string): Promise<string> {
  const catalogue = await tx.ladderCompany.findFirst({
    where: { normalizedName: normalizeCompanyName(name), ...catalogCompanyWhere() },
    select: { id: true },
  });
  if (catalogue) return catalogue.id;
  // `enabled: false` keeps an own company out of every catalogue filter even if a reader ever forgot the owner fragment.
  const own = await tx.ladderCompany.upsert({
    where: { normalizedName: ownCompanyKey(userId, name) },
    create: {
      name,
      normalizedName: ownCompanyKey(userId, name),
      industry: 'Other',
      firmType: 'other',
      enabled: false,
      ownerId: userId,
    },
    update: {},
    select: { id: true },
  });
  return own.id;
}

/** An own company with no job left is nobody's: its name goes with its last job. */
async function dropEmptyOwnCompany(tx: Tx, userId: string, companyId: string): Promise<void> {
  await tx.ladderCompany.deleteMany({ where: { id: companyId, ownerId: userId, jobs: { none: {} } } });
}

export async function listOwnJobs(userId: string): Promise<OwnJobView[]> {
  const rows = await prisma.ladderJob.findMany({
    where: { ownerId: userId },
    include: withCompany,
    orderBy: [{ discoveredAt: 'desc' }, { id: 'asc' }],
    take: LADDER_OWN_JOB_LIMIT,
  });
  return rows.map((row) => toOwnJobView(row as unknown as JobRow));
}

export async function createOwnJob(
  userId: string,
  body: OwnJobBody,
): Promise<OwnJobResult<{ job: OwnJobView; applicationId: string }>> {
  return prisma.$transaction(async (tx) => {
    // The cap is a check-then-insert: the lock makes two concurrent creates take turns.
    await lockKey(tx, `ladder-own-job:${userId}`);
    const count = await tx.ladderJob.count({ where: { ownerId: userId } });
    if (count >= LADDER_OWN_JOB_LIMIT) return refuse(409, 'LADDER_OWN_JOB_LIMIT', { max: LADDER_OWN_JOB_LIMIT });

    const companyId = await resolveCompany(tx, userId, body.company);
    const id = randomUUID();
    const job = await tx.ladderJob.create({
      data: {
        id,
        companyId,
        ownerId: userId,
        sourcePlatform: 'manual',
        status: 'active',
        dedupeHash: `own:${id}`,
        ...ownJobColumns(body),
      },
      include: withCompany,
    });
    await tx.ladderUserPrefs.upsert({ where: { userId }, create: { userId }, update: {} });
    const application = await tx.ladderApplication.create({
      data: { userId, jobId: job.id, status: 'not_applied' },
      select: { id: true },
    });
    await tx.ladderApplicationEvent.create({
      data: {
        applicationId: application.id,
        userId,
        type: 'application_updated',
        data: { fields: ['created'], source: 'own_job' },
      },
    });
    return { ok: true as const, value: { job: toOwnJobView(job as unknown as JobRow), applicationId: application.id } };
  });
}

export async function updateOwnJob(
  userId: string,
  id: string,
  body: OwnJobBody,
): Promise<OwnJobResult<{ job: OwnJobView }>> {
  return prisma.$transaction(async (tx) => {
    // Same lock as create: an edit that drops an emptied own company must not interleave with an add that reuses it.
    await lockKey(tx, `ladder-own-job:${userId}`);
    const existing = await tx.ladderJob.findFirst({
      where: { id, ownerId: userId },
      select: { id: true, companyId: true },
    });
    if (!existing) return refuse(404, 'NOT_FOUND');
    const companyId = await resolveCompany(tx, userId, body.company);
    // Compare-and-set on the owner: a job that stopped being this member's between the read and now is not touched.
    const changed = await tx.ladderJob.updateMany({
      where: { id, ownerId: userId },
      data: { companyId, ...ownJobColumns(body) },
    });
    if (changed.count === 0) return refuse(404, 'NOT_FOUND');
    // An own job is never scraped, so nothing else marks it changed: the member's application carries the change, and
    // the calendar's deadline entry (s13-09) takes its SEQUENCE from it.
    await tx.ladderApplication.updateMany({ where: { jobId: id, userId }, data: { updatedAt: new Date() } });
    if (existing.companyId !== companyId) await dropEmptyOwnCompany(tx, userId, existing.companyId);
    const job = await tx.ladderJob.findFirst({ where: { id, ownerId: userId }, include: withCompany });
    if (!job) return refuse(404, 'NOT_FOUND');
    return { ok: true as const, value: { job: toOwnJobView(job as unknown as JobRow) } };
  });
}

/** Deletes the job; its application, events and offer go with it (they cascade from the job). */
export async function deleteOwnJob(userId: string, id: string): Promise<OwnJobResult<{ ok: true }>> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `ladder-own-job:${userId}`);
    const existing = await tx.ladderJob.findFirst({ where: { id, ownerId: userId }, select: { companyId: true } });
    if (!existing) return refuse(404, 'NOT_FOUND');
    const removed = await tx.ladderJob.deleteMany({ where: { id, ownerId: userId } });
    if (removed.count === 0) return refuse(404, 'NOT_FOUND');
    await dropEmptyOwnCompany(tx, userId, existing.companyId);
    return { ok: true as const, value: { ok: true as const } };
  });
}

/** The account export's `ladderOwnJobs` section: the member's own jobs and where each one stands. */
export async function exportLadderOwnJobs(userId: string) {
  const rows = await prisma.ladderJob.findMany({
    where: { ownerId: userId },
    include: { ...withCompany, applications: { where: { userId }, select: { status: true, appliedDate: true } } },
    orderBy: [{ discoveredAt: 'asc' }, { id: 'asc' }],
    take: LADDER_OWN_JOB_LIMIT,
  });
  return rows.map((row) => {
    const application = (row.applications as Array<{ status: string; appliedDate: Date | null }>)[0] ?? null;
    return {
      ...toOwnJobView(row as unknown as JobRow),
      applicationStatus: application?.status ?? null,
      appliedDate: application?.appliedDate ? application.appliedDate.toISOString() : null,
    };
  });
}

/**
 * `anonymizeAccount` operations. Account deletion anonymises the user row in place, so the database cascade from
 * `User` never fires: the member's own jobs (their applications, events and offer cascade from the job) go first,
 * then their own companies, which a job referenced.
 */
export function ladderOwnJobErasureOps(userId: string) {
  return [
    prisma.ladderJob.deleteMany({ where: { ownerId: userId } }),
    prisma.ladderCompany.deleteMany({ where: { ownerId: userId } }),
  ];
}
