/**
 * RMHLadder own jobs (sprint 13, feature 08) — the pure, client-safe half. No Prisma, no zod (the schema sits beside
 * this file in `own-jobs-schema.ts`, so a route that only needs the fragments below never ships zod).
 *
 * A member's own job is a `LadderJob` with an `ownerId` and its company a `LadderCompany` with an `ownerId`; the shared
 * catalogue keeps `ownerId = null`. Privacy rests on three fragments, one per kind of reader:
 *
 *  - `catalogJobWhere()` / `catalogCompanyWhere()` — every reader of the SHARED catalogue (search, matching, alerts,
 *    AI enrichment, expiry, recheck, the sitemap, the job's Open Graph card, company lists, interview reports) adds
 *    it, so another member's own job is not merely hidden but never read.
 *  - `ownerOrCatalogJobWhere(userId)` — the member's own readers (pipeline, offers, insights, calendar, export, the
 *    job page): catalogue rows and this member's own rows, never anyone else's.
 *
 * Which files must use which fragment is held by `CATALOG_JOB_READ_PATHS`, `OWNER_JOB_READ_PATHS` and
 * `OWN_JOB_EXEMPT_PATHS` and by the source scan in `lib/rmhladder/__tests__/catalog-job-reads.test.ts`, which fails
 * any file under `lib/`, `app/`, `server/`, `features/` or `scripts/` that reads `ladderJob` or `ladderCompany` and is
 * in none of them. There is no raw SQL over `ladder_job` today; a future one joins the registry.
 */

/** Own jobs one member may keep (checked under `lockKey(tx, 'ladder-own-job:<userId>')`). */
export const LADDER_OWN_JOB_LIMIT = 300;

export const OWN_JOB_TITLE_MAX = 160;
export const OWN_JOB_COMPANY_MAX = 120;
export const OWN_JOB_LINK_MAX = 2000;
export const OWN_JOB_LOCATION_MAX = 160;
/** Upper bound on a typed pay figure, in the currency's major units for the chosen period. */
export const OWN_JOB_PAY_MAX = 10_000_000;

export const OWN_JOB_REMOTE_STATUSES = ['onsite', 'hybrid', 'remote_us'] as const;
export type OwnJobRemoteStatus = (typeof OWN_JOB_REMOTE_STATUSES)[number];
export const OWN_JOB_EMPLOYMENT_TYPES = ['internship', 'full_time'] as const;
export type OwnJobEmploymentType = (typeof OWN_JOB_EMPLOYMENT_TYPES)[number];
export const OWN_JOB_PAY_PERIODS = ['year', 'month', 'hour'] as const;
export type OwnJobPayPeriod = (typeof OWN_JOB_PAY_PERIODS)[number];

/** What a member types: the request body of `POST` and (partially) `PATCH`. */
export interface OwnJobInput {
  title: string;
  company: string;
  link: string | null;
  location: string | null;
  remoteStatus: OwnJobRemoteStatus;
  employmentType: OwnJobEmploymentType;
  /** `YYYY-MM-DD`. */
  deadline: string | null;
  payMin: number | null;
  payMax: number | null;
  payPeriod: OwnJobPayPeriod;
  /** ISO 4217, upper case. */
  payCurrency: string;
}

/** One own job as its owner sees it. */
export interface OwnJobView {
  id: string;
  title: string;
  company: string;
  /** True when the company is the member's own row; false when the name matched a catalogue company. */
  ownCompany: boolean;
  link: string | null;
  location: string | null;
  remoteStatus: OwnJobRemoteStatus;
  employmentType: OwnJobEmploymentType;
  deadline: string | null;
  payMin: number | null;
  payMax: number | null;
  payPeriod: OwnJobPayPeriod;
  payCurrency: string;
  createdAt: string;
}

/* ── the three fragments ─────────────────────────────────────────────────── */

/** Every reader of the shared job catalogue: own jobs are never in it. */
export function catalogJobWhere(): { ownerId: null } {
  return { ownerId: null };
}

/** Every reader of the shared company catalogue: a member's own company is never in it. */
export function catalogCompanyWhere(): { ownerId: null } {
  return { ownerId: null };
}

/** The member's own readers: the catalogue plus this member's own jobs, and no one else's. */
export function ownerOrCatalogJobWhere(userId: string): { OR: [{ ownerId: null }, { ownerId: string }] } {
  return { OR: [{ ownerId: null }, { ownerId: userId }] };
}

/* ── the read-path registries (held by catalog-job-reads.test.ts) ────────── */

/**
 * Readers of the shared catalogue. Each file must use `catalogJobWhere` or `catalogCompanyWhere`, and none may be a
 * file that reads `ladderJob` / `ladderCompany` without being listed here, in `OWNER_JOB_READ_PATHS` or in
 * `OWN_JOB_EXEMPT_PATHS`.
 */
export const CATALOG_JOB_READ_PATHS = [
  'lib/og/api/og.job.$jobId.server.ts',
  'lib/rmhladder/ai/enrich-jobs.server.ts',
  'lib/rmhladder/community.server.ts',
  'lib/rmhladder/pipeline/expire-stale.ts',
  'lib/rmhladder/pipeline/process-source.ts',
  'lib/rmhladder/pipeline/recheck.ts',
  'lib/rmhladder/pipeline/run.ts',
  'lib/rmhladder/resume/service.server.ts',
  'lib/rmhladder/server/queries.ts',
  'lib/sitemap.server.ts',
  'scripts/ladder-status.ts',
  'server/ladder-worker/index.ts',
] as const satisfies readonly string[];

