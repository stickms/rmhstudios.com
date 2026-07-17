/* eslint-disable no-console */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { formatCoverageSnapshot, type CoverageSnapshot } from '@/lib/rmhladder/coverage';
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

  const [companiesWithActive, enabledCompanies, activeJobsGrouped] = await Promise.all([
    prisma.ladderCompany.count({ where: { enabled: true, sources: { some: { status: 'active' } } } }),
    prisma.ladderCompany.count({ where: { enabled: true } }),
    prisma.ladderJob.groupBy({ by: ['companyId'], where: { status: 'active' }, _count: { _all: true } }),
  ]);
  const manualOnly = await prisma.ladderCompany.count({
    where: { enabled: true, sources: { none: { status: 'active' }, some: { platform: 'manual' } } },
  });
  const companiesUnconfigured = Math.max(0, enabledCompanies - companiesWithActive - manualOnly);
  // Active jobs by firm type (join companyId → firmType).
  const companies = await prisma.ladderCompany.findMany({ select: { id: true, firmType: true } });
  const firmTypeById = new Map(companies.map((c) => [c.id, c.firmType]));
  const activeJobsByFirmType: Record<string, number> = {};
  for (const row of activeJobsGrouped) {
    const ft = firmTypeById.get(row.companyId) ?? 'unknown';
    activeJobsByFirmType[ft] = (activeJobsByFirmType[ft] ?? 0) + row._count._all;
  }
  const coverage: CoverageSnapshot = {
    totalCompanies: enabledCompanies,
    companiesWithActiveSource: companiesWithActive,
    companiesManualOnly: manualOnly,
    companiesUnconfigured,
    activeJobsByFirmType,
  };
  console.log('\n' + formatCoverageSnapshot(coverage));

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
