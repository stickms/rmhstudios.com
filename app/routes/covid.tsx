import { createFileRoute } from '@tanstack/react-router';
import { CovidPage } from '@/components/covid/CovidPage';
import covidCss from '@/components/covid/covid.css?url';
import { buildMeta, buildCanonical } from '@/lib/seo';
import { deferredFontScript, preconnectGoogleFonts } from '@/lib/fonts/deferred';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..900;1,400..700&family=Inter:wght@300..700&family=Great+Vibes&display=swap';

/**
 * /covid — "Feature Leak: The True Origins of X".
 *
 * A standalone full-screen page in the same tradition as /rmh-pmc and
 * /rmh-capital: its own palette, its own fonts, its own stylesheet served by
 * URL so none of it enters the main bundle. The page is fiction, in the same
 * in-universe register as those two — see the note in CovidPage.tsx.
 */
const PATH = '/covid';
const TITLE = 'Feature Leak: The True Origins of X | RMH Studios';
const DESC =
  'A finding from the RMH Studios Office of Platform Integrity: five facts, a ship-date ledger, and nine departing engineers.';

export const Route = createFileRoute('/covid')({
  head: () => ({
    meta: [
      ...buildMeta({ title: TITLE, description: DESC, path: PATH }),
      { name: 'theme-color', content: '#0A1130' },
    ],
    links: [
      buildCanonical(PATH),
      { rel: 'stylesheet', href: covidCss },
      ...preconnectGoogleFonts(),
    ],
    // Idle-deferred rather than a render-blocking <link> — see
    // `lib/fonts/deferred.ts`.
    scripts: [{ children: deferredFontScript(FONTS_URL) }],
  }),
  component: CovidPage,
});
