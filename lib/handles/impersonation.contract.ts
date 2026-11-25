/**
 * Contracts for /api/handles/impersonation (sprint 14, feature 09). Client-safe: types only, by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ImpersonationComparison, impersonationReportSchema } from '@/lib/handles/impersonation';

/** File an impersonation report: the accused account, and who it is pretending to be (an id, or a handle). */
export const fileImpersonationReportApi = endpoint<{
  body: z.infer<typeof impersonationReportSchema>;
  res: {
    success: true;
    reportId: string;
    alreadyReported: boolean;
  };
}>()({
  method: 'POST',
  path: '/api/handles/impersonation',
});

/** Admin only: the two accounts of one impersonation report, side by side. */
export const getImpersonationComparisonApi = endpoint<{
  query: { reportId: string };
  res: ImpersonationComparison;
}>()({
  method: 'GET',
  path: '/api/handles/impersonation',
});
