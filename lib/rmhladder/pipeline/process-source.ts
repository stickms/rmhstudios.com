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

      // 4c. Upsert the job row.
      //     Created-vs-updated is derived from the returned discoveredAt:
      //     create sets discoveredAt = now; update leaves it untouched.
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
          // Pass new URL so the fake (and real) store can push it to alternateUrls
          // when it differs from the stored value.
          originalPostingUrl: f.originalPostingUrl,
        },
      });

      // Detect created vs updated: on create, discoveredAt === now.
      if (upserted.discoveredAt.getTime() === now.getTime()) {
        stats.created++;
      } else {
        stats.updated++;
      }
      if (isVerified) stats.verified++;

      // 4d. Record verification row.
      await deps.prisma.ladderVerification.create({
        data: {
          jobId: upserted.id,
          status: f.verificationStatus,
          confidence: f.verificationConfidence,
          evidence: f.verificationEvidence,
        },
      });

      // 4e. Create review tasks — one open task per reason, no duplicates.
      for (const reason of assessment.reviewReasons) {
        const existing = await deps.prisma.ladderReviewTask.findFirst({
          where: { jobId: upserted.id, reason, status: 'open' },
        });
        if (!existing) {
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
    return { ...stats, errored: true, errorMessage: String(err) };
  }
}
