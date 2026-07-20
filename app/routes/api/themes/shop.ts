import { createFileRoute } from '@tanstack/react-router';
import { listShop } from '@/lib/themes/themes.server';

/** GET /api/themes/shop?sort=top|new — published community themes. */
export const Route = createFileRoute('/api/themes/shop')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const sort = new URL(request.url).searchParams.get('sort') === 'new' ? 'new' : 'top';
          return Response.json({ themes: await listShop(sort) });
        } catch (error) {
          console.error('Theme shop error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
