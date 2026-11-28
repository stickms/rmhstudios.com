/**
 * `/api/v1/me/ladder/*` (RMHLadder; scopes `read:ladder` and `write:ladder`).
 *
 * Nothing here is a second implementation: a change to an application is the site's `updateApplication` (which applies
 * `assertJobUsable` and records one timeline event), and a new own job is 08's `createOwnJob` (the same cap, the same
 * refusal). Reads are the key owner's own `LadderApplication` rows only, and each application's job is read through
 * `ownerOrCatalogJobWhere(userId)`, so a catalogue job or the owner's own job and never another member's.
 *
 * What a response carries is an allowlist (the `select`s below): status, dates, the member's own notes, the job's
 * public fields and the timeline. Offers and pay figures, resumes and their versions, cover letters, referral names,
 * contact e-mails and the outcome text are never selected, so they cannot be returned by mistake.
 */
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { RATE_LIMIT_POLICIES, rateLimit } from '@/lib/rate-limit';
import { JobNotFoundError, deadlineToDay, ownerOrCatalogJobWhere } from '@/lib/rmhladder/own-jobs';
import { ownJobBody, type OwnJobBody } from '@/lib/rmhladder/own-jobs-schema';
import { createOwnJob } from '@/lib/rmhladder/own-jobs.server';
import { updateApplication, type ActionsPrisma, type ApplicationPatch } from '@/lib/rmhladder/server/actions';
import {
  createOwnJobBody,
  decodeApplicationCursor,
  encodeApplicationCursor,
  type applicationsQuery,
  type PatchApplicationBody,
} from '@/lib/api/v1/ladder-schema';

/** Headers for every response of these routes: a job search is personal and must not sit in a shared cache. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

export interface LadderJobV1 {
  id: string;
  title: string;
  company: string;
  location: string | null;
  remote: string;
  url: string | null;
  deadline: string | null;
  own: boolean;
}

export interface LadderApplicationV1 {
  id: string;
  status: string;
  appliedDate: string | null;
  followUpDate: string | null;
  interviewDates: string[];
  notes: string | null;
  updatedAt: string;
  job: LadderJobV1;
}

export interface LadderEventV1 {
  id: string;
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  /** Which fields the change touched (names only, never values). */
  fields: string[];
  createdAt: string;
}

