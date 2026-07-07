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
      where: { dedupeHash: string };
      select?: Record<string, unknown>;
    }): Promise<{ id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string } | null>;
    upsert(args: {
      where: { dedupeHash: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string }>;
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
  if (!source.slug) {
    return {
      ...ZERO_STATS,
      errored: true,
      errorMessage: `Source ${source.id} has no slug configured`,
    };
  }

  const now = deps.now ?? new Date();
  // Mutable stats object updated as we go; returned inside catch to reflect partial work.
  const stats: SourceRunStats = { ...ZERO_STATS };

  try {
    // 2. One memoized fetch per processSource call — verify never re-hits the network.
    const memoized = memoFetch(deps.fetchImpl);
    const ctx = {
      slug: source.slug,
      companyName: source.company.name,
      fetchImpl: memoized,
    };

    // 3. Discover jobs.
    const normalizedJobs = await adapter.discoverJobs(ctx);
    stats.discovered = normalizedJobs.length;

    // Zero discoveries carry no success evidence (empty board or fetch failure); skip lastSuccessAt.
    if (stats.discovered === 0) {
      return { ...stats, errorMessage: 'no jobs discovered (empty board or fetch failure)' };
    }

    // 4. Per-job pipeline.
    for (const normalized of normalizedJobs) {
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
        f.verificationStatus === 'verified_active' || f.verificationStatus === 'verified_probable';

      // 4c. Pre-read existing row to detect create-vs-update and compute alternateUrls merge.
      //     This makes the merge logic explicit here rather than hiding it in the DB layer,
      //     and is safe for real Prisma (plain array set in the update payload).
      const existing = await deps.prisma.ladderJob.findUnique({
        where: { dedupeHash: assessment.dedupeHash },
      });
      const isNew = existing === null;

      // When the canonical URL has changed, push the OLD url into alternateUrls (deduped, cap 10).
      let mergedAlternates: string[] | undefined;
      if (existing && existing.originalPostingUrl !== f.originalPostingUrl) {
        const combined = [...existing.alternateUrls, existing.originalPostingUrl];
        mergedAlternates = [...new Set(combined)].slice(0, 10);
      }

      // 4d. Upsert the job row.
      const upserted = await deps.prisma.ladderJob.upsert({
        where: { dedupeHash: assessment.dedupeHash },
        create: {
          companyId: source.company.id,
          dedupeHash: assessment.dedupeHash,
          title: f.title,
          normalizedTitle: f.normalizedTitle,
          programType: f.programType,
          locationRaw: f.locationRaw,
          city: f.city,
          state: f.state,
          country: f.country ?? 'US',
          remoteStatus: f.remoteStatus,
          employmentType: f.employmentType,
          postingDate: f.postingDate,
          sourcePlatform: source.platform,
          sourceUrl: f.sourceUrl,
          originalPostingUrl: f.originalPostingUrl,
          canonicalApplyUrl: f.canonicalApplyUrl,
          externalRequisitionId: f.externalRequisitionId,
          descriptionSummary: f.descriptionSummary,
          fullDescription: f.fullDescription,
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
          lastCheckedAt: now,
          lastVerifiedAt: isVerified ? now : null,
        },
        update: {
          lastCheckedAt: now,
          failedCheckCount: 0,
          relevanceScoreBase: f.relevanceScoreBase,
          earlyCareerScore: f.earlyCareerScore,
          earlyCareerClassification: f.earlyCareerClassification,
          urgencyFlag: f.urgencyFlag,
          status: jobStatus,
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
    }

    // 5. Mark the source as successfully processed.
    await deps.prisma.ladderSource.update({
      where: { id: source.id },
      data: { lastSuccessAt: now },
    });

    return stats;
  } catch (err) {
    // Per-source try/catch: any throw returns partial stats + errored flag. Never rethrows.
    return { ...stats, errored: true, errorMessage: err instanceof Error ? err.message : String(err) };
  }
}
