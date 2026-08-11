import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listShop } from '@/lib/themes/themes.server';

/** GET /api/themes/shop?sort=top|new — published community themes. */
export const Route = createFileRoute('/api/themes/shop')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          auth: 'none',
          // The shop listing is the same for everyone; `?sort=` varies the URL,
          // which is the cache key, so both orderings cache independently.
          cache: { visibility: 'public', maxAge: 60, sMaxAge: 300, staleWhileRevalidate: 3600 },
        },
        async ({ request }) => {
          const sort = new URL(request.url).searchParams.get('sort') === 'new' ? 'new' : 'top';
          return Response.json({ themes: await listShop(sort) });
        },
      ),
    },
  },
});
