import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { cached } from '@/lib/cached.server';
import { effectiveRules } from '@/lib/ops/alarm-rules';
import { loadOverrides } from '@/lib/ops/alarm-rules.server';
import { CHART_METRICS, RANGES, buildSeries, type RangeId } from '@/lib/ops/series';
import { prisma } from '@/lib/prisma.server';

const querySchema = z.object({ range: z.enum(['1h', '24h', '7d']).default('24h') });

/**
 * GET /api/admin/oncall-series?range=1h|24h|7d — one chart series per metric an
 * alarm rule watches (from ops_metric_minute), with each rule's threshold.
 * Admin only; cached 30 s per range (7 days is ~10k rows per metric).
 */
export const Route = createFileRoute('/api/admin/oncall-series')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: querySchema, label: 'admin-oncall-series' },
        async ({ query }) => {
          const range = query.range as RangeId;
          const series = await cached(`oncall:series:${range}`, 30_000, async () => {
            const now = Date.now();
            const [overrides, rows] = await Promise.all([
              loadOverrides(),
              prisma.opsMetricMinute.findMany({
                where: {
                  metric: { in: CHART_METRICS },
                  at: { gte: new Date(now - RANGES[range].ms) },
                },
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
            return buildSeries(effectiveRules(overrides), rows, range, now);
          });
          // Deploy markers for the same range (ops_deploy_event, from deploy.sh).
          const deploys = await cached(`oncall:deploys:${range}`, 30_000, async () =>
            (
              await prisma.opsDeployEvent.findMany({
                where: { at: { gte: new Date(Date.now() - RANGES[range].ms) } },
                orderBy: { at: 'asc' },
                take: 200,
                select: { at: true, sha: true, status: true },
              })
            ).map((d) => ({ at: d.at.getTime(), sha: d.sha, status: d.status })),
          );
          return Response.json(
            { range, series, deploys },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        },
      ),
    },
  },
});
