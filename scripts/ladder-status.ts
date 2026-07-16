/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { resumeSubsystemReadiness } from '@/lib/rmhladder/resume/readiness.server';
import { DEFAULT_STALE_AFTER_MS } from '@/lib/rmhladder/scheduler';
import { formatLadderStatus, type LadderStatusData } from '@/lib/rmhladder/status';

async function main(): Promise<void> {
  const [lastRun, activeJobs, expiredJobs, sourceGroups] = await Promise.all([
    prisma.ladderScrapeRun.findFirst({
      where: { finishedAt: { not: null } },
      orderBy: { finishedAt: 'desc' },
      select: {
        finishedAt: true,
        discoveredCount: true,
        newCount: true,
        expiredCount: true,
        errorCount: true,
      },
    }),
    prisma.ladderJob.count({ where: { status: 'active' } }),
    prisma.ladderJob.count({ where: { status: 'expired' } }),
    prisma.ladderSource.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  const sourcesByStatus: Record<string, number> = {};
  for (const row of sourceGroups) sourcesByStatus[row.status] = row._count._all;

  const readiness = resumeSubsystemReadiness();

  const data: LadderStatusData = {
    now: new Date(),
    lastCompletedRun:
      lastRun && lastRun.finishedAt
        ? {
            finishedAt: lastRun.finishedAt,
            discoveredCount: lastRun.discoveredCount ?? 0,
            newCount: lastRun.newCount ?? 0,
            expiredCount: lastRun.expiredCount ?? 0,
            errorCount: lastRun.errorCount ?? 0,
          }
        : null,
    activeJobs,
    expiredJobs,
    sourcesByStatus,
    resume: { ready: readiness.ready, missing: readiness.missing },
    staleAfterMs: DEFAULT_STALE_AFTER_MS,
  };

  console.log(formatLadderStatus(data));
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
