import { prisma } from '../prisma.server';
import { loadOverrides } from './alarm-rules.server';
import { guardVerdict, type GuardVerdict } from './post-deploy';

/** guardVerdict over the metric rows written since `since` (epoch ms). */
export async function postDeployVerdict(since: number, now = Date.now()): Promise<GuardVerdict> {
  const [overrides, rows] = await Promise.all([
    loadOverrides(),
    prisma.opsMetricMinute.findMany({
      where: { metric: { in: ['http.latency', 'http.5xx_pct'] }, at: { gte: new Date(since) } },
      select: {
        at: true,
        metric: true,
        dim: true,
        count: true,
        p50: true,
        p95: true,
        p99: true,
        value: true,
      },
    }),
  ]);
  return guardVerdict(overrides, rows, since, now);
}
