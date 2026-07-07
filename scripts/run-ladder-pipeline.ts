/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { runPipeline } from '@/lib/rmhladder/pipeline/run';

const PLATFORMS = ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'manual'] as const;
type Platform = (typeof PLATFORMS)[number];

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}
// Keep sleep available in case it's needed in future expansions.
void sleep;

function parseArgs() {
  const args = process.argv.slice(2);
  let trigger: 'cron' | 'manual' = 'manual';
  let limit: number | undefined;
  let platform: Platform | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--trigger' && args[i + 1]) {
      const t = args[i + 1];
      if (t !== 'cron' && t !== 'manual') {
        console.error(`Unknown trigger: ${t}. Valid: cron, manual`);
        process.exit(1);
      }
      trigger = t;
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
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

  if (limit !== undefined && (isNaN(limit) || limit < 1)) {
    console.error('--limit must be a positive integer');
    process.exit(1);
  }

  return { trigger, limit, platform };
}

async function main() {
  const { trigger, limit, platform } = parseArgs();

  console.log(
    `Starting ladder pipeline (trigger=${trigger}${limit !== undefined ? `, limit=${limit}` : ''}${platform ? `, platform=${platform}` : ''})`,
  );

  const result = await runPipeline(
    { prisma },
    {
      trigger,
      limitSources: limit,
      platforms: platform ? [platform] : undefined,
    },
  );

  console.log(
    `Done [${result.runId}] — discovered=${result.discovered} created=${result.created} updated=${result.updated} verified=${result.verified} struck=${result.struck} expired=${result.expired} errors=${result.errors} reviewTasks=${result.reviewTasks} durationMs=${result.durationMs}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
