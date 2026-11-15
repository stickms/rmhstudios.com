import { createFileRoute } from '@tanstack/react-router';
import { renderIslandDocument } from '@/lib/islands/document.server';
import { islandBeforeLoad } from '@/lib/islands/route';

// Void Breaker is an island (redesign audit B1): its page is built separately
// (features/void-breaker/island.tsx, vite.islands.config.ts) and served as a bare
// document with the game's head — `gameRouteHead('void-breaker')`, from the
// catalog, as before — instead of being rendered by the site's router. A client
// navigation here reloads the document (islandBeforeLoad).
export const Route = createFileRoute('/void-breaker')({
  beforeLoad: islandBeforeLoad,
  server: {
    handlers: {
      GET: ({ request }) => renderIslandDocument('void-breaker', request),
    },
  },
});
