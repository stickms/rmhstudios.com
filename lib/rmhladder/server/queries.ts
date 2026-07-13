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
  ladderAlertEvent: { findMany(args: AnyRow): Promise<AnyRow[]> };
}

const NON_US_STATUSES = ['non_us_role', 'blocked_or_inaccessible'];
const PUBLIC_VERIFICATION_STATUSES = ['verified_active', 'verified_probable'];
const PUBLIC_EARLY_CAREER_CLASSES = ['yes', 'probable'];
const DEFAULT_RELEVANCE_THRESHOLD = 60;
const DAY = 86_400_000;
const DEFAULT_TAKE = 50;
const PUBLIC_COMPANY_SELECT = {
  id: true,
  name: true,
  normalizedName: true,
  industry: true,
  firmType: true,
  priorityLevel: true,
  enabled: true,
} as const;

const FINANCE_INDUSTRIES = [
  'Investment Banking', 'Private Equity', 'Venture Capital', 'Asset Management',
  'Markets / Sales & Trading', 'FinTech', 'finance',
];
const CONSULTING_INDUSTRIES = ['Management Consulting', 'consulting'];
const TECH_INDUSTRIES = ['Technology', 'tech'];

export interface ListJobsFilters {
  preset?: 'new' | 'finance' | 'consulting' | 'tech' | 'expiring' | 'remote' | 'saved' | 'ignored';
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
  applicationStatus: string | null;
  finalRelevance: number;
}

function latestVerificationOf(job: AnyRow): AnyRow | null {
  return (job.verifications as AnyRow[] | undefined)?.[0] ?? null;
}

function toPublicJob(job: AnyRow): AnyRow {
  const {
    sourceId: _sourceId,
    sourceUrl: _sourceUrl,
    canonicalApplyUrl: _canonicalApplyUrl,
    externalId: _externalId,
    externalRequisitionId: _externalRequisitionId,
    descriptionText: _descriptionText,
    fullDescription: _fullDescription,
    contentHash: _contentHash,
    dedupeHash: _dedupeHash,
    alternateUrls: _alternateUrls,
    matchingKeywords: _matchingKeywords,
    failedCheckCount: _failedCheckCount,
    ...publicJob
  } = job;
  return publicJob;
}

