import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';
import { updateAnnouncementSchema } from '@/lib/announcement-schema';
import {
  adminAnnouncementDelete,
  adminAnnouncementUpdate,
} from '@/lib/admin/announcements.contract';

/**
 * POST  /api/admin/announcements/$id — toggle active / edit fields. Admin only.
 * DELETE /api/admin/announcements/$id — delete an announcement.
 */
export const Route = createFileRoute('/api/admin/announcements/$id')({
  server: {
    handlers: {
      POST: implement(
        adminAnnouncementUpdate,
        {
          auth: 'admin',
          body: updateAnnouncementSchema,
          allowEmptyBody: true,
          invalid: () => Response.json({ error: 'Invalid input' }, { status: 400 }),
        },
        async ({ userId, body, params }) => {
          await prisma.feedAnnouncement.update({
            where: { id: params.id },
            data: body,
          });
          await logAdminAction(userId, 'announcement.update', {
            targetType: 'FeedAnnouncement',
            targetId: params.id,
            detail: JSON.stringify(body),
          });
          return { success: true as const };
        },
      ),
      DELETE: implement(adminAnnouncementDelete, { auth: 'admin' }, async ({ userId, params }) => {
        await prisma.feedAnnouncement.delete({ where: { id: params.id } }).catch(() => {});
        await logAdminAction(userId, 'announcement.delete', {
          targetType: 'FeedAnnouncement',
          targetId: params.id,
        });
        return { success: true as const };
      }),
    },
  },
});
