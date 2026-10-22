import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createInterviewReportSchema, interviewReportQuerySchema } from '@/lib/rmhladder/community-schema';
import { createInterviewReport, listInterviewReports } from '@/lib/rmhladder/community.server';

/**
 * GET  /api/rmhladder/interview-reports?companyId= — visible community reports
 *      for a company (anonymous: no author is ever returned).
 * POST /api/rmhladder/interview-reports — a member shares one (F8).
 */
export const Route = createFileRoute('/api/rmhladder/interview-reports')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', query: interviewReportQuerySchema },
        async ({ query }) => Response.json(await listInterviewReports(query.companyId)),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 5, windowMs: 3_600_000, prefix: 'ladder-interview-report' },
          body: createInterviewReportSchema,
        },
        async ({ userId, body }) => {
          const result = await createInterviewReport(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value, { status: 201 });
        },
      ),
    },
  },
});
