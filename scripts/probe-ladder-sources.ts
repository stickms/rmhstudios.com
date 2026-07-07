/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { candidateSlugs, probeSlug } from '@/lib/rmhladder/adapters/prober';

const PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters'] as const;
type Platform = (typeof PLATFORMS)[number];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let platform: Platform | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--platform' && args[i + 1]) {
      const p = args[i + 1] as Platform;
      if (!PLATFORMS.includes(p)) {
        console.error(`Unknown platform: ${p}. Valid: ${PLATFORMS.join(', ')}`);
        process.exit(1);
      }
      platform = p;
      i++;
    }
  }

  return { limit, platform };
}

async function main() {
  const { limit, platform } = parseArgs();

  const targetPlatforms: Platform[] = platform ? [platform] : [...PLATFORMS];

  // Load all unconfigured sources joined with company, filtered to target platforms
  const sources = await prisma.ladderSource.findMany({
    where: {
      status: 'unconfigured',
      platform: { in: targetPlatforms },
    },
    include: { company: true },
    orderBy: [{ company: { name: 'asc' } }, { platform: 'asc' }],
  });

  // Group by companyId → platform → source
  const byCompany = new Map<string, { name: string; byPlatform: Map<Platform, typeof sources[0]> }>();
  for (const src of sources) {
    if (!byCompany.has(src.companyId)) {
      byCompany.set(src.companyId, { name: src.company.name, byPlatform: new Map() });
    }
    byCompany.get(src.companyId)!.byPlatform.set(src.platform as Platform, src);
  }

  let companies = Array.from(byCompany.entries());
  if (limit !== undefined) {
    companies = companies.slice(0, limit);
  }

  let companiesProbed = 0;
  let sourcesActivated = 0;
  let totalLiveJobs = 0;
  let firstRequest = true;

  for (const [_companyId, { name, byPlatform }] of companies) {
    companiesProbed++;
    console.log(`[${companiesProbed}] ${name}`);

    for (const plt of targetPlatforms) {
      const source = byPlatform.get(plt);
      if (!source) continue;

      const slugs = candidateSlugs(name);
      let activated = false;

      for (const slug of slugs) {
        // 300ms between every request (politeness)
        if (!firstRequest) {
          await sleep(300);
        }
        firstRequest = false;

        const result = await probeSlug(plt, slug);
        console.log(`  ${plt}/${slug} → live=${result.live} jobs=${result.jobCount}`);

        if (result.live) {
          await prisma.ladderSource.update({
            where: { id: source.id },
            data: { slug, status: 'active', lastSuccessAt: new Date() },
          });
          console.log(`  ✓ activated ${plt} with slug "${slug}" (${result.jobCount} jobs)`);
          sourcesActivated++;
          totalLiveJobs += result.jobCount;
          activated = true;
          break;
        }
      }

      if (!activated) {
        console.log(`  - ${plt}: no live slug found`);
      }
    }
  }

  console.log(
    `\nDone. Companies probed: ${companiesProbed}, sources activated: ${sourcesActivated}, total live jobs seen: ${totalLiveJobs}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
