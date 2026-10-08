import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';
// Archivo and IBM Plex Mono, self-hosted with `font-display: optional`
// (app/fonts/); Archivo's Latin file — every heading and the body — preloaded.
// See lib/fonts/self-hosted.ts.
import rmhPmcFontsCss from '@/app/fonts/rmh-pmc.css?url';
import archivoLatin from '@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';

export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#0A0C0E' }],
    links: [
      { rel: 'stylesheet', href: rmhPmcCss },
      { rel: 'stylesheet', href: rmhPmcFontsCss },
      preloadFont(archivoLatin),
    ],
  }),
  component: RmhPmcLayout,
});
