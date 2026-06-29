import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { albumAssetUrl } from '@/lib/storage/keys';
import { logAdminAction } from '@/lib/admin-audit.server';
import { uniqueAlbumSlug } from '@/lib/albums.admin.server';

/**
 * GET  /api/admin/albums — list every album (incl. empty) with slides, for the
 *                          admin manager.
 * POST /api/admin/albums — create a new album. Body: { title, description? }.
 * Admin only.
 */

const createSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/albums/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const rows = await prisma.album.findMany({
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            position: true,
            slides: {
              orderBy: { position: 'asc' },
              select: { id: true, type: true, position: true, srcKey: true, thumbKey: true },
            },
          },
        });

        const albums = rows.map((a) => ({
          id: a.id,
          slug: a.slug,
          title: a.title,
          description: a.description,
          position: a.position,
          slides: a.slides.map((s) => ({
            id: s.id,
            type: s.type,
            position: s.position,
            thumb: albumAssetUrl(s.thumbKey),
            src: albumAssetUrl(s.srcKey),
          })),
        }));
        return Response.json({ albums });
      },

      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json().catch(() => null);
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
          return Response.json({ error: 'Title is required.' }, { status: 400 });
        }

        const slug = await uniqueAlbumSlug(parsed.data.title);
        const last = await prisma.album.findFirst({
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        const album = await prisma.album.create({
          data: {
            slug,
            title: parsed.data.title,
            description: parsed.data.description ?? '',
            position: last ? last.position + 1 : 0,
          },
          select: { id: true, slug: true, title: true, description: true, position: true },
        });

        await logAdminAction(session.user.id, 'album.create', {
          targetType: 'Album',
          targetId: album.id,
          detail: album.title,
        });

        return Response.json({ album: { ...album, slides: [] } });
      },
    },
  },
});
