import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/communities/read-along.contract';
import { requireMod } from '@/lib/communities/guard.server';
import { booksQuery } from '@/lib/communities/read-along-schema';
import { searchBooks } from '@/lib/communities/read-along-books.server';

/** GET /api/communities/$slug/read-alongs/books?q= — library books the community can read, by title (moderators). */
export const route = apiRoute('/api/communities/$slug/read-alongs/books', {
  GET: implement(
    C.readAlongBooksApi,
    {
      rateLimit: 'read',
      query: booksQuery,
    },
    async ({ params, session, query }) => {
      const guard = await requireMod(params.slug, session.user.id);
      if (!guard.ok) return guard.response;
      return { books: await searchBooks(query.q) };
    },
  ),
});
