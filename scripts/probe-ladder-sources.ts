/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import {
  probeUnconfiguredSources,
  PROBE_PLATFORMS,
  type ProbePlatform,
  type ProbePrisma,
} from '@/lib/rmhladder/pipeline/probe-sources';

function parseArgs() {
  const args = process.argv.slice(2);
  let limit: number | undefined;
  let platform: ProbePlatform | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--limit' && args[i + 1]) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--platform' && args[i + 1]) {
      const p = args[i + 1] as ProbePlatform;
      if (!PROBE_PLATFORMS.includes(p)) {
        console.error(`Unknown platform: ${p}. Valid: ${PROBE_PLATFORMS.join(', ')}`);
        process.exit(1);
      }
      platform = p;
      i++;
    }
  }

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }

  return { limit, platform };
}

async function main() {
  const { limit, platform } = parseArgs();

  const result = await probeUnconfiguredSources(prisma as unknown as ProbePrisma, {
    limit,
    platforms: platform ? [platform] : undefined,
    log: console.log,
  });

  console.log(
    `\nDone. Companies probed: ${result.companiesProbed}, sources activated: ${result.sourcesActivated}, total live jobs seen: ${result.totalLiveJobs}.`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
