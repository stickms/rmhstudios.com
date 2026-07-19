import { createFileRoute } from '@tanstack/react-router';
import landing from '@/lib/internal-affairs/landing.html?raw';

/**
 * /rmh-internal-affairs — RMH PMC Department of Internal Affairs.
 *
 * The DIA site is authored as standalone HTML (in lib/internal-affairs) rather
 * than React components, so we serve it through a server route to get a clean,
 * extensionless URL consistent with the other RMH arms (/deeplink, /rmh-pmc, …).
 * CSS/JS/PDFs live under /rmh-internal-affairs/* in public.
 */
const HTML_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
} as const;

export const Route = createFileRoute('/rmh-internal-affairs')({
  server: {
    handlers: {
      GET: () => new Response(landing, { status: 200, headers: HTML_HEADERS }),
    },
  },
});
