import { createFileRoute } from '@tanstack/react-router';
import { renderIslandDocument } from '@/lib/islands/document.server';
import { islandBeforeLoad } from '@/lib/islands/route';
import { noindexHead } from '@/lib/seo';

// Project Vega is an island (redesign audit B1): its page is built separately
// (features/vega/island.tsx, vite.islands.config.ts) and served as a bare
// document instead of being rendered by the site's router. A client navigation
// here (the Vault's card) reloads the document (islandBeforeLoad).
//
// Vega is unlisted, so the catalog has no head for it: the document carries the
// heads the router merged for this URL before — the `/secret` layout's
// `noindexHead('Secret')`, then this page's title and description.
export const Route = createFileRoute('/secret/vega')({
  beforeLoad: islandBeforeLoad,
  server: {
    handlers: {
      GET: ({ request }) =>
        renderIslandDocument('vega', request, {
          heads: [
            noindexHead('Secret'),
            {
              meta: [
                { title: 'Project Vega | RMH Studios' },
                { name: 'description', content: 'The Recursion Defense System' },
              ],
            },
          ],
        }),
    },
  },
});
