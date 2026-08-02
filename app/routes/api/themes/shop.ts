import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listShop } from '@/lib/themes/themes.server';

/** GET /api/themes/shop?sort=top|new — published community themes. */
export const Route = createFileRoute('/api/themes/shop')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'none' }, async ({ request }) => {
        const sort = new URL(request.url).searchParams.get('sort') === 'new' ? 'new' : 'top';
        return Response.json({ themes: await listShop(sort) });
      }),
    },
  },
});
