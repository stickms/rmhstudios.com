/**
 * recheck.ts — 3-strike expiry + mass-expiry circuit breaker
 *
 * Strategy: call adapter.discoverJobs() ONCE per source (memoized fetch) and
 * derive per-job presence from the returned externalId set. This avoids the
 * ambiguity of detectExpired's boolean return, which cannot distinguish
 * "present" from "fetch failed".
 *
 * IMPORTANT: discoverJobs returning [] is treated as fetchSucceeded=false
 * (ambiguous: empty board vs. fetch failure). No strikes are issued on
 * ambiguous evidence. A genuinely-emptied board will not auto-expire via
 * recheck — accepted MVP tradeoff; manual review can handle it.
 */

import { getAdapter } from '../adapters/index';
import { memoFetch } from './memo-fetch';

// ── Pure decision core ────────────────────────────────────────────────────────

export interface RecheckDecision {
  action: 'skip' | 'reset' | 'strike' | 'expire';
}

/**
 * Decide what to do with a single job during a recheck pass.
 *
 * Contract:
 *   fetchSucceeded=false          → skip  (no evidence either way)
 *   presentOnBoard=true           → reset (counter → 0, stays active)
 *   absent && count+1 >= 3       → expire
 *   absent && count+1 < 3        → strike (counter + 1)
 */
export function decideRecheck(args: {
  presentOnBoard: boolean;
  fetchSucceeded: boolean;
  failedCheckCount: number;
}): RecheckDecision {
  if (!args.fetchSucceeded) return { action: 'skip' };
  if (args.presentOnBoard) return { action: 'reset' };
  if (args.failedCheckCount + 1 >= 3) return { action: 'expire' };
  return { action: 'strike' };
}

/**
 * Returns true when a suspiciously large fraction of active jobs would be
 * struck or expired in a single pass, indicating a likely fetch problem rather
 * than genuine mass-expiry.
 *
 * Trips when: activeCount >= 4 AND wouldStrikeOrExpire / activeCount > 0.5
 */
export function circuitBreaker(args: {
  activeCount: number;
  wouldStrikeOrExpire: number;
}): boolean {
  if (args.activeCount < 4) return false;
  return args.wouldStrikeOrExpire / args.activeCount > 0.5;
}

// ── Structural type for DB access ─────────────────────────────────────────────

export interface RecheckPrismaLike {
  ladderJob: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
  ladderVerification: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  ladderReviewTask: {
    findFirst(args: {
      where: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
  ladderSource: {
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
}

// ── recheckSource ─────────────────────────────────────────────────────────────

export async function recheckSource(
  deps: {
    prisma: RecheckPrismaLike;
    fetchImpl?: typeof fetch;
    /** Injected for determinism in tests; defaults to new Date(). */
    now?: Date;
  },
  source: {
    id: string;
    platform: string;
    slug: string | null;
    company: { name: string };
  },
  activeJobs: Array<{ id: string; externalId: string | null; failedCheckCount: number }>,
): Promise<{ struck: number; expired: number; reset: number; skipped: number; tripped: boolean }> {
  const now = deps.now ?? new Date();
  const ALL_SKIPPED = {
    struck: 0,
    expired: 0,
    reset: 0,
    skipped: activeJobs.length,
    tripped: false,
  };

  // Resolve adapter. Unknown platform or missing slug → all skip, no DB writes.
  const adapter = getAdapter(source.platform);
  if (!adapter || !source.slug) return ALL_SKIPPED;

  const memoized = memoFetch(deps.fetchImpl);
  const ctx = { slug: source.slug, companyName: source.company.name, fetchImpl: memoized };

  // One memoized board fetch. Errors are caught and treated as empty.
  let boardJobs: Awaited<ReturnType<typeof adapter.discoverJobs>>;
  try {
    boardJobs = await adapter.discoverJobs(ctx);
  } catch {
    boardJobs = [];
  }

  // [] is ambiguous (empty board vs. fetch failure) → skip all, no strikes.
  const fetchSucceeded = boardJobs.length > 0;
  const presentIds = new Set(boardJobs.map((j) => j.externalId));

  // ── Step 1: compute all decisions before writing anything ─────────────────

  type JobWithDecision = {
    job: (typeof activeJobs)[number];
    decision: RecheckDecision;
  };

  const planned: JobWithDecision[] = activeJobs.map((job) => {
    if (job.externalId === null) {
      return { job, decision: { action: 'skip' as const } };
    }
    const presentOnBoard = presentIds.has(job.externalId);
    const decision = decideRecheck({
      presentOnBoard,
      fetchSucceeded,
      failedCheckCount: job.failedCheckCount,
    });
    return { job, decision };
  });

  // ── Step 2: circuit breaker ───────────────────────────────────────────────

  const activeCount = planned.filter((p) => p.decision.action !== 'skip').length;
  const wouldStrikeOrExpire = planned.filter(
    (p) => p.decision.action === 'strike' || p.decision.action === 'expire',
  ).length;

  if (circuitBreaker({ activeCount, wouldStrikeOrExpire })) {
    // Apply nothing to jobs. Mark source as errored and create a review task.
    await deps.prisma.ladderSource.update({
      where: { id: source.id },
      data: { status: 'error' },
    });

    // Dedupe: skip task creation if an open mass_expiry_suspected task already
    // exists for this source (sourceId is a plain String field on LadderReviewTask).
    const existingTask = await deps.prisma.ladderReviewTask.findFirst({
      where: { sourceId: source.id, reason: 'mass_expiry_suspected', status: 'open' },
    });
    if (!existingTask) {
      await deps.prisma.ladderReviewTask.create({
        data: {
          jobId: null,
          sourceId: source.id,
          reason: 'mass_expiry_suspected',
          status: 'open',
        },
      });
    }

    return { struck: 0, expired: 0, reset: 0, skipped: activeJobs.length, tripped: true };
  }

  // ── Step 3: apply decisions ───────────────────────────────────────────────

  let struck = 0;
  let expired = 0;
  let reset = 0;
  let skipped = 0;

  for (const { job, decision } of planned) {
    switch (decision.action) {
      case 'skip':
        skipped++;
        break;

      case 'reset':
        await deps.prisma.ladderJob.update({
          where: { id: job.id },
          data: { failedCheckCount: 0, lastCheckedAt: now },
        });
        reset++;
        break;

      case 'strike':
        await deps.prisma.ladderJob.update({
          where: { id: job.id },
          data: { failedCheckCount: job.failedCheckCount + 1, lastCheckedAt: now },
        });
        struck++;
        break;

      case 'expire':
        await deps.prisma.ladderJob.update({
          where: { id: job.id },
          data: {
            status: 'expired',
            failedCheckCount: job.failedCheckCount + 1,
            lastCheckedAt: now,
          },
        });
        await deps.prisma.ladderVerification.create({
          data: {
            jobId: job.id,
            status: 'expired',
            confidence: 90,
            evidence: `3 consecutive checks found the posting absent from the ${source.platform} board.`,
          },
        });
        expired++;
        break;
    }
  }

  return { struck, expired, reset, skipped, tripped: false };
}
