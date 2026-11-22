import { prisma } from '@/lib/prisma.server';
import { isFeatureEnabled } from '@/lib/flags/flags.server';
import {
  MEDIA_SWEEP_FLAG,
  parseRunDetail,
  SWEEP_AUDIT_ACTION,
  SWEEP_AUDIT_TARGET,
  type SweepRunView,
} from '@/lib/media/sweep-run-detail';

/** The flag and the last five recorded runs. Reads the audit log by its (targetType, targetId) index. */
export async function listSweepRuns(): Promise<{ enabled: boolean; runs: SweepRunView[] }> {
  const [enabled, rows] = await Promise.all([
    isFeatureEnabled(MEDIA_SWEEP_FLAG).catch(() => false),
    prisma.adminAuditLog.findMany({
      where: { targetType: SWEEP_AUDIT_TARGET, action: { in: Object.values(SWEEP_AUDIT_ACTION) } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, action: true, createdAt: true, detail: true },
    }),
  ]);
  const runs = rows.map(parseRunDetail).filter((r): r is SweepRunView => r !== null);
  return { enabled, runs };
}
