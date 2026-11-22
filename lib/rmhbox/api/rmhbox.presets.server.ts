import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createRmhboxPresetApi, listRmhboxPresetsApi } from '@/lib/rmhbox/presets.contract';
import { createPresetSchema, listPresetsQuerySchema } from '@/lib/rmhbox/presets-schema';
import { createPreset, listPresets } from '@/lib/rmhbox/presets.server';

/**
 * GET  /api/rmhbox/presets?minigame= — the caller's presets (one minigame, or all).
 * POST /api/rmhbox/presets           — save the current settings under a name.
 */
export const route = apiRoute('/api/rmhbox/presets', {
  GET: implement(
    listRmhboxPresetsApi,
    { rateLimit: 'read', query: listPresetsQuerySchema },
    async ({ userId, query }) =>
      Response.json(
        { presets: await listPresets(userId, query.minigame) },
        { headers: { 'Cache-Control': 'private, no-store' } },
      ),
  ),
  POST: implement(createRmhboxPresetApi, { rateLimit: 'write', body: createPresetSchema }, async ({ userId, body }) => {
    const r = await createPreset(userId, body);
    if (!r.ok) return Response.json({ error: r.error, code: r.code }, { status: r.status });
    return Response.json({ preset: r.value }, { status: 201 });
  }),
});
