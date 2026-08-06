/**
 * /alexdebtcounter → /kaikaidebtcounter.
 *
 * The counter was specified at this path before its subject turned out to be
 * called Kaikai. The canonical URL moved with the name; this stays because the
 * old one had already been handed out, and a link someone shared should not 404
 * over a rename.
 *
 * A `beforeLoad` redirect, not a client-side one: it runs during SSR, so a
 * crawler and a cold page load both get a real 301-shaped navigation rather
 * than a flash of an empty page followed by a route change. `replace` keeps the
 * dead URL out of history, so Back goes where the reader came from instead of
 * bouncing them through the redirect again.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_site/alexdebtcounter')({
  beforeLoad: () => {
    throw redirect({ to: '/kaikaidebtcounter', replace: true });
  },
});
