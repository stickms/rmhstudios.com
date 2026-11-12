import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminLibraryMigrateApi } from '@/lib/library/admin-library.contract';
import { logAdminAction } from '@/lib/admin-audit.server';
import { migrateStaticLibraryToS3 } from '@/lib/library/migrate.server';

/**
 * POST /api/admin/library/migrate — move any bundled static-catalog PDFs that
 * aren't in object storage yet into S3 as curated books. Idempotent; admin only.
 */
export const route = apiRoute('/api/admin/library/migrate', {
  POST: implement(adminLibraryMigrateApi, { auth: 'admin' }, async ({ request, userId }) => {
    // Fetch the bundled assets from the same origin that served this request
    // (in prod the files live on the CDN, not the app container's disk).
    const baseUrl = new URL(request.url).origin;
    const summary = await migrateStaticLibraryToS3({ baseUrl });
    await logAdminAction(userId, 'library.migrate', {
      targetType: 'LibraryDocument',
      detail: `migrated ${summary.migrated}, skipped ${summary.skipped}, failed ${summary.failed}`,
    });
    return { ok: true as const, ...summary };
  }),
});
