import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { notFound } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { deleteJamApi } from '@/lib/competitive/jam-delete.contract';
import { getJamApi, updateJamApi } from '@/lib/competitive/jams.contract';
import { deleteJam, getJam, updateJam } from '@/lib/competitive/jams.server';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';

/** Every field optional; the same bounds as the create form. The slug is not a field: it never changes. */
const updateSchema = z.object({
  title: z.string().trim().min(3).max(100).optional(),
  description: z.string().trim().min(1).max(1000).optional(),
  theme: z.string().trim().min(1).max(120).optional(),
  startsAt: z.coerce.date().optional(),
  submitEndsAt: z.coerce.date().optional(),
  ratingEndsAt: z.coerce.date().optional(),
  themeVoteOpensAt: z.coerce.date().optional(),
});

/**
 * GET   /api/jams/:slug — a jam with entries (once started) and, when done, results.
 * PATCH /api/jams/:slug — admin: edit a jam within what its phase allows (`lib/competitive/jam-edit.ts`).
 * DELETE /api/jams/:slug — admin: delete a jam that has not started and has no entries.
 */
export const route = apiRoute('/api/jams/$slug', {
  GET: implement(getJamApi, { auth: 'optional', rateLimit: 'read' }, async ({ params, userId }) => {
    const jam = await getJam(params.slug, userId);
    if (!jam) return notFound('Jam not found');
    return Response.json({ jam }, { headers: { 'Cache-Control': 'private, no-store' } });
  }),
  PATCH: implement(
    updateJamApi,
    { auth: 'admin', rateLimit: 'write', body: updateSchema },
    async ({ params, userId, body }) => {
      const res = await updateJam(userId, params.slug, body);
      if (!res.ok) return Response.json(refusalBody(res.code), { status: ERROR_CODES[res.code].http });
      // The public view: the theme stays withheld before the start, even from the admin who just edited it.
      const jam = await getJam(params.slug, userId);
      if (!jam) return notFound('Jam not found');
      return Response.json({ jam }, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
  DELETE: implement(deleteJamApi, { auth: 'admin', rateLimit: 'write' }, async ({ params, userId }) => {
    const res = await deleteJam(userId, params.slug);
    if (!res.ok) return Response.json(refusalBody(res.code), { status: res.status });
    return Response.json({ ok: true as const });
  }),
});
