import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
import sliceItCss from '@features/slice-it/ui/slice-it.css?url';
// The game's faces, preloaded: Archivo (everything) and IBM Plex Mono (numbers and
// labels). Bodoni Moda Italic is a single word at a time and loads on demand.
import archivoFont from '@/components/shared/game-fonts/Archivo/Archivo-wdth-wght.woff2?url';
import plexMonoFont from '@/components/shared/game-fonts/IBMPlexMono/IBMPlexMono-Medium.woff2?url';

function SliceItLayout() {
  // One theme, no toggle: `.slice-theme` carries the tokens (slice-it.css) and
  // this layout is mounted on EVERY Slice It route, so the chart editor and the
  // player page get them too.
  return (
    <div className="slice-theme min-h-svh">
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
      fontPreloads: [archivoFont, plexMonoFont],
    }),
  component: SliceItLayout,
});
