import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * `/sohumbum2` — the dossier's original path, kept as a permanent redirect.
 *
 * The page is called `/sohumtracker` now. This route exists because the old URL
 * was already pasted into chats, and a shared link that 404s is worse than a
 * rename that never happened. `beforeLoad` redirects before the loader runs, so
 * nothing is fetched for a page that is not going to render.
 *
 * `replace: true` keeps the dead path out of the visitor's history, so Back goes
 * where they came from rather than bouncing through the redirect again.
 */
export const Route = createFileRoute('/sohumbum2/')({
  beforeLoad: () => {
    throw redirect({ to: '/sohumtracker', replace: true });
  },
});