/**
 * The member's own readers: their pipeline, offers, insights, calendar, export and job page. Each file must use
 * `ownerOrCatalogJobWhere` (an analytics event or an import row may name an own job only for its owner).
 */
export const OWNER_JOB_READ_PATHS = [
  'app/routes/api/rmhladder/events.ts',
  'lib/api/v1/ladder.server.ts',
  'lib/rmhladder/api/rmhladder.calendar.server.ts',
  'lib/rmhladder/calendar-entries.server.ts',
  'lib/rmhladder/api/rmhladder.export.server.ts',
  'lib/rmhladder/api/rmhladder.import.server.ts',
  'lib/rmhladder/insights.server.ts',
  'lib/rmhladder/server/actions.ts',
] as const satisfies readonly string[];

/**
 * Files that touch the tables without reading a reader's view of them, each with its real reason. An entry is a
 * statement that the file cannot show a row to anyone but the row's owner.
 */
export const OWN_JOB_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/rmhladder/own-jobs.server.ts':
    'The owner module: every read and write is scoped to ownerId = the caller, and a catalogue company lookup uses catalogCompanyWhere.',
  'lib/rmhladder/seed/run-seed.ts':
    'Upserts catalogue companies by normalizedName and reads nothing back to a member; an own company is `own:<userId>:…` and cannot be matched.',
  'lib/rmhladder/own-jobs.ts':
    'Defines the fragments and the write guard; the guard names the table in its structural type and reads only the ownerId of one job id.',
};

/* ── input normalisation ─────────────────────────────────────────────────── */

/** Trim and collapse runs of whitespace (a title typed with a trailing newline is the same title). */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * The link as it is stored: an `http` or `https` URL without credentials, or `null` for none/unusable. Links are
 * stored and rendered, never fetched, so there is no request to the address here or anywhere else.
 */
export function normalizeOwnJobLink(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text || text.length > OWN_JOB_LINK_MAX) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.toString();
}

/** A pay figure on the annual axis the catalogue uses (a full-time year: 2,080 hours, 12 months). */
export function annualizePay(amount: number, period: OwnJobPayPeriod): number {
  if (period === 'hour') return Math.round(amount * 2080);
  if (period === 'month') return Math.round(amount * 12);
  return Math.round(amount);
}

/** The deadline stored for a `YYYY-MM-DD` day: noon UTC, so it falls on that date in every time zone. */
export function deadlineToDate(day: string | null): Date | null {
  if (!day) return null;
  const date = new Date(`${day}T12:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function deadlineToDay(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ── the write guard ─────────────────────────────────────────────────────── */

/** A job id the caller may not use: it does not exist, or it is another member's own job (the same answer). */
export class JobNotFoundError extends Error {
  constructor() {
    super('Job not found');
    this.name = 'JobNotFoundError';
  }
}

/** The structural slice of Prisma the guard needs (tests inject a fake; actions.ts passes its own client). */
export interface JobUsablePrisma {
  ladderJob: {
    findUnique(args: { where: { id: string }; select: { ownerId: true } }): Promise<{ ownerId?: string | null } | null>;
  };
}

/**
 * Every write that takes a `jobId` from the client (`updateApplication`, the job actions, the CSV import) calls this
 * first. A usable job is a catalogue job or an own job of this member; anything else, another member's own job
 * included, throws {@link JobNotFoundError}, so a guessed id answers exactly as a missing one does.
 */
export async function assertJobUsable(prisma: JobUsablePrisma, userId: string, jobId: string): Promise<void> {
  const row = await prisma.ladderJob.findUnique({ where: { id: jobId }, select: { ownerId: true } });
  if (!row || (row.ownerId && row.ownerId !== userId)) throw new JobNotFoundError();
}

/** True for a job row (pipeline, job page) that a member added themselves. */
export function isOwnJob(job: { ownerId?: unknown } | null | undefined): boolean {
  return typeof job?.ownerId === 'string' && job.ownerId.length > 0;
}

/**
 * The editable view of an own job from the row the pipeline and the job page already hold (a `LadderJob` with its
 * `company`), so the edit dialog needs no extra request.
 */
export function ownJobViewOf(row: Record<string, unknown>): OwnJobView {
  const company = row.company as { name?: string; ownerId?: string | null } | undefined;
  const text = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);
  const count = (value: unknown): number | null => (typeof value === 'number' ? value : null);
  const created = row.discoveredAt;
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    company: company?.name ?? '',
    ownCompany: Boolean(company?.ownerId),
    link: text(row.originalPostingUrl),
    location: text(row.locationRaw),
    remoteStatus: (row.remoteStatus as OwnJobRemoteStatus | undefined) ?? 'onsite',
    employmentType: (row.employmentType as OwnJobEmploymentType | undefined) ?? 'internship',
    deadline: deadlineToDay(row.applicationDeadline as Date | string | null | undefined),
    payMin: count(row.compensationMin),
    payMax: count(row.compensationMax),
    payPeriod: (row.payPeriod as OwnJobPayPeriod | null | undefined) ?? 'year',
    payCurrency: (row.payCurrency as string | null | undefined) ?? 'USD',
    createdAt: created instanceof Date ? created.toISOString() : typeof created === 'string' ? created : '',
  };
}
