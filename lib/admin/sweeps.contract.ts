/**
 * Contracts for /api/admin/sweeps (admin only). Client-safe: types only, by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { SweepPreview, SweepView } from '@/lib/admin/sweeps';
import type { createSweepBody, listSweepsQuery } from '@/lib/admin/sweeps-schema';

/** The sweeps, newest first (50). */
export const listSweepsApi = endpoint<{
  query: z.infer<typeof listSweepsQuery>;
  res: { sweeps: SweepView[] };
}>()({
  method: 'GET',
  path: '/api/admin/sweeps',
});

/** Preview a sweep: counts, the ten newest items and the account's context. Changes nothing but the PREVIEW row. */
export const previewSweepApi = endpoint<{
  body: z.infer<typeof createSweepBody>;
  res: { sweep: SweepView; preview: SweepPreview };
}>()({
  method: 'POST',
  path: '/api/admin/sweeps',
});

/** Start the run of a previewed sweep. A refusal answers `{ error, reason: SweepRefusal }`. */
export const confirmSweepApi = endpoint<{
  res: { sweep: SweepView; queued: 'queued' | 'inline' };
}>()({
  method: 'POST',
  path: '/api/admin/sweeps/$id',
});

/** Restore what a finished sweep removed, in the same durable job. */
export const undoSweepApi = endpoint<{
  res: { sweep: SweepView; queued: 'queued' | 'inline' };
}>()({
  method: 'POST',
  path: '/api/admin/sweeps/$id/undo',
});
