import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
// Press Start 2P, self-hosted with `font-display: optional` (app/fonts/) and
// preloaded: the HUD is set in it — lib/fonts/self-hosted.ts.
import pressStart2pCss from '@/app/fonts/press-start-2p.css?url';
import pressStart2pLatin from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff2?url';

function RmhFarmingSimLayout() {
  return (
    <div style={{ width: '100%', height: '100dvh' }}>
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/rmh-farming-sim')({
  head: () =>
    gameRouteHead('rmh-farming-sim', {
      links: [{ rel: 'stylesheet', href: pressStart2pCss }],
      fontPreloads: [pressStart2pLatin],
    }),
  component: RmhFarmingSimLayout,
});
