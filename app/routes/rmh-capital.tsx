import { createFileRoute } from '@tanstack/react-router';
import RmhCapitalLayout from '@/components/rmh-capital/Layout';
import rmhCapitalCss from '@/components/rmh-capital/rmh-capital.css?url';
// Geist and Geist Mono are the site's own self-hosted faces and set the whole
// microsite. Spectral (self-hosted, `font-display: optional`, app/fonts/) sets
// only the deal tombstones, which are announced in serif as tombstones are; its
// Latin 500 — the weight of the party names — is preloaded. See
// lib/fonts/self-hosted.ts.
import spectralCss from '@/app/fonts/spectral.css?url';
import spectralLatin500 from '@fontsource/spectral/files/spectral-latin-500-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';

export const Route = createFileRoute('/rmh-capital')({
  head: () => ({
    links: [
      { rel: 'stylesheet', href: rmhCapitalCss },
      { rel: 'stylesheet', href: spectralCss },
      preloadFont(spectralLatin500),
    ],
  }),
  component: RmhCapitalLayout,
});
