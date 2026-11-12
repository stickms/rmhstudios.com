import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminStorageHealthApi } from '@/lib/library/admin-library.contract';
import { getLibraryStorageHealth } from '@/lib/library/storage-health.server';

/**
 * GET /api/admin/library/storage-health — admin diagnostic: is library storage
 * durable, and are any uploaded objects missing right now? Admin only.
 */
export const route = apiRoute('/api/admin/library/storage-health', {
  GET: implement(adminStorageHealthApi, { auth: 'admin' }, () => getLibraryStorageHealth()),
});