async function loadUserContext(prisma: QueriesPrisma, userId: string | null) {
  if (!userId) {
    return {
      prefs: null,
      keywords: [],
      watchlistCompanyIds: new Set<string>(),
      preferredCities: [],
      preferredProgramTypes: [] as string[],
      relevanceThreshold: DEFAULT_RELEVANCE_THRESHOLD,
    };
  }
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
    preferredProgramTypes: (prefs?.preferredProgramTypes as string[] | undefined) ?? [],
    relevanceThreshold:
      (prefs?.relevanceThreshold as number | undefined) ?? DEFAULT_RELEVANCE_THRESHOLD,
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
  userId: string | null,
  filters: ListJobsFilters,
): Promise<{ rows: JobRow[]; nextCursor: string | null }> {
  const now = new Date();
  // non-US rows persist with status 'unknown' (see process-source mapJobStatus);
  // include them only when the toggle is on.
  const where: AnyRow = filters.includeNonUS
    ? {
        status: { in: ['active', 'unknown'] },
        earlyCareerClassification: { in: PUBLIC_EARLY_CAREER_CLASSES },
        company: { enabled: true },
      }
    : {
        status: 'active',
        earlyCareerClassification: { in: PUBLIC_EARLY_CAREER_CLASSES },
        company: { enabled: true },
      };

  const ctx = await loadUserContext(prisma, userId);

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
      where.company = { enabled: true, industry: { in: FINANCE_INDUSTRIES } };
      break;
    case 'consulting':
      where.company = { enabled: true, industry: { in: CONSULTING_INDUSTRIES } };
      break;
    case 'tech':
      where.company = { enabled: true, industry: { in: TECH_INDUSTRIES } };
      break;
  }
  if (filters.q) {
    where.AND = [{
      OR: [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { roleCategory: { contains: filters.q, mode: 'insensitive' } },
        { locationRaw: { contains: filters.q, mode: 'insensitive' } },
        { descriptionSummary: { contains: filters.q, mode: 'insensitive' } },
        { company: { name: { contains: filters.q, mode: 'insensitive' } } },
      ],
    }];
  }
  if (filters.cities?.length) where.city = { in: filters.cities };
  const programTypes = filters.programTypes?.length
    ? filters.programTypes
    : ctx.preferredProgramTypes;
  if (programTypes.length) where.programType = { in: programTypes };

  const candidates = await prisma.ladderJob.findMany({
    where,
    include: {
      company: { select: PUBLIC_COMPANY_SELECT },
      verifications: { orderBy: { checkedAt: 'desc' }, take: 1 },
    },
    orderBy: [{ relevanceScoreBase: 'desc' }],
  });

  const [actions, applications] = userId
    ? await Promise.all([
        prisma.ladderJobAction.findMany({ where: { userId } }),
        prisma.ladderApplication.findMany({ where: { userId } }),
      ])
    : [[], []];
  const actionByJob = new Map(actions.map((a) => [a.jobId as string, a.action as string]));
  const applicationByJob = new Map(
    applications.map((application) => [application.jobId as string, application.status as string]),
  );

  const rows: JobRow[] = [];
  for (const job of candidates) {
    const latest = latestVerificationOf(job);
    const verificationStatus = latest?.status as string | undefined;
    const eligibleVerification = verificationStatus
      ? PUBLIC_VERIFICATION_STATUSES.includes(verificationStatus) ||
        (filters.includeNonUS === true && verificationStatus === 'non_us_role')
      : false;
    if (!latest || !eligibleVerification) continue;
    if (!filters.includeNonUS && latest && NON_US_STATUSES.includes(latest.status as string)) continue;

    const storedAction = actionByJob.get(job.id as string) ?? null;
    if (filters.preset === 'saved' && storedAction !== 'saved') continue;
    if (filters.preset === 'ignored' && storedAction !== 'ignored') continue;
    if (filters.preset !== 'ignored' && storedAction === 'ignored') continue;

    const scorable = toScorable(job);
    const boost = computeUserBoost(scorable, {
      keywords: ctx.keywords,
      watchlistCompanyIds: ctx.watchlistCompanyIds,
      companyId: job.companyId as string,
      preferredCities: ctx.preferredCities,
    });
    if (boost.blocked) continue;

    const score = finalRelevance((job.relevanceScoreBase as number) ?? 0, boost.boost);
    if (score < ctx.relevanceThreshold) continue;

    rows.push({
      ...toPublicJob(job),
      latestVerification: latest,
      userAction: ['saved', 'ignored'].includes(storedAction ?? '')
        ? storedAction!
        : null,
      applicationStatus: applicationByJob.get(job.id as string) ?? null,
      finalRelevance: score,
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
  userId: string | null,
  jobId: string,
): Promise<AnyRow | null> {
  const job = await prisma.ladderJob.findUnique({
    where: { id: jobId },
    include: {
      company: { select: PUBLIC_COMPANY_SELECT },
      verifications: { orderBy: { checkedAt: 'desc' } },
      ...(userId
        ? {
            actions: { where: { userId } },
            applications: { where: { userId } },
          }
        : {}),
    },
  });
  if (!job) return null;
  const latest = (job.verifications as AnyRow[] | undefined)?.[0];
  if (
    job.status !== 'active' ||
    (job.company as AnyRow | undefined)?.enabled !== true ||
    !PUBLIC_EARLY_CAREER_CLASSES.includes(job.earlyCareerClassification as string) ||
    !latest ||
    !PUBLIC_VERIFICATION_STATUSES.includes(latest.status as string)
  ) {
    return null;
  }
  const storedAction = (job.actions as AnyRow[] | undefined)?.[0]?.action as string | undefined;
  return {
    ...toPublicJob(job),
    userAction: storedAction === 'saved' || storedAction === 'ignored' ? storedAction : null,
    application: (job.applications as AnyRow[] | undefined)?.[0] ?? null,
  };
}

export async function getOverview(
  prisma: QueriesPrisma,
  userId: string | null,
  options: { includeAdminStats?: boolean } = {},
) {
  const now = new Date();
  const [activeJobs, openTasks, runs, actions, applications] = await Promise.all([
    prisma.ladderJob.findMany({
      where: {
        status: 'active',
        earlyCareerClassification: { in: PUBLIC_EARLY_CAREER_CLASSES },
        company: { enabled: true },
      },
      include: { verifications: { orderBy: { checkedAt: 'desc' }, take: 1 } },
    }),
    options.includeAdminStats
      ? prisma.ladderReviewTask.findMany({ where: { status: 'open' } })
      : Promise.resolve([]),
    prisma.ladderScrapeRun.findMany({
      orderBy: [{ startedAt: 'desc' }],
      take: 1,
      select: {
        id: true,
        trigger: true,
        startedAt: true,
        finishedAt: true,
        discoveredCount: true,
        newCount: true,
        verifiedCount: true,
        expiredCount: true,
        errorCount: true,
      },
    }),
    userId ? prisma.ladderJobAction.findMany({ where: { userId } }) : Promise.resolve([]),
    userId ? prisma.ladderApplication.findMany({ where: { userId } }) : Promise.resolve([]),
  ]);

  const eligible = activeJobs.filter((job) => {
    const latest = latestVerificationOf(job);
    return latest && PUBLIC_VERIFICATION_STATUSES.includes(latest.status as string);
  });
  const freshThreshold = new Date(now.getTime() - 7 * DAY);
  const deadlineThreshold = new Date(now.getTime() + 14 * DAY);

  return {
    newThisWeek: eligible.filter((job) => new Date(job.discoveredAt as Date) >= freshThreshold).length,
    verifiedActive: eligible.length,
    expiringSoon: eligible.filter(
      (job) => job.applicationDeadline && new Date(job.applicationDeadline as Date) <= deadlineThreshold,
    ).length,
    openReviewTasks: openTasks.length,
    lastRun: runs[0]
      ? {
          id: runs[0].id,
          trigger: runs[0].trigger,
          startedAt: runs[0].startedAt,
          finishedAt: runs[0].finishedAt,
          discoveredCount: runs[0].discoveredCount,
          newCount: runs[0].newCount,
          verifiedCount: runs[0].verifiedCount,
          expiredCount: runs[0].expiredCount,
          errorCount: runs[0].errorCount,
        }
      : null,
    savedCount: actions.filter((a) => a.action === 'saved').length,
    appliedCount: applications.filter(
      (application) => !['not_applied', 'planning'].includes(application.status as string),
    ).length,
  };
}

export async function listReviewTasks(prisma: QueriesPrisma, filters: { status?: string } = {}) {
  return prisma.ladderReviewTask.findMany({
    where: { status: filters.status ?? 'open' },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      job: { include: { company: true, verifications: { orderBy: { checkedAt: 'desc' }, take: 1 } } },
      source: true,
    },
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
    orderBy: [{ name: 'asc' }],
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

/** Sources still active but silent for two expected four-hour scrape cycles. */
export async function listStaleSources(prisma: QueriesPrisma, now = new Date()) {
  const threshold = new Date(now.getTime() - 8 * 60 * 60 * 1000);
  return prisma.ladderSource.findMany({
    where: {
      status: { in: ['active', 'error'] },
      OR: [
        { status: 'error' },
        { lastSuccessAt: null },
        { lastSuccessAt: { lt: threshold } },
      ],
    },
    include: { company: true },
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

/** All of a user's applications with job + company context, for the pipeline ladder. */
export async function listApplications(prisma: QueriesPrisma, userId: string) {
  return prisma.ladderApplication.findMany({
    where: { userId },
    include: { job: { include: { company: true } } },
  });
}

export async function listAlerts(prisma: QueriesPrisma, userId: string) {
  return prisma.ladderAlertEvent.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }],
    include: {
      job: { include: { company: true } },
      deliveries: true,
    },
  });
}
