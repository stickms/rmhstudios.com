import { createFileRoute } from '@tanstack/react-router';
import { renderIslandDocument } from '@/lib/islands/document.server';
import { islandBeforeLoad } from '@/lib/islands/route';

// Cursed Logic is an island (redesign audit B1): its page is built separately
// (features/cursed-logic/island.tsx, vite.islands.config.ts) and served as a bare
// document with the game's head — `gameRouteHead('cursed-logic')`, from the catalog —
// instead of being rendered by the site's router. A client navigation here
// reloads the document (islandBeforeLoad).
export const Route = createFileRoute('/cursed-logic')({
  beforeLoad: islandBeforeLoad,
  server: {
    handlers: {
      GET: ({ request }) => renderIslandDocument('cursed-logic', request),
    },
  },
});
