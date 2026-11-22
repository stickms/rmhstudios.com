import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { deleteRmhboxPresetApi, updateRmhboxPresetApi } from '@/lib/rmhbox/presets.contract';
import { updatePresetSchema } from '@/lib/rmhbox/presets-schema';
import { deletePreset, updatePreset } from '@/lib/rmhbox/presets.server';

/**
 * PATCH  /api/rmhbox/presets/:id — rename, overwrite the values, or (un)mark as the default.
 * DELETE /api/rmhbox/presets/:id — remove it. Another member's preset answers 404.
 */
export const route = apiRoute('/api/rmhbox/presets/$id', {
  PATCH: implement(
    updateRmhboxPresetApi,
    { rateLimit: 'write', body: updatePresetSchema },
    async ({ userId, params, body }) => {
      const r = await updatePreset(userId, params.id, body);
      if (!r.ok) return Response.json({ error: r.error, code: r.code }, { status: r.status });
      return Response.json({ preset: r.value });
    },
  ),
  DELETE: implement(deleteRmhboxPresetApi, { rateLimit: 'write' }, async ({ userId, params }) =>
    (await deletePreset(userId, params.id))
      ? Response.json({ ok: true })
      : Response.json({ error: 'Not found', code: 'not-found' }, { status: 404 }),
  ),
});
