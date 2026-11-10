import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { adminLibraryListApi } from '@/lib/library/admin-library.contract';
import { listAllBooksForAdmin } from '@/lib/library/library.server';

/**
 * GET /api/admin/library — every library book, including hidden ones, for the
 * admin edit manager. Admin only.
 */
export const Route = createFileRoute('/api/admin/library/')({
  server: {
    handlers: {
      GET: implement(adminLibraryListApi, { auth: 'admin' }, async () => ({
        books: await listAllBooksForAdmin(),
      })),
    },
  },
});
