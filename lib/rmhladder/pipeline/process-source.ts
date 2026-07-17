import { getAdapter } from '../adapters/index';
import { memoFetch } from './memo-fetch';
import { assessJob } from './ingest';
import type { VerificationStatus } from '../verification';

// ── Public types ─────────────────────────────────────────────────────────────

export interface SourceRunStats {
  discovered: number;
  created: number;
  updated: number;
  verified: number;
  reviewTasks: number;
  recordErrors: Array<{ externalId: string; message: string }>;
  errored: boolean;
  errorMessage?: string;
}

/**
 * Structural type covering only the Prisma model methods used by processSource.
 * Tests inject an in-memory fake rather than mocking the prisma package.
 */
export interface PrismaLike {
  ladderJob: {
    findUnique(args: {
      where: { sourceId_externalId: { sourceId: string; externalId: string } };
      select?: Record<string, unknown>;
    }): Promise<{
      id: string;
      discoveredAt: Date;
      alternateUrls: string[];
      originalPostingUrl: string;
    } | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
    upsert(args: {
      where: { sourceId_externalId: { sourceId: string; externalId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{
      id: string;
      discoveredAt: Date;
      alternateUrls: string[];
      originalPostingUrl: string;
    }>;
  };
  ladderVerification: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  ladderReviewTask: {
    findFirst(args: {
      where: { jobId: string; reason: string; status: string };
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  ladderSource: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapJobStatus(vs: VerificationStatus): 'active' | 'expired' | 'unknown' {
  if (vs === 'verified_active' || vs === 'verified_probable') return 'active';
  if (vs === 'expired') return 'expired';
  return 'unknown';
}

const ZERO_STATS: SourceRunStats = {
  discovered: 0,
  created: 0,
  updated: 0,
  verified: 0,
  reviewTasks: 0,
  recordErrors: [],
  errored: false,
};

// ── processSource ────────────────────────────────────────────────────────────

export async function processSource(
  deps: {
    prisma: PrismaLike;
    fetchImpl?: typeof fetch;
    /** Injected for determinism in tests; defaults to new Date(). */
    now?: Date;
  },
  source: {
    id: string;
    platform: string;
    slug: string | null;
    url?: string | null;
    company: { id: string; name: string; priorityLevel: number };
  },
): Promise<SourceRunStats> {
  // 1. Resolve adapter — null platform or null slug → early-return errored, no DB writes.
  const adapter = getAdapter(source.platform);
  if (!adapter) {
    return {
      ...ZERO_STATS,
      errored: true,
      errorMessage: `No adapter registered for platform: ${source.platform}`,
    };
  }
  if (!source.slug && !(source.platform === 'workday' && source.url)) {
    return {
      ...ZERO_STATS,
      errored: true,
      errorMessage: `Source ${source.id} has no slug configured`,
    };
  }

  const now = deps.now ?? new Date();
  // Mutable stats object updated as we go; returned inside catch to reflect partial work.
  const stats: SourceRunStats = { ...ZERO_STATS, recordErrors: [] };

  try {
    // 2. One memoized fetch per processSource call — verify never re-hits the network.
    const memoized = memoFetch(deps.fetchImpl);
    const ctx = {
      slug: source.slug ?? source.url!,
      companyName: source.company.name,
      sourceUrl: source.url,
      fetchImpl: memoized,
    };

    // 3. Discover jobs.
    const { jobs: normalizedJobs, fetchSucceeded } = await adapter.discoverJobs(ctx);
    stats.discovered = normalizedJobs.length;

    // Zero discoveries: a successfully-fetched empty board means the source is
    // alive but has no current reqs (stamp success); a failed fetch is a real
    // failure (increment). Conflating them wrongly flagged healthy firms silent.
    if (stats.discovered === 0) {
      if (fetchSucceeded) {
        await deps.prisma.ladderSource.update({
          where: { id: source.id },
          data: {
            status: 'active',
            lastAttemptAt: now,
            lastSuccessAt: now,
            nextProbeAt: null,
            consecutiveFailures: 0,
          },
        });
        return { ...stats };
      }
      await deps.prisma.ladderSource.update({
        where: { id: source.id },
        data: { lastAttemptAt: now, consecutiveFailures: { increment: 1 } },
      });
      return { ...stats, errored: true, errorMessage: 'board fetch failed (no jobs discovered)' };
    }

    // 4. Per-job pipeline.
    for (const normalized of normalizedJobs) {
      try {
        // 4a. Verify — re-uses the memoized fetch, no extra network round-trip.
        const evidence = await adapter.verifyJob(ctx, {
          externalId: normalized.externalId,
          title: normalized.title,
        });

        // 4b. Assess (classification, scoring, dedupeHash, reviewReasons).
        const assessment = assessJob({
          normalized,
          companyName: source.company.name,
          companyId: source.company.id,
          companyPriority: source.company.priorityLevel,
          platform: source.platform,
          evidence,
        });

        const f = assessment.fields;
        const jobStatus = mapJobStatus(f.verificationStatus);
        const isVerified =
          f.verificationStatus === 'verified_active' ||
          f.verificationStatus === 'verified_probable';

        // 4c. Source + external ID is authoritative identity. The fuzzy dedupe
        //     hash only flags possible duplicates and never merges requisitions.
        if (!f.externalId) {
          throw new Error(`Adapter ${source.platform} returned a job without an external ID`);
        }
        const existing = await deps.prisma.ladderJob.findUnique({
          where: { sourceId_externalId: { sourceId: source.id, externalId: f.externalId } },
        });
        const isNew = existing === null;
        const possibleDuplicate = isNew
          ? await deps.prisma.ladderJob.findFirst({
              where: {
                dedupeHash: assessment.dedupeHash,
                NOT: { sourceId: source.id, externalId: f.externalId },
              },
              select: { id: true },
            })
          : null;

        // When the canonical URL has changed, push the OLD url into alternateUrls (deduped, cap 10).
        let mergedAlternates: string[] | undefined;
        if (existing && existing.originalPostingUrl !== f.originalPostingUrl) {
          const combined = [...existing.alternateUrls, existing.originalPostingUrl];
          mergedAlternates = [...new Set(combined)]
            .filter((u) => u !== f.originalPostingUrl)
            .slice(0, 10);
        }

        // 4d. Upsert the job row.
        const upserted = await deps.prisma.ladderJob.upsert({
          where: { sourceId_externalId: { sourceId: source.id, externalId: f.externalId } },
          create: {
            companyId: source.company.id,
            sourceId: source.id,
            dedupeHash: assessment.dedupeHash,
            title: f.title,
            normalizedTitle: f.normalizedTitle,
            programType: f.programType,
            locationRaw: f.locationRaw,
            city: f.city,
            state: f.state,
            country: f.country,
            remoteStatus: f.remoteStatus,
            employmentType: f.employmentType,
            postingDate: f.postingDate,
            applicationDeadline: f.applicationDeadline,
            sourcePlatform: source.platform,
            sourceUrl: f.sourceUrl,
            originalPostingUrl: f.originalPostingUrl,
            canonicalApplyUrl: f.canonicalApplyUrl,
            externalRequisitionId: f.externalRequisitionId,
            externalId: f.externalId,
            descriptionSummary: f.descriptionSummary,
            descriptionText: f.descriptionText,
            fullDescription: f.fullDescription,
            contentHash: f.contentHash,
            earlyCareerScore: f.earlyCareerScore,
            earlyCareerClassification: f.earlyCareerClassification,
            usLocationConfidence: f.usLocationConfidence,
            relevanceScoreBase: f.relevanceScoreBase,
            urgencyFlag: f.urgencyFlag,
            graduationYearTarget: f.graduationYearTarget,
            schoolYearTarget: f.schoolYearTarget,
            status: jobStatus,
            failedCheckCount: 0,
            alternateUrls: [],
            discoveredAt: now,
            lastSeenAt: now,
            lastCheckedAt: now,
            lastVerifiedAt: isVerified ? now : null,
          },
          update: {
            lastCheckedAt: now,
            lastSeenAt: now,
            failedCheckCount: 0,
            sourceId: source.id,
            dedupeHash: assessment.dedupeHash,
            title: f.title,
            normalizedTitle: f.normalizedTitle,
            programType: f.programType,
            locationRaw: f.locationRaw,
            city: f.city,
            state: f.state,
            relevanceScoreBase: f.relevanceScoreBase,
            earlyCareerScore: f.earlyCareerScore,
            earlyCareerClassification: f.earlyCareerClassification,
            urgencyFlag: f.urgencyFlag,
            status: jobStatus,
            country: f.country,
            remoteStatus: f.remoteStatus,
            employmentType: f.employmentType,
            postingDate: f.postingDate,
            applicationDeadline: f.applicationDeadline,
            sourceUrl: f.sourceUrl,
            canonicalApplyUrl: f.canonicalApplyUrl,
            externalRequisitionId: f.externalRequisitionId,
            descriptionSummary: f.descriptionSummary,
            descriptionText: f.descriptionText,
            fullDescription: f.fullDescription,
            contentHash: f.contentHash,
            usLocationConfidence: f.usLocationConfidence,
            graduationYearTarget: f.graduationYearTarget,
            schoolYearTarget: f.schoolYearTarget,
            ...(isVerified ? { lastVerifiedAt: now } : {}),
            originalPostingUrl: f.originalPostingUrl,
            ...(mergedAlternates !== undefined ? { alternateUrls: mergedAlternates } : {}),
          },
        });

        // Detect created vs updated from the pre-read result (real-Prisma-safe; avoids discoveredAt===now heuristic).
        if (isNew) {
          stats.created++;
        } else {
          stats.updated++;
        }
        if (isVerified) stats.verified++;

        if (possibleDuplicate) {
          const existingTask = await deps.prisma.ladderReviewTask.findFirst({
            where: { jobId: upserted.id, reason: 'possible_duplicate', status: 'open' },
          });
          if (!existingTask) {
            await deps.prisma.ladderReviewTask.create({
              data: {
                jobId: upserted.id,
                sourceId: source.id,
                reason: 'possible_duplicate',
                status: 'open',
              },
            });
            stats.reviewTasks++;
          }
        }

        // 4e. Record verification row.
        await deps.prisma.ladderVerification.create({
          data: {
            jobId: upserted.id,
            status: f.verificationStatus,
            confidence: f.verificationConfidence,
            evidence: f.verificationEvidence,
          },
        });

        // 4f. Create review tasks — one open task per reason, no duplicates.
        for (const reason of assessment.reviewReasons) {
          const existingTask = await deps.prisma.ladderReviewTask.findFirst({
            where: { jobId: upserted.id, reason, status: 'open' },
          });
          if (!existingTask) {
            await deps.prisma.ladderReviewTask.create({
              data: {
                jobId: upserted.id,
                sourceId: source.id,
                reason,
                status: 'open',
              },
            });
            stats.reviewTasks++;
          }
        }
      } catch (error) {
        stats.recordErrors.push({
          externalId: normalized.externalId || 'unknown',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (stats.created + stats.updated === 0 && stats.recordErrors.length > 0) {
      const message = `all ${stats.discovered} discovered records failed processing`;
      await deps.prisma.ladderSource.update({
        where: { id: source.id },
        data: {
          status: 'error',
          lastAttemptAt: now,
          nextProbeAt: new Date(now.getTime() + 4 * 60 * 60 * 1_000),
          consecutiveFailures: { increment: 1 },
        },
      });
      return { ...stats, errored: true, errorMessage: message };
    }

    // 5. Mark the source as successfully processed.
    await deps.prisma.ladderSource.update({
      where: { id: source.id },
      data: {
        status: 'active',
        lastAttemptAt: now,
        lastSuccessAt: now,
        nextProbeAt: null,
        consecutiveFailures: 0,
      },
    });

    return stats;
  } catch (err) {
    // Per-source try/catch: any throw returns partial stats + errored flag. Never rethrows.
    try {
      await deps.prisma.ladderSource.update({
        where: { id: source.id },
        data: {
          status: 'error',
          lastAttemptAt: now,
          nextProbeAt: new Date(now.getTime() + 4 * 60 * 60 * 1_000),
          consecutiveFailures: { increment: 1 },
        },
      });
    } catch {
      // Preserve the original source error when health bookkeeping also fails.
    }
    return {
      ...stats,
      errored: true,
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
