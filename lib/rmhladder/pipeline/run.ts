import { processSource } from './process-source';
import { recheckSource } from './recheck';
import { expireStaleJobs, resolveJobMaxAgeMs } from './expire-stale';
import type { ExpireStalePrisma } from './expire-stale';
import { checkRobots, politeFetch } from '../adapters/index';
import {
  discoverWorkdaySourceUrls,
  parseWorkdaySource,
  probeWorkdaySourceUrl,
  workdaySourceSlug,
} from '../adapters/workday';

// ── Public types ─────────────────────────────────────────────────────────────

/**
 * Combined Prisma interface used by runPipeline. Structurally satisfies both
 * PrismaLike (process-source) and RecheckPrismaLike (recheck), plus the
 * run-level models (LadderScrapeRun, LadderSourceError) and findMany queries.
 *
 * Tests inject an in-memory fake — real usage passes the generated Prisma client.
 */
export interface RunPrisma {
  ladderJob: {
    findUnique(args: {
      where: { sourceId_externalId: { sourceId: string; externalId: string } };
      select?: Record<string, unknown>;
    }): Promise<{ id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string } | null>;
    findFirst(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<{ id: string } | null>;
    upsert(args: {
      where: { sourceId_externalId: { sourceId: string; externalId: string } };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string; discoveredAt: Date; alternateUrls: string[]; originalPostingUrl: string }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
    findMany(args: {
      where: Record<string, unknown>;
      select?: Record<string, unknown>;
    }): Promise<Array<{ id: string; externalId: string | null; failedCheckCount: number } | { id: string; lastSeenAt: Date | null; discoveredAt: Date }>>;
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
    findFirst(args: { where: Record<string, unknown> }): Promise<{ id: string } | null>;
    upsert(args: {
      where: Record<string, unknown>;
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
    findMany(args: {
      where: Record<string, unknown>;
      include?: Record<string, unknown>;
      orderBy?: unknown;
    }): Promise<
      Array<{
        id: string;
        platform: string;
        slug: string | null;
        url: string | null;
        status: string;
        nextProbeAt?: Date | null;
        company: { id: string; name: string; priorityLevel: number };
      }>
    >;
  };
  ladderScrapeRun: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<{ id: string }>;
  };
  ladderSourceError: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>;
  };
}

export interface RunResult {
  runId: string;
  discovered: number;
  created: number;
  updated: number;
  verified: number;
  struck: number;
  expired: number;
  errors: number;
  reviewTasks: number;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── runPipeline ───────────────────────────────────────────────────────────────

export async function runPipeline(
  deps: {
    prisma: RunPrisma;
    fetchImpl?: typeof fetch;
    /** Injected for determinism in tests; passed through to processSource/recheckSource. */
    now?: Date;
    /** Milliseconds to sleep between consecutive API source calls. Default: 300. Tests pass 0. */
    sleepMs?: number;
  },
  opts: {
    trigger: 'cron' | 'manual';
    limitSources?: number;
    platforms?: string[];
  },
): Promise<RunResult> {
  const startMs = Date.now();

  // Step 1: Create the scrape run row.
  const runRow = await deps.prisma.ladderScrapeRun.create({
    data: { trigger: opts.trigger },
  });
  const runId = runRow.id;

  // Step 2: Load all active sources, filter, sort, slice.
  let allSources = await deps.prisma.ladderSource.findMany({
    where: {
      company: { enabled: true },
      OR: [
        { status: 'active' },
        { status: 'error', nextProbeAt: { lte: deps.now ?? new Date() } },
      ],
    },
    include: { company: true },
    orderBy: [{ platform: 'asc' }],
  });

  if (opts.platforms && opts.platforms.length > 0) {
    const allowedPlatforms = new Set(opts.platforms);
    allSources = allSources.filter((s) => allowedPlatforms.has(s.platform));
  }

  // API platforms first, manual last.
  allSources.sort((a, b) => {
    const aIsManual = a.platform === 'manual';
    const bIsManual = b.platform === 'manual';
    if (aIsManual === bIsManual) return 0;
    return aIsManual ? 1 : -1;
  });

  if (opts.limitSources !== undefined) {
    allSources = allSources.slice(0, opts.limitSources);
  }

  const apiSources = allSources.filter((s) => s.platform !== 'manual');
  const manualSources = allSources.filter((s) => s.platform === 'manual');

  // Accumulators.
  const totals = {
    discovered: 0,
    created: 0,
    updated: 0,
    verified: 0,
    struck: 0,
    expired: 0,
    errors: 0,
    reviewTasks: 0,
  };
  const statsSummary: Array<Record<string, unknown>> = [];

  // Step 3: Process API sources sequentially with politeness sleep between them.
  let firstApiSource = true;
  for (const source of apiSources) {
    if (!firstApiSource) {
      await sleep(deps.sleepMs ?? 300);
    }
    firstApiSource = false;

    try {
      const stats = await processSource(
        { prisma: deps.prisma, fetchImpl: deps.fetchImpl, now: deps.now },
        source,
      );

      if (stats.errored) {
        await deps.prisma.ladderSourceError.create({
          data: {
            runId,
            sourceId: source.id,
            errorClass: 'process',
            message: stats.errorMessage ?? 'unknown error',
          },
        });
        totals.errors++;
      }
      for (const recordError of stats.recordErrors) {
        await deps.prisma.ladderSourceError.create({
          data: {
            runId,
            sourceId: source.id,
            errorClass: 'record_process',
            message: `${recordError.externalId}: ${recordError.message}`,
          },
        });
        totals.errors++;
      }
      // Accumulate partial stats regardless of errored flag.
      totals.discovered += stats.discovered;
      totals.created += stats.created;
      totals.updated += stats.updated;
      totals.verified += stats.verified;
      totals.reviewTasks += stats.reviewTasks;
      statsSummary.push({
        sourceId: source.id,
        platform: source.platform,
        discovered: stats.discovered,
        created: stats.created,
        errored: stats.errored,
        recordErrorCount: stats.recordErrors.length,
        errorMessage: stats.errorMessage,
      });
    } catch (err) {
      // processSource has its own try/catch, but guard defensively against unexpected throws.
      const message = err instanceof Error ? err.message : String(err);
      try {
        await deps.prisma.ladderSourceError.create({
          data: { runId, sourceId: source.id, errorClass: 'process', message },
        });
      } catch {
        // ignore secondary error
      }
      totals.errors++;
      statsSummary.push({ sourceId: source.id, platform: source.platform, errored: true, errorMessage: message });
    }
  }

  // Step 4: Recheck — for each API source load its active jobs and run expiry logic.

  for (const source of apiSources) {
    try {
      const activeJobs = await deps.prisma.ladderJob.findMany({
        where: {
          sourceId: source.id,
          status: 'active',
        },
      });
      if (activeJobs.length === 0) continue;

      const recheckStats = await recheckSource(
        { prisma: deps.prisma, fetchImpl: deps.fetchImpl, now: deps.now },
        source,
        activeJobs as Array<{ id: string; externalId: string | null; failedCheckCount: number }>,
      );

      if (recheckStats.tripped) {
        totals.errors++;
        // Item 7: write a sourceError row when the circuit breaker trips.
        await deps.prisma.ladderSourceError.create({
          data: {
            runId,
            sourceId: source.id,
            errorClass: 'recheck_tripped',
            message: 'mass-expiry circuit breaker tripped',
          },
        });
      }
      totals.struck += recheckStats.struck;
      totals.expired += recheckStats.expired;
    } catch {
      totals.errors++;
    }
  }

  // Step 4.5: Age backstop — expire jobs unseen for the max-age window,
  // independent of per-source recheck. Bounded, long horizon (default 30d).
  try {
    const ageResult = await expireStaleJobs(deps.prisma as unknown as ExpireStalePrisma, {
      now: deps.now ?? new Date(),
      maxAgeMs: resolveJobMaxAgeMs(),
    });
    totals.expired += ageResult.expired;
  } catch (err) {
    totals.errors++;
    statsSummary.push({ step: 'age_backstop', errored: true, errorMessage: err instanceof Error ? err.message : String(err) });
  }

  // Step 5: Manual sources — aliveness only (checkRobots → politeFetch).
  for (const source of manualSources) {
    if (!source.url) continue;

    try {
      const allowed = await checkRobots(source.url, deps.fetchImpl);

      if (!allowed) {
        // Robots-disallowed → block source + review task (deduplicated).
        await deps.prisma.ladderSource.update({
          where: { id: source.id },
          data: { status: 'blocked' },
        });
        const existingTask = await deps.prisma.ladderReviewTask.findFirst({
          where: { sourceId: source.id, reason: 'blocked', status: 'open' },
        });
        if (!existingTask) {
          await deps.prisma.ladderReviewTask.create({
            data: { jobId: null, sourceId: source.id, reason: 'blocked', status: 'open' },
          });
          totals.reviewTasks++;
        }
      } else {
        const res = await politeFetch(source.url, { fetchImpl: deps.fetchImpl });

        if (!res.ok) {
          // Fetch failed → error source + review task broken_link (deduplicated) + sourceError row.
          await deps.prisma.ladderSource.update({
            where: { id: source.id },
            data: {
              status: 'error',
              lastAttemptAt: deps.now ?? new Date(),
              nextProbeAt: new Date((deps.now ?? new Date()).getTime() + 4 * 60 * 60 * 1_000),
              consecutiveFailures: { increment: 1 },
            },
          });
          const existingTask = await deps.prisma.ladderReviewTask.findFirst({
            where: { sourceId: source.id, reason: 'broken_link', status: 'open' },
          });
          if (!existingTask) {
            await deps.prisma.ladderReviewTask.create({
              data: { jobId: null, sourceId: source.id, reason: 'broken_link', status: 'open' },
            });
            totals.reviewTasks++;
          }
          await deps.prisma.ladderSourceError.create({
            data: {
              runId,
              sourceId: source.id,
              errorClass: 'broken_link',
              message: `HTTP ${res.status}`,
            },
          });
          totals.errors++;
        } else {
          // Success → stamp lastSuccessAt.
          await deps.prisma.ladderSource.update({
            where: { id: source.id },
            data: {
              status: 'active',
              lastAttemptAt: deps.now ?? new Date(),
              lastSuccessAt: deps.now ?? new Date(),
              consecutiveFailures: 0,
              nextProbeAt: null,
            },
          });

          // Manual landing pages often link to a Workday tenant. Validate the
          // official CXS endpoint before activating it; it will be processed
          // as a normal source on the next pipeline run.
          for (const workdayUrl of discoverWorkdaySourceUrls(res.body, source.url).slice(0, 3)) {
            const config = parseWorkdaySource(workdayUrl);
            if (!config) continue;
            const probed = await probeWorkdaySourceUrl(workdayUrl, deps.fetchImpl);
            if (!probed.live) continue;
            await deps.prisma.ladderSource.upsert({
              where: {
                companyId_platform_slug: {
                  companyId: source.company.id,
                  platform: 'workday',
                  slug: workdaySourceSlug(config),
                },
              },
              create: {
                companyId: source.company.id,
                platform: 'workday',
                slug: workdaySourceSlug(config),
                url: workdayUrl,
                config,
                status: 'active',
                lastAttemptAt: deps.now ?? new Date(),
                lastProbedAt: deps.now ?? new Date(),
                lastSuccessAt: deps.now ?? new Date(),
                consecutiveFailures: 0,
              },
              update: {
                url: workdayUrl,
                config,
                status: 'active',
                lastAttemptAt: deps.now ?? new Date(),
                lastProbedAt: deps.now ?? new Date(),
                lastSuccessAt: deps.now ?? new Date(),
                nextProbeAt: null,
                consecutiveFailures: 0,
              },
            });
            statsSummary.push({
              sourceId: source.id,
              discoveredPlatform: 'workday',
              workdayUrl,
              liveJobs: probed.jobCount,
            });
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      try {
        await deps.prisma.ladderSourceError.create({
          data: { runId, sourceId: source.id, errorClass: 'manual_check', message },
        });
      } catch {
        // ignore secondary error
      }
      totals.errors++;
    }
  }

  // Step 6: Finalize run row with aggregated counts.
  const durationMs = Date.now() - startMs;

  await deps.prisma.ladderScrapeRun.update({
    where: { id: runId },
    data: {
      finishedAt: deps.now ?? new Date(),
      discoveredCount: totals.discovered,
      newCount: totals.created,
      verifiedCount: totals.verified,
      expiredCount: totals.expired,
      errorCount: totals.errors,
      stats: statsSummary,
    },
  });

  return {
    runId,
    discovered: totals.discovered,
    created: totals.created,
    updated: totals.updated,
    verified: totals.verified,
    struck: totals.struck,
    expired: totals.expired,
    errors: totals.errors,
    reviewTasks: totals.reviewTasks,
    durationMs,
  };
}
