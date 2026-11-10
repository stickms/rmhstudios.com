import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { prisma } from '@/lib/prisma.server';
import { findMemberForViewAs, viewAsMember } from '@/lib/safety/view-as.server';

/**
 * GET /api/admin/view-as?user=<id|handle> — S5. Read-only render of a member's
 * entitlements, mutes/blocks and feed. Every lookup is written to AdminAuditLog
 * before any data is read.
 */
export const Route = createFileRoute('/api/admin/view-as')({
  server: {
    handlers: {
      GET: implement(
        C.adminViewAsApi,
        { auth: 'admin', rateLimit: 'read', query: z.object({ user: z.string().min(1).max(80) }) },
        async ({ userId, query }) => {
          const target = await findMemberForViewAs(query.user);
          if (!target) return Response.json({ error: 'No such member' }, { status: 404 });
          // Written directly (not via the swallow-errors helper): no audit row, no data.
          await prisma.adminAuditLog.create({
            data: {
              adminId: userId,
              action: 'user.view_as',
              targetType: 'user',
              targetId: target.id,
            },
          });
          const data = await viewAsMember(target.id);
          if (!data) return Response.json({ error: 'No such member' }, { status: 404 });
          return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
        },
      ),
    },
  },
});
