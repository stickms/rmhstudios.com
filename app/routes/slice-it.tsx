import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import sliceItCss from '@/components/slice-it/slice-it.css?url';
// The game's two faces, preloaded: Jost for reading text and Audiowide for
// display (`slice-it.css` declares them; the scheme is
// `docs/game-design-schemes/slice-it.json`).
import jostFont from '@/components/shared/game-fonts/Jost/Jost-Variable.woff2?url';
import audiowideFont from '@/components/shared/game-fonts/Audiowide/Audiowide-Regular.woff2?url';

function SliceItLayout() {
  // One theme, no toggle: `.slice-theme` carries the tokens (slice-it.css) and
  // this layout is mounted on EVERY Slice It route, so the chart editor and the
  // player page get them too.
  return (
    <div className="slice-theme min-h-svh" data-jelly-scope="off">
      {/* No <Toaster> here. `components/Providers.tsx` already mounts one for
          the whole app, at bottom-left and themed. A second one rendered every
          toast a second time at sonner's default bottom-right — the same
          message duplicated on both sides of the screen. */}
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/slice-it')({
  head: () =>
    gameRouteHead('slice-it', {
      links: [{ rel: 'stylesheet', href: sliceItCss }],
      fontPreloads: [jostFont, audiowideFont],
    }),
  component: SliceItLayout,
});
