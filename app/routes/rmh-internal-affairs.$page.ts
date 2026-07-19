import { createFileRoute } from '@tanstack/react-router';
import department from '@/lib/internal-affairs/department.html?raw';
import success from '@/lib/internal-affairs/success.html?raw';
import appeal from '@/lib/internal-affairs/appeal.html?raw';

/**
 * /rmh-internal-affairs/<page> — DIA detail pages (The Department, Success
 * Stories, Appeals). Each page is standalone HTML in lib/internal-affairs,
 * served at a clean URL. The map is an explicit allow-list so the param can
 * never read an arbitrary module.
 */
const PAGES: Record<string, string> = {
  department,
  success,
  appeal,
};

const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
} as const;

export const Route = createFileRoute('/rmh-internal-affairs/$page')({
  server: {
    handlers: {
      GET: ({ params }) => {
        const html = PAGES[params.page];
        if (!html) {
          return new Response('Not found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        }
        return new Response(html, { status: 200, headers: HTML_HEADERS });
      },
    },
  },
});
