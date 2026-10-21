import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getDeepseekBalanceHistory } from '@/lib/deepseek/balance.server';
import { buildHourlySeries, currenciesOf, summarizeBurn } from '@/lib/deepseek/balance';

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(9600).default(168),
});

/**
 * GET /api/admin/deepseek/history?hours=168 — per-currency hourly series (the
 * latest sample in each UTC hour, with its delta) and burn-rate summary over
 * the window. Positive deltas (top-ups) are excluded from spend.
 */
export const Route = createFileRoute('/api/admin/deepseek/history')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: querySchema, label: 'admin-deepseek-history' },
        async ({ query }) => {
          const samples = await getDeepseekBalanceHistory({ hours: query.hours });
          const series = currenciesOf(samples).map((currency) => {
            const points = buildHourlySeries(samples, currency);
            return { currency, points, summary: summarizeBurn(points) };
          });
          return Response.json(
            { hours: query.hours, series },
            { headers: { 'Cache-Control': 'no-store' } },
          );
        },
      ),
    },
  },
});
