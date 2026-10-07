import { createFileRoute } from '@tanstack/react-router';
import RmhCapitalLayout from '@/components/rmh-capital/Layout';
import rmhCapitalCss from '@/components/rmh-capital/rmh-capital.css?url';
// Spectral, self-hosted with `font-display: optional` (app/fonts/), its Latin 500
// — the headline weight — preloaded. Inter and JetBrains Mono are the site's own
// self-hosted faces. See lib/fonts/self-hosted.ts.
import spectralCss from '@/app/fonts/spectral.css?url';
import spectralLatin500 from '@fontsource/spectral/files/spectral-latin-500-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';

export const Route = createFileRoute('/rmh-capital')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#06090F' }],
    links: [
      { rel: 'stylesheet', href: rmhCapitalCss },
      { rel: 'stylesheet', href: spectralCss },
      preloadFont(spectralLatin500),
    ],
  }),
  component: RmhCapitalLayout,
});
