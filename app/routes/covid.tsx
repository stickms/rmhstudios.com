import { createFileRoute } from '@tanstack/react-router';
import { CovidPage } from '@/components/covid/CovidPage';
import covidCss from '@/components/covid/covid.css?url';
import { buildMeta, buildCanonical } from '@/lib/seo';
// Playfair Display (uprights site-wide, italics here) and Great Vibes, self-hosted
// with `font-display: optional` (app/fonts/); the upright Latin file — the
// headlines — preloaded. Inter is the site's own. See lib/fonts/self-hosted.ts.
import covidFontsCss from '@/app/fonts/covid.css?url';
import playfairLatin from '@fontsource-variable/playfair-display/files/playfair-display-latin-wght-normal.woff2?url';
import { preloadFont } from '@/lib/fonts/self-hosted';

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
      { rel: 'stylesheet', href: covidFontsCss },
      preloadFont(playfairLatin),
    ],
  }),
  component: CovidPage,
});
