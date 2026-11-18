import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { invalidateCached } from '@/lib/cached.server';
import { appearanceSeedKey } from '@/lib/appearance/seed-cache.server';
import { SITE_STYLES } from '@/stores/themeStore';
import { appearanceComfortSchema } from '@/lib/appearance/prefs-schema';
import { getAppearancePrefsApi } from '@/lib/preferences/preferences.contract';
import { setAppearancePrefsApi } from '@/lib/preferences/preferences.contract';

/**
 * GET  /api/preferences/appearance — the caller's saved theme and comfort settings (nulls
 *      when nothing is saved yet, meaning "use the defaults").
 * PUT  /api/preferences/appearance — save them (partial upsert).
 *
 * This is the cross-device source of truth for appearance; the client also keeps
 * a localStorage copy for a no-flash first paint and for signed-out users.
 * Only known theme ids are accepted. A field left out is unchanged; an
 * explicit null clears it back to the default.
 */
const STYLE_IDS = new Set<string>(SITE_STYLES.map((s) => s.id));

const schema = z
  .object({
    style: z
      .string()
      .nullable()
      .optional()
      .refine((v) => v == null || STYLE_IDS.has(v), { message: 'Unknown theme' }),
  })
  .and(appearanceComfortSchema);

export const route = apiRoute('/api/preferences/appearance', {
  GET: implement(getAppearancePrefsApi, {}, async ({ session }) => {
    const row = await prisma.appearancePreference.findUnique({
      where: { userId: session.user.id },
    });
    return Response.json({
      style: row?.style ?? null,
      fontScale: row?.fontScale ?? null,
      density: row?.density ?? null,
      readableFont: row?.readableFont ?? false,
      colorVision: row?.colorVision ?? null,
      jellyMotion: row?.jellyMotion ?? null,
    });
  }),

  PUT: implement(
    setAppearancePrefsApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'appearance-prefs' }, body: schema },
    async ({ session, body }) => {
      const { style, fontScale, density, readableFont, colorVision, jellyMotion } = body;

      const comfort = {
        ...(fontScale !== undefined ? { fontScale } : {}),
        ...(density !== undefined ? { density } : {}),
        ...(readableFont !== undefined ? { readableFont } : {}),
        ...(jellyMotion !== undefined ? { jellyMotion } : {}),
        // 'none' is stored as null so the column means "no override".
        ...(colorVision !== undefined
          ? { colorVision: colorVision === 'none' ? null : colorVision }
          : {}),
      };
      const row = await prisma.appearancePreference.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          style,
          ...comfort,
        },
        // The accent presets and custom accent were retired (owner, 2026-11-18). Their columns stay until a
        // contract migration drops them; any save clears what an older client left there.
        update: { style, accent: null, customAccent: null, ...comfort },
      });
      // perf: the root loader caches the seed row (__root.tsx); drop it so the
      // next render reflects this save on every instance.
      await invalidateCached(appearanceSeedKey(session.user.id));
      return Response.json({
        style: row.style ?? null,
        fontScale: row.fontScale ?? null,
        density: row.density ?? null,
        readableFont: row.readableFont ?? false,
        colorVision: row.colorVision ?? null,
        jellyMotion: row.jellyMotion ?? null,
      });
    },
  ),
});
