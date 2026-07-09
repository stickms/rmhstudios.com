/**
 * rmhladder dashboard — read-side query layer.
 *
 * Every function takes a structurally-typed prisma client so tests inject an
 * in-memory fake (see queries.test.ts). No prisma import here.
 *
 * US-ness display rule: a job appears in default views only when its LATEST
 * verification status is not non_us_role / blocked_or_inaccessible. The
 * `country` column is never used for US-ness (see Plan-3 review).
 */

import { computeUserBoost, finalRelevance, type ScorableJob } from '../scoring';
import type { ProgramType } from '../classifiers/early-career';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural prisma rows
type AnyRow = Record<string, any>;

/** Minimal structural prisma surface used by this module. */
export interface QueriesPrisma {
  ladderJob: {
    findMany(args: AnyRow): Promise<AnyRow[]>;
    findUnique(args: AnyRow): Promise<AnyRow | null>;
  };
  ladderCompany: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderReviewTask: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderSource: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderScrapeRun: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderUserPrefs: {
    findUnique(args: AnyRow): Promise<AnyRow | null>;
    upsert(args: AnyRow): Promise<AnyRow>;
  };
  ladderKeyword: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderWatchlistEntry: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderJobAction: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderApplication: { findMany(args: AnyRow): Promise<AnyRow[]> };
  ladderAlert: { findMany(args: AnyRow): Promise<AnyRow[]> };
}

const NON_US_STATUSES = ['non_us_role', 'blocked_or_inaccessible'];
const DAY = 86_400_000;
/** listJobs fetches at most this many candidates before JS-side scoring. */
const CANDIDATE_CAP = 500;
const DEFAULT_TAKE = 50;

const FINANCE_INDUSTRIES = [
  'Investment Banking', 'Private Equity', 'Venture Capital', 'Asset Management',
  'Markets / Sales & Trading', 'FinTech', 'finance',
];
const CONSULTING_INDUSTRIES = ['Management Consulting', 'consulting'];
const TECH_INDUSTRIES = ['Technology', 'tech'];

export interface ListJobsFilters {
  preset?: 'new' | 'finance' | 'consulting' | 'tech' | 'expiring' | 'remote';
  q?: string;
  cities?: string[];
  programTypes?: string[];
  includeNonUS?: boolean;
  sort?: 'relevance' | 'posted' | 'deadline';
  cursor?: string;
  take?: number;
}

export interface JobRow extends AnyRow {
  latestVerification: AnyRow | null;
  userAction: string | null;
  finalRelevance: number;
}

function latestVerificationOf(job: AnyRow): AnyRow | null {
  return (job.verifications as AnyRow[] | undefined)?.[0] ?? null;
}

async function loadUserContext(prisma: QueriesPrisma, userId: string) {
  const [prefs, keywords, watchlist] = await Promise.all([
    prisma.ladderUserPrefs.findUnique({ where: { userId } }),
    prisma.ladderKeyword.findMany({ where: { userId } }),
    prisma.ladderWatchlistEntry.findMany({ where: { userId } }),
  ]);
  return {
    prefs,
    keywords: keywords.map((k) => ({
      keyword: k.keyword as string,
      weight: k.weight as number,
      type: k.type as 'boost' | 'block',
    })),
    watchlistCompanyIds: new Set<string>(watchlist.map((w) => w.companyId as string)),
    preferredCities: (prefs?.preferredCities as string[] | undefined) ?? [],
  };
}

function toScorable(job: AnyRow): ScorableJob {
  const company = job.company as AnyRow | undefined;
  return {
    programType: (job.programType ?? 'other') as ProgramType,
    roleCategory: (job.roleCategory as string | null) ?? null,
    industry: (company?.industry as string | null) ?? (job.industry as string | null) ?? null,
    isUS: true, // boost does not use it; display filtering happens separately
    remoteStatus: (job.remoteStatus ?? 'onsite') as ScorableJob['remoteStatus'],
    city: (job.city as string | null) ?? null,
    postingDate: job.postingDate ? new Date(job.postingDate) : null,
    applicationDeadline: job.applicationDeadline ? new Date(job.applicationDeadline) : null,
    companyPriority: (company?.priorityLevel as number | undefined) ?? 3,
    companyIsTarget: ((company?.priorityLevel as number | undefined) ?? 3) <= 2,
    title: job.title as string,
  };
}

