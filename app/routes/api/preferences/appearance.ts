import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { SITE_STYLES } from '@/stores/themeStore';
import { ACCENT_PRESETS } from '@/lib/appearance';

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

const schema = z.object({
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
});

export const Route = createFileRoute('/api/preferences/appearance')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }
          const row = await prisma.appearancePreference.findUnique({
            where: { userId: session.user.id },
          });
          return Response.json({ style: row?.style ?? null, accent: row?.accent ?? null });
        } catch (error) {
          console.error('Appearance prefs fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      PUT: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'appearance-prefs',
          });
          if (!allowed) {
            return Response.json({ error: 'Too many requests' }, { status: 429 });
          }

          const body = await request.json().catch(() => null);
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }

          // Undefined fields are omitted by Prisma (left unchanged); explicit null
          // clears the column back to the default.
          const { style, accent } = parsed.data;
          const row = await prisma.appearancePreference.upsert({
            where: { userId: session.user.id },
            create: { userId: session.user.id, style, accent },
            update: { style, accent },
          });
          return Response.json({ style: row.style ?? null, accent: row.accent ?? null });
        } catch (error) {
          console.error('Appearance prefs save error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
