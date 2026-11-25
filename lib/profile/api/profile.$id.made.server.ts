import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { refusalBody } from '@/lib/errors/codes';
import { getMadeApi } from '@/lib/profile/made.contract';
import { parseMadeKinds } from '@/lib/profile/made';
import { madeBy } from '@/lib/profile/made.server';

/**
 * GET /api/profile/$id/made?kinds=connections,deck — up to four of each kind the member has made and published (the
 * "Made here" module). `$id` is the user id; `kinds` is one comma-separated list (all kinds when absent).
 *
 * The same 404 for an unknown member, a deleted or banned one, and a pair blocked in either direction. The answer
 * depends on who asks (blocks), so it is `private`.
 */
export const route = apiRoute('/api/profile/$id/made', {
  GET: implement(
    getMadeApi,
    {
      auth: 'optional',
      rateLimit: 'read',
      query: z.object({
        kinds: z
          .string()
          .max(80)
          .regex(/^[a-z-]*(,[a-z-]+)*$/)
          .optional(),
      }),
    },
    async ({ params, userId, query }) => {
      const items = await madeBy(params.id, userId, parseMadeKinds(query.kinds));
      if (!items) return Response.json({ ...refusalBody('NOT_FOUND') }, { status: 404 });
      return Response.json({ items }, { headers: { 'Cache-Control': 'private, max-age=60' } });
    },
  ),
});
