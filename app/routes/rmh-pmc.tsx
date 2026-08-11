import { createFileRoute } from '@tanstack/react-router';
import RmhPmcLayout from '@/components/rmh-pmc/Layout';
import rmhPmcCss from '@/components/rmh-pmc/rmh-pmc.css?url';
import { deferredFontScript, preconnectGoogleFonts } from '@/lib/fonts/deferred';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100,400;100,500;100,600;125,700;125,800&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap';

export const Route = createFileRoute('/rmh-pmc')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#0A0C0E' }],
    links: [
      { rel: 'stylesheet', href: rmhPmcCss },
      ...preconnectGoogleFonts(),
    ],
    // Idle-deferred rather than a render-blocking <link> — see
    // `lib/fonts/deferred.ts` for why (first paint stops depending on
    // fonts.googleapis.com; `display=swap` behaviour is unchanged).
    scripts: [{ children: deferredFontScript(FONTS_URL) }],
  }),
  component: RmhPmcLayout,
});
