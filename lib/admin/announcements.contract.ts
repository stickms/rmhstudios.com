/**
 * Contracts for /api/admin/announcements (redesign audit C1). Client-safe.
 */
import type { z } from 'zod';
import type {
  createAnnouncementSchema,
  updateAnnouncementSchema,
} from '@/lib/announcement-schema';
import { endpoint } from '@/lib/contract/endpoint';

/** One row of the admin announcements list. */
export interface AdminAnnouncement {
  id: string;
  title: string;
  body: string;
  linkUrl:
    | string
    | null;
  linkLabel:
    | string
    | null;
  variant: string;
  active: boolean;
  pinned: boolean;
  createdAt: string;
  expiresAt:
    | string
    | null;
  imageUrls?: string[];
  gifUrl?:
    | string
    | null;
  poll?: {
    id: string;
    question: string;
  } | null;
}

export const adminAnnouncementsList =
  endpoint<{
    res: {
      announcements: AdminAnnouncement[];
    };
  }>()(
    {
      method:
        'GET',
      path: '/api/admin/announcements',
    },
  );

export const adminAnnouncementCreate =
  endpoint<{
    body: z.infer<
      typeof createAnnouncementSchema
    >;
    res: {
      success: true;
      id: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/announcements',
    },
  );

export const adminAnnouncementUpdate =
  endpoint<{
    body: z.infer<
      typeof updateAnnouncementSchema
    >;
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/announcements/$id',
    },
  );

export const adminAnnouncementDelete =
  endpoint<{
    res: {
      success: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/admin/announcements/$id',
    },
  );
