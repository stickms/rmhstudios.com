import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createOwnJobApi } from '@/lib/rmhladder/own-jobs.contract';
import { ownJobBody } from '@/lib/rmhladder/own-jobs-schema';
import { createOwnJob } from '@/lib/rmhladder/own-jobs.server';

/** POST adds a job the caller found elsewhere to their own pipeline (300 at most; the link is stored, never fetched). */
export const route = apiRoute('/api/rmhladder/own-jobs', {
  POST: implement(
    createOwnJobApi,
    {
      rateLimit: 'write',
      body: ownJobBody,
    },
    async ({ userId, body }) => {
      const result = await createOwnJob(userId, body);
      if (!result.ok) return Response.json(result.body, { status: result.status });
      return result.value;
    },
  ),
});
