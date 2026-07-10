import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';

/**
 * POST /api/admin/vibe/backfill-thumbs — re-render gallery thumbnails for every
 * ready vibe page. Admin only.
 *
 * Rather than render inline (the web container has no headless browser), this
 * simply flags all ready pages `thumbnailStale`. The vibe-worker (Go) already
 * polls for stale pages and renders them — so flagging is the whole job and the
 * thumbnails fill back in as the worker churns through the queue. Idempotent and
 * safe to re-run; it never clears an existing thumbnail, only marks it for a fresh
 * render. See scripts/backfill-vibe-thumbs.ts for the manual inline equivalent.
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/vibe/backfill-thumbs')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });

        // Only "ready" pages have real HTML to screenshot — never the empty
        // "generating" placeholders or failed rows.
        const { count } = await prisma.vibePage.updateMany({
          where: { status: 'ready' },
          data: { thumbnailStale: true },
        });

        await logAdminAction(session.user.id, 'vibe.backfill-thumbs', {
          targetType: 'VibePage',
          detail: `flagged ${count} page(s) for thumbnail re-render`,
        });

        return Response.json({ ok: true, count });
      },
    },
  },
});
