import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler, badRequest, notFound } from '@/lib/api/handler.server';
import { impersonationReportSchema } from '@/lib/handles/impersonation';
import {
  fileImpersonationReport,
  getImpersonationComparison,
} from '@/lib/handles/impersonation.server';

/**
 * POST /api/handles/impersonation — report an account for pretending to be
 *                                   someone, capturing WHO.
 * GET  /api/handles/impersonation?reportId=… — admin-only comparison view.
 *
 * The GET is what makes this a different investigation from a content report:
 * the moderator opens two accounts side by side (creation dates, former
 * handles, claimed and verified domains) instead of reading a note.
 */
const comparisonQuery = z.object({ reportId: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/handles/impersonation')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 5,
            windowMs: 60 * 60_000,
            prefix: 'impersonation-report',
            scope: 'user',
            message: 'Too many reports. Please slow down.',
          },
          body: impersonationReportSchema,
          verboseValidationErrors: true,
        },
        async ({ userId, body }) => {
          const result = await fileImpersonationReport(userId, body);
          if (!result.ok) {
            return Response.json(
              { error: result.message, reason: result.reason },
              { status: result.reason === 'unknown-account' ? 404 : 400 },
            );
          }
          return Response.json({
            success: true,
            reportId: result.reportId,
            alreadyReported: result.alreadyReported,
          });
        },
      ),

      GET: defineHandler(
        { auth: 'admin', rateLimit: 'read', query: comparisonQuery },
        async ({ query }) => {
          if (!query.reportId) return badRequest('reportId required');
          const comparison = await getImpersonationComparison(query.reportId);
          if (!comparison) return notFound('Impersonation report not found');
          return Response.json(comparison);
        },
      ),
    },
  },
});
