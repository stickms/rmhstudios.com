/**
 * Contracts for /api/rmhladder/own-jobs (sprint 13, feature 08). Client-safe: types come from the zod schema by
 * `import type`, so this file ships no zod.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { OwnJobView } from '@/lib/rmhladder/own-jobs';
import type { ownJobBody, ownJobPatchBody } from '@/lib/rmhladder/own-jobs-schema';

/** Add a job found elsewhere: the job and the application that tracks it (stage "Not applied"). */
export const createOwnJobApi = endpoint<{
  body: z.infer<typeof ownJobBody>;
  res: {
    job: OwnJobView;
    applicationId: string;
  };
}>()({
  method: 'POST',
  path: '/api/rmhladder/own-jobs',
});

/** Change one of the caller's own jobs. */
export const updateOwnJobApi = endpoint<{
  body: z.infer<typeof ownJobPatchBody>;
  res: {
    job: OwnJobView;
  };
}>()({
  method: 'PATCH',
  path: '/api/rmhladder/own-jobs/$id',
});

/** Delete one of the caller's own jobs, with its application, events and offer. */
export const deleteOwnJobApi = endpoint<{
  res: {
    ok: true;
  };
}>()({
  method: 'DELETE',
  path: '/api/rmhladder/own-jobs/$id',
});
