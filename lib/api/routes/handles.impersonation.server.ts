import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import { notFound } from '@/lib/api/handler.server';
import { refusalBody } from '@/lib/errors/codes';
import { impersonationReportSchema } from '@/lib/handles/impersonation';
import {
  fileImpersonationReportApi,
  getImpersonationComparisonApi,
} from '@/lib/handles/impersonation.contract';
import {
  fileImpersonationReport,
  getImpersonationComparison,
} from '@/lib/handles/impersonation.server';

/**
 * POST /api/handles/impersonation — report an account for pretending to be
 *                                   someone, capturing WHO (an id, or a handle
 *                                   the server resolves).
 * GET  /api/handles/impersonation?reportId=… — admin-only comparison view.
 *
 * The GET is what makes this a different investigation from a content report:
 * the moderator opens two accounts side by side (creation dates, former
 * handles, claimed and verified domains) instead of reading a note.
 *
 * This is the only way to file an impersonation report: the generic
 * `POST /api/moderation/report` refuses the type, because it would store the
 * report without the structured header the comparison reads.
 */
const comparisonQuery = z.object({ reportId: z.string().min(1).max(64) });

export const route = apiRoute('/api/handles/impersonation', {
  POST: implement(
    fileImpersonationReportApi,
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
        return result.reason === 'unknown-account'
          ? Response.json(refusalBody('IMPERSONATION_UNKNOWN'), { status: 404 })
          : Response.json(refusalBody('IMPERSONATION_SELF'), { status: 400 });
      }
      return { success: true as const, reportId: result.reportId, alreadyReported: result.alreadyReported };
    },
  ),

  GET: implement(
    getImpersonationComparisonApi,
    { auth: 'admin', rateLimit: 'read', query: comparisonQuery },
    async ({ query }) => {
      const comparison = await getImpersonationComparison(query.reportId);
      if (!comparison) return notFound('Impersonation report not found');
      return comparison;
    },
  ),
});
