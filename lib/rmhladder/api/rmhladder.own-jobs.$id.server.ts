import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteOwnJobApi, updateOwnJobApi } from '@/lib/rmhladder/own-jobs.contract';
import { ownJobPatchBody } from '@/lib/rmhladder/own-jobs-schema';
import { deleteOwnJob, updateOwnJob } from '@/lib/rmhladder/own-jobs.server';

/** PATCH changes one of the caller's own jobs; DELETE removes it with its application, events and offer. */
export const route = apiRoute('/api/rmhladder/own-jobs/$id', {
  PATCH: implement(
    updateOwnJobApi,
    {
      rateLimit: 'write',
      body: ownJobPatchBody,
    },
    async ({ userId, params, body }) => {
      const result = await updateOwnJob(userId, params.id!, body);
      if (!result.ok) return Response.json(result.body, { status: result.status });
      return result.value;
    },
  ),

  DELETE: implement(
    deleteOwnJobApi,
    {
      rateLimit: 'write',
    },
    async ({ userId, params }) => {
      const result = await deleteOwnJob(userId, params.id!);
      if (!result.ok) return Response.json(result.body, { status: result.status });
      return { ok: true as const };
    },
  ),
});
