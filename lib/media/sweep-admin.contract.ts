/**
 * Contracts for /api/admin/media-sweep (admin only). Client-safe: types only, by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { sweepKindBody } from '@/lib/media/sweep-admin-schema';
import type { SweepRunView } from '@/lib/media/sweep-run-detail';
import type { ClipSweepSummary, SweepKind, SweepSummary } from '@/lib/media/sweep-summary';

/** The nightly flag and the last five runs ("Run now" runs: the scheduled ones are in the log only). */
export const mediaSweepStateApi = endpoint<{
  res: { enabled: boolean; runs: SweepRunView[] };
}>()({
  method: 'GET',
  path: '/api/admin/media-sweep',
});

/** What a run would delete, with the first 50 keys. Deletes and records nothing. */
export const mediaSweepPreviewApi = endpoint<{
  body: z.infer<typeof sweepKindBody>;
  res: { kind: SweepKind; summary: SweepSummary | ClipSweepSummary };
}>()({
  method: 'POST',
  path: '/api/admin/media-sweep/preview',
});

/** Run the sweep now (the flag does not apply) and record one audit row. */
export const mediaSweepRunApi = endpoint<{
  body: z.infer<typeof sweepKindBody>;
  res: { kind: SweepKind; summary: SweepSummary | ClipSweepSummary };
}>()({
  method: 'POST',
  path: '/api/admin/media-sweep/run',
});
