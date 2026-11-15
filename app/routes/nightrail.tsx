import { createFileRoute } from '@tanstack/react-router';
import { renderIslandDocument } from '@/lib/islands/document.server';
import { islandBeforeLoad } from '@/lib/islands/route';

// Nightrail is an island (redesign audit B1): its page is built separately
// (features/nightrail/island.tsx, vite.islands.config.ts) and served as a bare
// document with the game's head — `gameRouteHead('nightrail')`, from the catalog,
// as before — instead of being rendered by the site's router. A client navigation
// here reloads the document (islandBeforeLoad). The loading frame takes the night
// sky the game opens on, as the route's Suspense fallback did.
export const Route = createFileRoute('/nightrail')({
  beforeLoad: islandBeforeLoad,
  server: {
    handlers: {
      GET: ({ request }) =>
        renderIslandDocument('nightrail', request, {
          background: '#0a0713',
          foreground: '#f0abfc',
        }),
    },
  },
});
