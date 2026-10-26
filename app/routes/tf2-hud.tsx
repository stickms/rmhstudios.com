/**
 * RMH TF2 HUD Editor layout route — palette shell. The editor itself works
 * signed out (drafts live in the browser); signing in adds cloud saving.
 */

import { createFileRoute, Outlet } from '@tanstack/react-router';
import { appRouteHead } from '@/lib/seo-catalog';
import Tf2HudShell from '@/components/tf2-hud/Tf2HudShell';
import tf2HudCss from '@/components/tf2-hud/tf2-hud.css?url';

export const Route = createFileRoute('/tf2-hud')({
  head: () =>
    appRouteHead('rmh-tf2-hud', {
      links: [
        { rel: 'stylesheet', href: tf2HudCss },
        // The two faces the first paint is set in (headings, body), fetched with the document.
        ...['tf2build', 'tf2secondary'].map((f) => ({
          rel: 'preload',
          as: 'font',
          type: 'font/ttf',
          href: `/tf2-hud/fonts/${f}.ttf`,
          crossOrigin: 'anonymous',
        })),
      ],
    }),
  component: () => (
    <Tf2HudShell>
      <Outlet />
    </Tf2HudShell>
  ),
});
