import { redirect } from '@tanstack/react-router';

/**
 * `beforeLoad` for a route whose page is an island (redesign audit B1).
 *
 * The route still exists in the site's route tree — that is what keeps its URL
 * typed for `<Link to>` and its GET handler (the island document) reachable —
 * but it has no component: the router can never render it. So a client
 * navigation into it (a `<Link>`, a `navigate()`, the command palette) becomes a
 * document load of the same URL, which the server answers with the island.
 * Preloads (hover intent) do nothing: there is no chunk or loader to warm.
 * On the server this never runs for a GET (the handler answers first).
 */
export function islandBeforeLoad({
  location,
  preload,
}: {
  location: {
    href: string;
  };
  preload: boolean;
}): void {
  if (
    preload ||
    typeof document ===
      'undefined'
  )
    return;
  throw redirect(
    {
      href: location.href,
      reloadDocument: true,
    },
  );
}
