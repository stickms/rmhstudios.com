import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { createAlbumSchema } from '@/lib/admin/albums-schema';
import { adminAlbumCreate, adminAlbumsList } from '@/lib/admin/albums.contract';
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

export const route = apiRoute('/api/admin/albums', {
  GET: implement(adminAlbumsList, { auth: 'admin' }, async () => {
    const rows = await prisma.album.findMany({
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        position: true,
        slides: {
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
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
    return { albums };
  }),

  POST: implement(
    adminAlbumCreate,
    {
      auth: 'admin',
      body: createAlbumSchema,
      invalid: () => Response.json({ error: 'Title is required.' }, { status: 400 }),
    },
    async ({ userId, body }) => {
      // Slug allocation and the trailing-position lookup are independent;
      // only the create below needs both.
      const [slug, last] = await Promise.all([
        uniqueAlbumSlug(body.title),
        prisma.album.findFirst({
          orderBy: { position: 'desc' },
          select: { position: true },
        }),
      ]);
      const album = await prisma.album.create({
        data: {
          slug,
          title: body.title,
          description: body.description ?? '',
          position: last ? last.position + 1 : 0,
        },
        select: { id: true, slug: true, title: true, description: true, position: true },
      });

      await logAdminAction(userId, 'album.create', {
        targetType: 'Album',
        targetId: album.id,
        detail: album.title,
      });

      return { album: { ...album, slides: [] } };
    },
  ),
});
