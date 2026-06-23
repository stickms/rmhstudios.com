import { createFileRoute } from '@tanstack/react-router';
import landing from '@/lib/deeplink/landing.html?raw';

/**
 * /deeplink — RMH Deeplink landing page.
 *
 * The Deeplink site is authored as standalone HTML (in lib/deeplink) rather than
 * React components, so we serve it through a server route to get a clean,
 * extensionless URL consistent with the other RMH arms (/adaptive-intelligence,
 * /rmh-pmc, …). CSS lives at /deeplink.css and images at /images/deeplink/*.
 */
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
} as const;

export const Route = createFileRoute('/deeplink')({
  server: {
    handlers: {
      GET: () => new Response(landing, { status: 200, headers: HTML_HEADERS }),
    },
  },
});
