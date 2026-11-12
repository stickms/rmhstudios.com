import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { adminLibraryListApi } from '@/lib/library/admin-library.contract';
import { listAllBooksForAdmin } from '@/lib/library/library.server';

/**
 * GET /api/admin/library — every library book, including hidden ones, for the
 * admin edit manager. Admin only.
 */
export const route = apiRoute('/api/admin/library', {
  GET: implement(adminLibraryListApi, { auth: 'admin' }, async () => ({
    books: await listAllBooksForAdmin(),
  })),
});
