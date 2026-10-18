import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay, userDisplaySelect } from '@/lib/user-display';
import { renderProfileCard } from '@/lib/og/profile-card.server';
import { SITE_URL } from '@/lib/seo';

/**
 * GET /api/profile/$id/card[?download=1] — the profile card PNG with a QR code
 * that opens the profile (P10). `$id` is a handle or a user id. Public: it shows
 * only what the profile page and its Open Graph card already show.
 */
const query = z.object({ download: z.enum(['1']).optional() });

export const Route = createFileRoute('/api/profile/$id/card')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // Rendering is CPU work (satori + resvg), so the bucket is tight.
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'profile-card' },
          query,
          etag: false,
        },
        async ({ params, query: q }) => {
          const id = params.id.replace(/^@/, '');
          const select = {
            ...userDisplaySelect,
            profile: { select: { displayName: true, customImage: true, bio: true } },
          };
          const user =
            (await prisma.user.findUnique({ where: { handle: id }, select })) ??
            (await prisma.user.findUnique({ where: { id }, select }));
          if (!user) return new Response('Not found', { status: 404 });

          const resolved = resolveUserDisplay(user);
          const handleOrId = user.handle ?? user.id;
          const png = await renderProfileCard({
            id: user.id,
            name: resolved.name || 'RMH Studios',
            handle: user.handle ?? user.username ?? null,
            image: resolved.image ?? null,
            bio: user.profile?.bio ?? null,
            url: `${SITE_URL}/u/${encodeURIComponent(handleOrId)}`,
          });

          const headers: Record<string, string> = {
            'Content-Type': 'image/png',
            'Cache-Control': 'public, max-age=600, s-maxage=3600, stale-while-revalidate=86400',
          };
          if (q.download) {
            const safe = handleOrId.replace(/[^A-Za-z0-9_-]/g, '') || 'profile';
            headers['Content-Disposition'] = `attachment; filename="rmh-${safe}-card.png"`;
          }
          return new Response(new Uint8Array(png), { headers });
        },
      ),
    },
  },
});