export interface LadderApplicationDetailV1 extends LadderApplicationV1 {
  events: LadderEventV1[];
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** The timeline a detail carries: the newest this many events. */
export const EVENT_LIMIT = 50;

const applicationSelect = {
  id: true,
  status: true,
  appliedDate: true,
  followUpDate: true,
  interviewDates: true,
  notes: true,
  updatedAt: true,
  job: {
    select: {
      id: true,
      title: true,
      locationRaw: true,
      remoteStatus: true,
      originalPostingUrl: true,
      applicationDeadline: true,
      ownerId: true,
      company: { select: { name: true } },
    },
  },
} satisfies Prisma.LadderApplicationSelect;

const eventSelect = {
  id: true,
  type: true,
  fromStatus: true,
  toStatus: true,
  data: true,
  createdAt: true,
} satisfies Prisma.LadderApplicationEventSelect;

type ApplicationRow = Prisma.LadderApplicationGetPayload<{ select: typeof applicationSelect }>;
type EventRow = Prisma.LadderApplicationEventGetPayload<{ select: typeof eventSelect }>;

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toApplicationV1(row: ApplicationRow): LadderApplicationV1 {
  return {
    id: row.id,
    status: row.status,
    appliedDate: iso(row.appliedDate),
    followUpDate: iso(row.followUpDate),
    interviewDates: row.interviewDates.map((d) => d.toISOString()),
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
    job: {
      id: row.job.id,
      title: row.job.title,
      company: row.job.company.name,
      location: row.job.locationRaw,
      remote: row.job.remoteStatus,
      url: row.job.originalPostingUrl || null,
      deadline: deadlineToDay(row.job.applicationDeadline),
      own: typeof row.job.ownerId === 'string' && row.job.ownerId.length > 0,
    },
  };
}

/** An event's `data` holds only `{ fields, source? }`; the names are all that is returned. */
export function toEventV1(row: EventRow): LadderEventV1 {
  const raw = (row.data as { fields?: unknown } | null)?.fields;
  const fields = Array.isArray(raw) ? raw.filter((f): f is string => typeof f === 'string') : [];
  return {
    id: row.id,
    type: row.type,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    fields,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The key owner's applications, most recently changed first. */
export async function listApplicationsForKey(
  userId: string,
  q: z.infer<typeof applicationsQuery>,
): Promise<Page<LadderApplicationV1> | 'invalid_cursor'> {
  const cur = q.cursor ? decodeApplicationCursor(q.cursor) : null;
  if (q.cursor && !cur) return 'invalid_cursor';
  const where = {
    userId,
    job: ownerOrCatalogJobWhere(userId),
    ...(q.status.length ? { status: { in: q.status } } : {}),
    ...(cur
      ? { OR: [{ updatedAt: { lt: new Date(cur.ms) } }, { updatedAt: new Date(cur.ms), id: { lt: cur.id } }] }
      : {}),
  } satisfies Prisma.LadderApplicationWhereInput;
  const rows = await prisma.ladderApplication.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: q.limit + 1,
    select: applicationSelect,
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map(toApplicationV1),
    nextCursor:
      rows.length > q.limit && last ? encodeApplicationCursor({ ms: last.updatedAt.getTime(), id: last.id }) : null,
  };
}

/** One of the key owner's applications with its newest events; `null` for anyone else's or one that does not exist. */
export async function getApplicationForKey(userId: string, id: string): Promise<LadderApplicationDetailV1 | null> {
  const row = await prisma.ladderApplication.findFirst({
    where: { id, userId, job: ownerOrCatalogJobWhere(userId) },
    select: applicationSelect,
  });
  if (!row) return null;
  const events = await prisma.ladderApplicationEvent.findMany({
    where: { applicationId: row.id, userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: EVENT_LIMIT,
    select: eventSelect,
  });
  return { ...toApplicationV1(row), events: events.map(toEventV1) };
}

export type PatchResult =
  { ok: true; application: LadderApplicationDetailV1 } | { ok: false; reason: 'not_found' | 'invalid' };

/** Map the five API fields onto the site's patch (only the keys that were sent). */
export function toSitePatch(body: PatchApplicationBody): ApplicationPatch {
  const patch: ApplicationPatch = {};
  if (body.status !== undefined) patch.status = body.status;
  if (body.appliedDate !== undefined) patch.appliedDate = body.appliedDate === null ? null : new Date(body.appliedDate);
  if (body.followUpDate !== undefined) {
    patch.followUpDate = body.followUpDate === null ? null : new Date(body.followUpDate);
  }
  if (body.interviewDates !== undefined) patch.interviewDates = body.interviewDates.map((d) => new Date(d));
  if (body.notes !== undefined) patch.notes = body.notes;
  return patch;
}

/** Change one of the key owner's applications through the site's `updateApplication` (one timeline event). */
export async function patchApplicationForKey(
  userId: string,
  id: string,
  body: PatchApplicationBody,
): Promise<PatchResult> {
  const own = await prisma.ladderApplication.findFirst({
    where: { id, userId, job: ownerOrCatalogJobWhere(userId) },
    select: { jobId: true },
  });
  if (!own) return { ok: false, reason: 'not_found' };
  try {
    await updateApplication(prisma as unknown as ActionsPrisma, userId, own.jobId, toSitePatch(body));
  } catch (e) {
    // Never echo the caught error: a missing job is a 404, anything the site's validation refuses is a 400.
    return { ok: false, reason: e instanceof JobNotFoundError ? 'not_found' : 'invalid' };
  }
  const application = await getApplicationForKey(userId, id);
  return application ? { ok: true, application } : { ok: false, reason: 'not_found' };
}

export type CreateResult =
  { ok: true; application: LadderApplicationDetailV1 } | { ok: false; status: 400 | 404 | 409; message: string };

/** Add an own job through 08's `createOwnJob` (cap and refusal included); answers with the application it opens. */
export async function createOwnJobForKey(userId: string, raw: z.infer<typeof createOwnJobBody>): Promise<CreateResult> {
  const checked = ownJobBody.safeParse(raw);
  if (!checked.success) return { ok: false, status: 400, message: 'Invalid job.' };
  const body: OwnJobBody = checked.data;
  const result = await createOwnJob(userId, body);
  if (!result.ok) {
    const status = result.status === 409 ? 409 : result.status === 404 ? 404 : 400;
    return { ok: false, status, message: result.body.error };
  }
  const application = await getApplicationForKey(userId, result.value.applicationId);
  return application ? { ok: true, application } : { ok: false, status: 404, message: 'Not found.' };
}

/** Writes also draw on the member's own `write` budget, on top of the key's rate limit. */
export function writeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, { ...RATE_LIMIT_POLICIES.write, prefix: 'v1-ladder-write' }).allowed;
}

export { queryOf, readInput, readBody } from './request-input';