export async function listJobs(
  prisma: QueriesPrisma,
  userId: string,
  filters: ListJobsFilters,
): Promise<{ rows: JobRow[]; nextCursor: string | null }> {
  const now = new Date();
  const where: AnyRow = { status: 'active' };

  switch (filters.preset) {
    case 'new':
      where.discoveredAt = { gte: new Date(now.getTime() - 7 * DAY) };
      break;
    case 'expiring':
      where.applicationDeadline = { lte: new Date(now.getTime() + 14 * DAY) };
      break;
    case 'remote':
      where.remoteStatus = 'remote_us';
      break;
    case 'finance':
      where.company = { industry: { in: FINANCE_INDUSTRIES } };
      break;
    case 'consulting':
      where.company = { industry: { in: CONSULTING_INDUSTRIES } };
      break;
    case 'tech':
      where.company = { industry: { in: TECH_INDUSTRIES } };
      break;
  }
  if (filters.q) where.title = { contains: filters.q, mode: 'insensitive' };
  if (filters.cities?.length) where.city = { in: filters.cities };
  if (filters.programTypes?.length) where.programType = { in: filters.programTypes };

  const candidates = await prisma.ladderJob.findMany({
    where,
    include: {
      company: true,
      verifications: { orderBy: { checkedAt: 'desc' }, take: 1 },
    },
    take: CANDIDATE_CAP,
  });

  const ctx = await loadUserContext(prisma, userId);
  const actions = await prisma.ladderJobAction.findMany({ where: { userId } });
  const actionByJob = new Map(actions.map((a) => [a.jobId as string, a.action as string]));

  const rows: JobRow[] = [];
  for (const job of candidates) {
    const latest = latestVerificationOf(job);
    if (!filters.includeNonUS && latest && NON_US_STATUSES.includes(latest.status as string)) continue;

    const scorable = toScorable(job);
    const boost = computeUserBoost(scorable, {
      keywords: ctx.keywords,
      watchlistCompanyIds: ctx.watchlistCompanyIds,
      companyId: job.companyId as string,
      preferredCities: ctx.preferredCities,
    });
    if (boost.blocked) continue;

    rows.push({
      ...job,
      latestVerification: latest,
      userAction: actionByJob.get(job.id as string) ?? null,
      finalRelevance: finalRelevance((job.relevanceScoreBase as number) ?? 0, boost.boost),
    });
  }

  const sort = filters.sort ?? 'relevance';
  if (sort === 'relevance') {
    rows.sort((a, b) => b.finalRelevance - a.finalRelevance);
  } else if (sort === 'posted') {
    rows.sort(
      (a, b) =>
        new Date((b.postingDate ?? b.discoveredAt) as Date).getTime() -
        new Date((a.postingDate ?? a.discoveredAt) as Date).getTime(),
    );
  } else {
    // deadline asc, nulls last
    rows.sort((a, b) => {
      const ad = a.applicationDeadline ? new Date(a.applicationDeadline as Date).getTime() : Infinity;
      const bd = b.applicationDeadline ? new Date(b.applicationDeadline as Date).getTime() : Infinity;
      return ad - bd;
    });
  }

  const offset = filters.cursor ? Number.parseInt(filters.cursor, 10) || 0 : 0;
  const take = filters.take ?? DEFAULT_TAKE;
  const page = rows.slice(offset, offset + take);
  const nextCursor = offset + take < rows.length ? String(offset + take) : null;
  return { rows: page, nextCursor };
}

