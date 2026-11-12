import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { backfillVibeThumbsApi } from '@/lib/rmhvibe/vibe-admin.contract';
import { prisma } from '@/lib/prisma.server';
import { logAdminAction } from '@/lib/admin-audit.server';

/**
 * POST /api/admin/vibe/backfill-thumbs — re-render gallery thumbnails for every
 * ready vibe page. Admin only.
 *
 * Rather than render inline (the web container has no headless browser), this
 * simply flags all ready pages `thumbnailStale`. The vibe thumbnail worker (jobs) already
 * polls for stale pages and renders them — so flagging is the whole job and the
 * thumbnails fill back in as the worker churns through the queue. Idempotent and
 * safe to re-run; it never clears an existing thumbnail, only marks it for a fresh
 * render. See scripts/backfill-vibe-thumbs.ts for the manual inline equivalent.
 */
export const route = apiRoute('/api/admin/vibe/backfill-thumbs', {
  POST: implement(backfillVibeThumbsApi, { auth: 'admin' }, async ({ userId }) => {
    // Only "ready" pages have real HTML to screenshot — never the empty
    // "generating" placeholders or failed rows.
    const { count } = await prisma.vibePage.updateMany({
      where: { status: 'ready' },
      data: { thumbnailStale: true },
    });

    await logAdminAction(userId, 'vibe.backfill-thumbs', {
      targetType: 'VibePage',
      detail: `flagged ${count} page(s) for thumbnail re-render`,
    });

    return { ok: true as const, count };
  }),
});
