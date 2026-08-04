/**
 * Altair Layout — the theme shell.
 *
 * It used to be the auth gate too, and that was the wrong door. Altair is a
 * single-player roguelike with a co-op mode bolted to the side: the run, the
 * classes, the bestiary and the meta shop are all local, and none of them has
 * ever needed to know who you are. The gate turned away every visitor at the
 * URL for the sake of one screen behind it.
 *
 * The gate moved to that screen — `/altair/multiplayer` — where it is true. The
 * menu button that leads there asks with a modal instead, so a signed-out player
 * who taps MULTIPLAYER out of curiosity keeps the game they were already in.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import AltairShell from '@/components/altair/AltairShell';
import altairCss from '@/components/altair/altair.css?url';

function AltairLayout() {
  return (
    <AltairShell>
      <Outlet />
    </AltairShell>
  );
}

export const Route = createFileRoute('/altair')({
  head: () => gameRouteHead('altair', { links: [{ rel: 'stylesheet', href: altairCss }] }),
  component: AltairLayout,
});
