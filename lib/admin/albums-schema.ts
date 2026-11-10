import { z } from 'zod';

/** Body of POST /api/admin/albums. */
export const createAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional(),
});

/** Body of PATCH /api/admin/albums/$id (at least one field, checked by the route). */
export const patchAlbumSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).optional(),
});

/** Body of POST /api/admin/albums/$id/reorder. */
export const reorderAlbumSlidesSchema = z.object({ ids: z.array(z.string()).max(5000) });
