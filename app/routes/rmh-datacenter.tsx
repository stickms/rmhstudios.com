import { createFileRoute } from '@tanstack/react-router';
import RmhDatacenterLayout from '@/components/rmh-datacenter/Layout';
import rmhDatacenterCss from '@/components/rmh-datacenter/rmh-datacenter.css?url';
import { deferredFontScript, preconnectGoogleFonts } from '@/lib/fonts/deferred';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap';

export const Route = createFileRoute('/rmh-datacenter')({
  head: () => ({
    meta: [{ name: 'theme-color', content: '#06090A' }],
    links: [{ rel: 'stylesheet', href: rmhDatacenterCss }, ...preconnectGoogleFonts()],
    // Idle-deferred, not a render-blocking <link>: both families already carry
    // `display=swap`, so blocking first paint on fonts.googleapis.com buys
    // nothing and makes this route's paint depend on a third party. See
    // `lib/fonts/deferred.ts`.
    scripts: [{ children: deferredFontScript(FONTS_URL) }],
  }),
  component: RmhDatacenterLayout,
});
