import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { logAdminAction } from '@/lib/admin-audit.server';
import { migrateStaticLibraryToS3 } from '@/lib/library/migrate.server';

/**
 * POST /api/admin/library/migrate — move any bundled static-catalog PDFs that
 * aren't in object storage yet into S3 as curated books. Idempotent; admin only.
 */
async function requireAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) return null;
  return session;
}

export const Route = createFileRoute('/api/admin/library/migrate')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await requireAdmin(request);
        if (!session) return Response.json({ error: 'Forbidden' }, { status: 403 });
        // Fetch the bundled assets from the same origin that served this request
        // (in prod the files live on the CDN, not the app container's disk).
        const baseUrl = new URL(request.url).origin;
        const summary = await migrateStaticLibraryToS3({ baseUrl });
        await logAdminAction(session.user.id, 'library.migrate', {
          targetType: 'LibraryDocument',
          detail: `migrated ${summary.migrated}, skipped ${summary.skipped}, failed ${summary.failed}`,
        });
        return Response.json({ ok: true, ...summary });
      },
    },
  },
});
