import { createFileRoute, Outlet } from '@tanstack/react-router';
import { gameRouteHead } from '@/lib/seo-catalog';
// EB Garamond, Cinzel, Playfair Display and Patrick Hand, self-hosted with `font-display: optional` (app/fonts/) and
// preloaded — lib/fonts/self-hosted.ts.
import ebGaramondCss from '@/app/fonts/eb-garamond.css?url';
import ebGaramondLatin from '@fontsource-variable/eb-garamond/files/eb-garamond-latin-wght-normal.woff2?url';

function VersecraftLayout() {
  return (
    <div
      style={
        {
          '--font-eb-garamond': '"EB Garamond", serif',
          '--font-cinzel': '"Cinzel", serif',
          '--font-playfair': '"Playfair Display", serif',
          '--font-patrick-hand': '"Patrick Hand", cursive',
        } as React.CSSProperties
      }
    >
      <Outlet />
    </div>
  );
}

export const Route = createFileRoute('/versecraft')({
  head: () =>
    gameRouteHead('versecraft', {
      links: [{ rel: 'stylesheet', href: ebGaramondCss }],
      fontPreloads: [ebGaramondLatin],
    }),
  component: VersecraftLayout,
});
