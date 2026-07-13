/**
 * probeUnconfiguredSources — try candidate board slugs for due unconfigured
 * and recoverable error sources, activating the first live one per platform.
 *
 * Extracted from scripts/probe-ladder-sources.ts so the ladder worker can
 * self-configure sources on startup; the CLI script is a thin wrapper.
 */

import { candidateSlugs, probeSlug } from '../adapters/prober';

type AnyRow = Record<string, unknown>;

export const PROBE_PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;
export type ProbePlatform = (typeof PROBE_PLATFORMS)[number];

export interface ProbePrisma {
  ladderSource: {
    findMany(args: AnyRow): Promise<AnyRow[]>;
    update(args: { where: AnyRow; data: AnyRow }): Promise<unknown>;
  };
}

export interface ProbeResult {
  companiesProbed: number;
  sourcesActivated: number;
  totalLiveJobs: number;
}

export async function probeUnconfiguredSources(
  prisma: ProbePrisma,
  opts: {
    limit?: number;
    platforms?: ProbePlatform[];
    /** Injectable for tests. Defaults to the real HTTP prober. */
    probe?: typeof probeSlug;
    /** Milliseconds between consecutive probe requests (politeness). Default 300; tests pass 0. */
    sleepMs?: number;
    /** Injectable wall clock for retry scheduling. */
    now?: Date;
    /** Delay before retrying a source for the first time. Defaults to 24 hours. */
    retryAfterMs?: number;
    log?: (line: string) => void;
  } = {},
): Promise<ProbeResult> {
  const probe = opts.probe ?? probeSlug;
  const sleepMs = opts.sleepMs ?? 300;
  const log = opts.log ?? (() => {});
  const now = opts.now ?? new Date();
  const retryAfterMs = opts.retryAfterMs ?? 24 * 60 * 60 * 1_000;
  const targetPlatforms: ProbePlatform[] = opts.platforms ?? [...PROBE_PLATFORMS];

  const sources = await prisma.ladderSource.findMany({
    where: {
      company: { enabled: true },
      status: { in: ['unconfigured', 'error'] },
      platform: { in: targetPlatforms },
      OR: [{ nextProbeAt: null }, { nextProbeAt: { lte: now } }],
    },
    include: { company: true },
    orderBy: [{ nextProbeAt: 'asc' }, { lastProbedAt: 'asc' }, { company: { name: 'asc' } }, { platform: 'asc' }],
  });

  // Group by companyId → platform → source
  const byCompany = new Map<string, { name: string; byPlatform: Map<ProbePlatform, AnyRow> }>();
  for (const src of sources) {
    const companyId = src.companyId as string;
    if (!byCompany.has(companyId)) {
      byCompany.set(companyId, { name: (src.company as AnyRow).name as string, byPlatform: new Map() });
    }
    byCompany.get(companyId)!.byPlatform.set(src.platform as ProbePlatform, src);
  }

  let companies = Array.from(byCompany.entries());
  if (opts.limit !== undefined) {
    companies = companies.slice(0, opts.limit);
  }

  const result: ProbeResult = { companiesProbed: 0, sourcesActivated: 0, totalLiveJobs: 0 };
  let firstRequest = true;

  for (const [, { name, byPlatform }] of companies) {
    result.companiesProbed++;
    log(`[${result.companiesProbed}] ${name}`);

    for (const plt of targetPlatforms) {
      const source = byPlatform.get(plt);
      if (!source) continue;

      const configuredSlug = typeof source.slug === 'string' ? source.slug : null;
      const slugs = [...new Set([configuredSlug, ...candidateSlugs(name)].filter((slug): slug is string => Boolean(slug)))];
      let activated = false;

      for (const slug of slugs) {
        if (!firstRequest && sleepMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
        }
        firstRequest = false;

        let probed: Awaited<ReturnType<typeof probe>>;
        try {
          probed = await probe(plt, slug);
        } catch (error) {
          log(`  ${plt}/${slug} → probe failed: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
        log(`  ${plt}/${slug} → live=${probed.live} jobs=${probed.jobCount}`);

        if (probed.live) {
          await prisma.ladderSource.update({
            where: { id: source.id },
            data: {
              slug,
              status: 'active',
              lastAttemptAt: now,
              lastProbedAt: now,
              lastSuccessAt: now,
              nextProbeAt: null,
              consecutiveFailures: 0,
            },
          });
          log(`  ✓ activated ${plt} with slug "${slug}" (${probed.jobCount} jobs)`);
          result.sourcesActivated++;
          result.totalLiveJobs += probed.jobCount;
          activated = true;
          break;
        }
      }

      if (!activated) {
        log(`  - ${plt}: no live slug found`);
        const previousFailures = typeof source.consecutiveFailures === 'number' ? source.consecutiveFailures : 0;
        const failures = previousFailures + 1;
        const backoff = Math.min(retryAfterMs * 2 ** Math.min(previousFailures, 4), 14 * 24 * 60 * 60 * 1_000);
        await prisma.ladderSource.update({
          where: { id: source.id },
          data: {
            lastAttemptAt: now,
            lastProbedAt: now,
            nextProbeAt: new Date(now.getTime() + backoff),
            consecutiveFailures: failures,
          },
        });
      }
    }
  }

  return result;
}
