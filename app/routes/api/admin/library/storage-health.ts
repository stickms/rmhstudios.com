import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminStorageHealthApi } from '@/lib/library/admin-library.contract';
import { getLibraryStorageHealth } from '@/lib/library/storage-health.server';

/**
 * GET /api/admin/library/storage-health — admin diagnostic: is library storage
 * durable, and are any uploaded objects missing right now? Admin only.
 */
export const Route = createFileRoute('/api/admin/library/storage-health')({
  server: {
    handlers: {
      GET: implement(adminStorageHealthApi, { auth: 'admin' }, () => getLibraryStorageHealth()),
    },
  },
});
