import { createFileRoute } from '@tanstack/react-router';
import { renderIslandDocument } from '@/lib/islands/document.server';
import { islandBeforeLoad } from '@/lib/islands/route';
import { noindexHead } from '@/lib/seo';

// Signal Forge is an island (redesign audit B1): its page is built separately
// (features/signal-forge/island.tsx, vite.islands.config.ts) and served as a bare
// document instead of being rendered by the site's router. A client navigation
// here (the Vault's card) reloads the document (islandBeforeLoad).
//
// Signal Forge is unlisted, so the catalog has no head for it: the document
// carries the heads the router merged for this URL before — the `/secret`
// layout's `noindexHead('Secret')`, then this page's title and `noindex`.
export const Route = createFileRoute('/secret/signal-forge')({
  beforeLoad: islandBeforeLoad,
  server: {
    handlers: {
      GET: ({ request }) =>
        renderIslandDocument('signal-forge', request, {
          heads: [
            noindexHead('Secret'),
            { meta: [{ title: 'Signal Forge | RMH Studios' }, { name: 'robots', content: 'noindex' }] },
          ],
        }),
    },
  },
});
