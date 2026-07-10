/**
 * probeUnconfiguredSources — try candidate board slugs for every unconfigured
 * API source and activate the first live one per company+platform.
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
    log?: (line: string) => void;
  } = {},
): Promise<ProbeResult> {
  const probe = opts.probe ?? probeSlug;
  const sleepMs = opts.sleepMs ?? 300;
  const log = opts.log ?? (() => {});
  const targetPlatforms: ProbePlatform[] = opts.platforms ?? [...PROBE_PLATFORMS];

  const sources = await prisma.ladderSource.findMany({
    where: {
      status: 'unconfigured',
      platform: { in: targetPlatforms },
    },
    include: { company: true },
    orderBy: [{ company: { name: 'asc' } }, { platform: 'asc' }],
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

      const slugs = candidateSlugs(name);
      let activated = false;

      for (const slug of slugs) {
        if (!firstRequest && sleepMs > 0) {
          await new Promise<void>((resolve) => setTimeout(resolve, sleepMs));
        }
        firstRequest = false;

        const probed = await probe(plt, slug);
        log(`  ${plt}/${slug} → live=${probed.live} jobs=${probed.jobCount}`);

        if (probed.live) {
          await prisma.ladderSource.update({
            where: { id: source.id },
            data: { slug, status: 'active', lastSuccessAt: new Date() },
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
      }
    }
  }

  return result;
}
