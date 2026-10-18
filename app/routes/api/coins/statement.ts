import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getStatementCsvRows, getStatementSummary } from '@/lib/economy/statement.server';
import { toCsv } from '@/lib/economy/statement';

const query = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  format: z.enum(['json', 'csv']).default('json'),
});

/**
 * GET /api/coins/statement?month=YYYY-MM[&format=csv] — the caller's monthly coin
 * statement (C4). JSON for the wallet panel, CSV for the download.
 *
 * Scoped to the session user by construction: there is no parameter that names
 * another member, so there is nothing to authorise beyond being signed in.
 */
export const Route = createFileRoute('/api/coins/statement')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'coin-statement', scope: 'user' },
          query,
        },
        async ({ userId, query: q }) => {
          if (q.format === 'csv') {
            const out = await getStatementCsvRows(userId, q.month);
            if (!out) return Response.json({ error: 'INVALID_MONTH' }, { status: 400 });
            return new Response(toCsv(out.rows), {
              headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="rmh-coin-statement-${q.month}.csv"`,
                'Cache-Control': 'private, no-store',
                'X-Content-Type-Options': 'nosniff',
                ...(out.truncated ? { 'X-Statement-Truncated': '1' } : {}),
              },
            });
          }
          const summary = await getStatementSummary(userId, q.month);
          if (!summary) return Response.json({ error: 'INVALID_MONTH' }, { status: 400 });
          return Response.json(summary, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});
