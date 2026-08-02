import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { SITE_STYLES } from '@/stores/themeStore';
import { ACCENT_PRESETS } from '@/lib/appearance';
import { appearanceComfortSchema } from '@/lib/appearance/prefs';
import { ensureReadableAccent } from '@/lib/appearance/contrast';

/**
 * GET  /api/preferences/appearance — the caller's saved theme + accent (nulls
 *      when nothing is saved yet, meaning "use the defaults").
 * PUT  /api/preferences/appearance — save theme and/or accent (partial upsert).
 *
 * This is the cross-device source of truth for appearance; the client also keeps
 * a localStorage copy for a no-flash first paint and for signed-out users.
 * Only known theme/accent ids are accepted. A field left out is unchanged; an
 * explicit null clears it back to the default.
 */
const STYLE_IDS = new Set<string>(SITE_STYLES.map((s) => s.id));
const ACCENT_IDS = new Set<string>(ACCENT_PRESETS.map((a) => a.id));

const schema = z
  .object({
    style: z
      .string()
      .nullable()
      .optional()
      .refine((v) => v == null || STYLE_IDS.has(v), { message: 'Unknown theme' }),
    accent: z
      .string()
      .nullable()
      .optional()
      .refine((v) => v == null || ACCENT_IDS.has(v), { message: 'Unknown accent' }),
    reduceTransparency: z.boolean().optional(),
  })
  .and(appearanceComfortSchema);

export const Route = createFileRoute('/api/preferences/appearance')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const row = await prisma.appearancePreference.findUnique({
          where: { userId: session.user.id },
        });
        return Response.json({
          style: row?.style ?? null,
          accent: row?.accent ?? null,
          reduceTransparency: row?.reduceTransparency ?? false,
          fontScale: row?.fontScale ?? null,
          density: row?.density ?? null,
          readableFont: row?.readableFont ?? false,
          customAccent: row?.customAccent ?? null,
          reduceMotion: row?.reduceMotion ?? false,
          glassLevel: row?.glassLevel ?? null,
          colorVision: row?.colorVision ?? null,
        });
      }),

      PUT: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'appearance-prefs' }, body: schema },
        async ({ session, body }) => {
          const {
            style,
            accent,
            reduceTransparency,
            fontScale,
            density,
            readableFont,
            reduceMotion,
            glassLevel,
            colorVision,
          } = body;
          // Custom accent is normalized/nudged through the contrast guard so the
          // stored value is guaranteed to carry a legible label (AA).
          let customAccent = body.customAccent;
          if (customAccent) customAccent = ensureReadableAccent(customAccent).hex;

          const comfort = {
            ...(fontScale !== undefined ? { fontScale } : {}),
            ...(density !== undefined ? { density } : {}),
            ...(readableFont !== undefined ? { readableFont } : {}),
            ...(customAccent !== undefined ? { customAccent } : {}),
            ...(reduceMotion !== undefined ? { reduceMotion } : {}),
            ...(glassLevel !== undefined ? { glassLevel } : {}),
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
              accent,
              reduceTransparency: reduceTransparency ?? false,
              ...comfort,
            },
            update: { style, accent, reduceTransparency, ...comfort },
          });
          return Response.json({
            style: row.style ?? null,
            accent: row.accent ?? null,
            reduceTransparency: row.reduceTransparency ?? false,
            fontScale: row.fontScale ?? null,
            density: row.density ?? null,
            readableFont: row.readableFont ?? false,
            customAccent: row.customAccent ?? null,
            reduceMotion: row.reduceMotion ?? false,
            glassLevel: row.glassLevel ?? null,
          });
        },
      ),
    },
  },
});
