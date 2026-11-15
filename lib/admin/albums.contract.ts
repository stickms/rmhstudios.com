/**
 * Contracts for the admin album manager, /api/admin/albums (redesign audit C1).
 * Client-safe: types only. Slide upload is multipart and stays a raw call.
 */
import type { z } from 'zod';
import type {
  createAlbumSchema,
  patchAlbumSchema,
  reorderAlbumSlidesSchema,
} from '@/lib/admin/albums-schema';
import { endpoint } from '@/lib/contract/endpoint';

export interface AdminAlbumSlide {
  id: string;
  type: string;
  position: number;
  thumb: string;
  src: string;
}

export interface AdminAlbumRow {
  id: string;
  slug: string;
  title: string;
  description: string;
  position: number;
  slides: AdminAlbumSlide[];
}

type AlbumMeta =
  Omit<
    AdminAlbumRow,
    'slides'
  >;

export const adminAlbumsList =
  endpoint<{
    res: {
      albums: AdminAlbumRow[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/albums',
    },
  );

export const adminAlbumCreate =
  endpoint<{
    body: z.infer<
      typeof createAlbumSchema
    >;
    res: {
      album: AdminAlbumRow;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/albums',
    },
  );

export const adminAlbumPatch =
  endpoint<{
    body: z.infer<
      typeof patchAlbumSchema
    >;
    res: {
      album: AlbumMeta;
    };
  }>()(
    {
      method:
        'PATCH',
      path: '/api/admin/albums/$id',
    },
  );

export const adminAlbumDelete =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/admin/albums/$id',
    },
  );

export const adminAlbumReorder =
  endpoint<{
    body: z.infer<
      typeof reorderAlbumSlidesSchema
    >;
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/albums/$id/reorder',
    },
  );