export async function getJobDetail(
  prisma: QueriesPrisma,
  userId: string,
  jobId: string,
): Promise<AnyRow | null> {
  const job = await prisma.ladderJob.findUnique({
    where: { id: jobId },
    include: {
      company: true,
      verifications: { orderBy: { checkedAt: 'desc' } },
      actions: { where: { userId } },
      applications: { where: { userId } },
    },
  });
  if (!job) return null;
  return {
    ...job,
    userAction: (job.actions as AnyRow[] | undefined)?.[0]?.action ?? null,
    application: (job.applications as AnyRow[] | undefined)?.[0] ?? null,
  };
}

export async function getOverview(prisma: QueriesPrisma, userId: string) {
  const now = new Date();
  const [freshJobs, activeJobs, expiring, openTasks, runs, actions, applications] = await Promise.all([
    prisma.ladderJob.findMany({ where: { status: 'active', discoveredAt: { gte: new Date(now.getTime() - 7 * DAY) } } }),
    prisma.ladderJob.findMany({
      where: { status: 'active' },
      include: { verifications: { orderBy: { checkedAt: 'desc' }, take: 1 } },
    }),
    prisma.ladderJob.findMany({ where: { status: 'active', applicationDeadline: { lte: new Date(now.getTime() + 14 * DAY) } } }),
    prisma.ladderReviewTask.findMany({ where: { status: 'open' } }),
    prisma.ladderScrapeRun.findMany({ orderBy: [{ startedAt: 'desc' }], take: 1 }),
    prisma.ladderJobAction.findMany({ where: { userId } }),
    prisma.ladderApplication.findMany({ where: { userId } }),
  ]);

  return {
    newThisWeek: freshJobs.length,
    verifiedActive: activeJobs.filter((j) => latestVerificationOf(j)?.status === 'verified_active').length,
    expiringSoon: expiring.length,
    openReviewTasks: openTasks.length,
    lastRun: (runs[0] as AnyRow | undefined) ?? null,
    savedCount: actions.filter((a) => a.action === 'saved').length,
    appliedCount: applications.length,
  };
}

export async function listReviewTasks(prisma: QueriesPrisma, filters: { status?: string } = {}) {
  return prisma.ladderReviewTask.findMany({
    where: { status: filters.status ?? 'open' },
    include: { job: { include: { company: true } }, source: true },
  });
}

export async function listCompanies(
  prisma: QueriesPrisma,
  filters: { q?: string; enabledOnly?: boolean } = {},
) {
  const where: AnyRow = {};
  if (filters.enabledOnly) where.enabled = true;
  if (filters.q) where.OR = [{ name: { contains: filters.q, mode: 'insensitive' } }];
  const companies = await prisma.ladderCompany.findMany({
    where,
    include: { sources: true, _count: { select: { jobs: { where: { status: 'active' } } } } },
  });
  return companies.map((c) => ({
    ...c,
    activeJobCount: (c._count as AnyRow | undefined)?.jobs ?? 0,
  }));
}

export async function listRuns(prisma: QueriesPrisma, take = 20) {
  return prisma.ladderScrapeRun.findMany({
    orderBy: [{ startedAt: 'desc' }],
    take,
    include: { errors: true },
  });
}

/** Sources still 'active' but silent: lastSuccessAt null or older than 48h. */
export async function listStaleSources(prisma: QueriesPrisma, now = new Date()) {
  const threshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  return prisma.ladderSource.findMany({
    where: {
      status: 'active',
      OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: threshold } }],
    },
  });
}

export async function getSettings(prisma: QueriesPrisma, userId: string) {
  const prefs = await prisma.ladderUserPrefs.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  const [keywords, watchlist] = await Promise.all([
    prisma.ladderKeyword.findMany({ where: { userId } }),
    prisma.ladderWatchlistEntry.findMany({ where: { userId } }),
  ]);
  return { prefs, keywords, watchlistCompanyIds: watchlist.map((w) => w.companyId as string) };
}

export async function listAlerts(prisma: QueriesPrisma, userId: string) {
  return prisma.ladderAlert.findMany({
    where: { userId },
    orderBy: [{ sentAt: 'desc' }],
    include: { job: { include: { company: true } } },
  });
}
