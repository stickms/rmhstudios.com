import { ensureCachedJobProfile, type JobProfilePrisma } from './job-profile.server';
import {
  ladderAiProviderConfigured,
  type LadderAiProviderName,
} from './provider.server';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural Prisma boundary
type AnyRow = Record<string, any>;

export interface JobEnrichmentPrisma extends JobProfilePrisma {
  ladderJob: {
    findMany(args: AnyRow): Promise<AnyRow[]>;
  };
}

export interface JobEnrichmentResult {
  attempted: number;
  enriched: number;
  skipped: boolean;
}

/**
 * Enrich a bounded set of recently changed, public-eligible jobs. The shared
 * source-hash cache makes unchanged postings a cheap read and prevents model
 * fan-out across users. Missing provider credentials are an expected no-op.
 */
export async function enrichRecentLadderJobs(
  prisma: JobEnrichmentPrisma,
  options: { limit?: number; provider?: LadderAiProviderName } = {},
): Promise<JobEnrichmentResult> {
  const provider = options.provider
    ?? (process.env.LADDER_AI_PROVIDER as LadderAiProviderName | undefined)
    ?? 'deepseek';
  if (!ladderAiProviderConfigured(provider)) {
    return { attempted: 0, enriched: 0, skipped: true };
  }

  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);
  const baseWhere = {
    status: 'active',
    earlyCareerClassification: { in: ['yes', 'probable'] },
    company: { enabled: true },
  };
  const [pending, recentlyChanged] = await Promise.all([
    prisma.ladderJob.findMany({
      where: {
        ...baseWhere,
        OR: [
          { profile: { is: null } },
          { profile: { is: { provider: 'deterministic' } } },
        ],
      },
      include: { company: true },
      orderBy: [{ profile: { updatedAt: 'asc' } }, { updatedAt: 'asc' }],
      take: limit * 4,
    }),
    prisma.ladderJob.findMany({
      where: baseWhere,
      include: { company: true },
      orderBy: [{ updatedAt: 'desc' }],
      take: limit * 2,
    }),
  ]);
  const jobs = [...pending, ...recentlyChanged]
    .filter((job, index, rows) => rows.findIndex((candidate) => candidate.id === job.id) === index)
    .slice(0, limit);

  let enriched = 0;
  for (const job of jobs) {
    try {
      await ensureCachedJobProfile(
        prisma,
        {
          id: job.id as string,
          title: job.title as string,
          descriptionSummary: (job.descriptionSummary as string | null) ?? null,
          fullDescription: (job.descriptionText as string | null) ?? null,
          locationRaw: (job.locationRaw as string | null) ?? null,
          city: (job.city as string | null) ?? null,
          state: (job.state as string | null) ?? null,
          remoteStatus: job.remoteStatus as 'onsite' | 'hybrid' | 'remote_us',
          earlyCareerClassification: job.earlyCareerClassification as string,
          programType: job.programType as string,
          company: job.company as { name?: string | null } | null,
        },
        { allowAi: true, provider },
      );
      enriched++;
    } catch {
      // One malformed posting or provider response must not stop the batch.
    }
  }

  return { attempted: jobs.length, enriched, skipped: false };
}
