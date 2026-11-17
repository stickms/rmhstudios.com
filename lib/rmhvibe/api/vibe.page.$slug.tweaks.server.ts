import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { canEditVibe } from '@/lib/rmhvibe/ownership';
import { vibeTweaksApi } from '@/lib/rmhvibe/vibe-page.contract';
import { vibeTweaksBodySchema } from '@/lib/rmhvibe/vibe-schema';
import { getVibeTweaks } from '@/lib/rmhvibe/vibe.server';
import { validateTweakValues } from '@/lib/rmhvibe/tweaks';

/**
 * POST /api/vibe/page/:slug/tweaks — the owner saves the knob values everyone now sees.
 * Values are validated against the latest version's spec, so a forged key or an
 * out-of-range number never reaches the stored row (or the frames that read it).
 */
export const route = apiRoute('/api/vibe/page/$slug/tweaks', {
  POST: implement(
    vibeTweaksApi,
    { rateLimit: 'write', body: vibeTweaksBodySchema },
    async ({ userId, params, body }) => {
      const page = await prisma.vibePage.findUnique({
        where: { slug: params.slug },
        select: { id: true, ownerId: true },
      });
      if (!page) return Response.json({ error: 'Not found' }, { status: 404 });
      if (!canEditVibe(page.ownerId, userId)) {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { tweakSpec } = await getVibeTweaks(params.slug);
      await prisma.vibePage.update({
        where: { id: page.id },
        data: { tweakValues: validateTweakValues(tweakSpec, body.values), thumbnailStale: true },
      });
      return { ok: true as const };
    },
  ),
});
