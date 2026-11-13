/**
 * Everything that makes the wiki read as its own, Wikipedia-styled site rather
 * than a stock Wiki.js install or a page of rmhstudios.com: the CSS override,
 * the site title and footer, and the sidebar navigation.
 *
 * All of it is Wiki.js configuration, stored in the wiki's database. This
 * module is the one place it is written down, and `applyWikiAppearance()`
 * pushes it through the Wiki.js API with the site's key. It is idempotent and
 * safe to run again after a change here (the "Apply wiki theme" button on
 * /admin/wiki, or `pnpm wiki:theme`). It replaces whatever CSS override and
 * static navigation the wiki had; pages are never touched.
 */
import { STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { WIKIPEDIA_CSS } from '@/lib/wiki/wikipedia-theme';
import { wikiGraphql, wikiLocale, WikiError } from '@/lib/wiki/wikijs.server';

export const WIKI_TITLE = 'RMH Studios Wiki';

interface NavItem {
  id: string;
  kind: 'link' | 'header' | 'divider';
  label?: string;
  icon?: string;
  targetType?: 'home' | 'external';
  target?: string;
  visibilityMode: 'all';
  visibilityGroups: number[];
}

/**
 * The sidebar: Wikipedia's shape, a short "Navigation" list of the wiki's own
 * pages and a second group that leads back to the main site. Ids are stable so
 * re-applying does not churn the stored tree.
 */
export function wikiNavigation(locale: string): NavItem[] {
  const base = { visibilityMode: 'all' as const, visibilityGroups: [] };
  const link = (id: string, label: string, target: string, external = true): NavItem => ({
    ...base,
    id,
    kind: 'link',
    label,
    icon: 'mdi-chevron-right',
    targetType: external ? 'external' : 'home',
    target,
  });
  return [
    link('nav-home', 'Main page', '/', false),
    { ...base, id: 'nav-contents', kind: 'header', label: 'Contents' },
    ...STARTER_PAGES.filter((p) => p.path !== 'home').map((p) =>
      link(`nav-${p.path}`, p.title, `/${locale}/${p.path}`),
    ),
    { ...base, id: 'nav-site', kind: 'header', label: 'RMH Studios' },
    link('nav-site-home', 'rmhstudios.com', 'https://rmhstudios.com'),
  ];
}

interface Result {
  responseResult: { succeeded: boolean; message: string | null } | null;
}

function assertOk(step: string, result: Result | null | undefined): void {
  if (result?.responseResult?.succeeded) return;
  throw new WikiError(
    'rejected',
    `${step}: ${result?.responseResult?.message ?? 'the wiki refused the change'}`,
  );
}

const RESULT = 'responseResult { succeeded message }';

export async function applyWikiAppearance(): Promise<void> {
  const locale = wikiLocale();

  const theming = await wikiGraphql<{ theming: { setConfig: Result } }>(
    `mutation ($css: String!) {
       theming {
         setConfig(theme: "default", iconset: "mdi", darkMode: false, tocPosition: "left",
                   injectCSS: $css, injectHead: "", injectBody: "") { ${RESULT} }
       }
     }`,
    { css: WIKIPEDIA_CSS },
  );
  assertOk('theme', theming.theming.setConfig);

  // Comments, ratings and personal wikis are Wiki.js features with their own
  // accounts; this wiki is read-only for visitors.
  const site = await wikiGraphql<{ site: { updateConfig: Result } }>(
    `mutation ($title: String!, $description: String!) {
       site {
         updateConfig(title: $title, description: $description, company: "RMH Studios",
                      logoUrl: "https://rmhstudios.com/favicon.svg",
                      featurePageRatings: false, featurePageComments: false,
                      featurePersonalWikis: false) { ${RESULT} }
       }
     }`,
    { title: WIKI_TITLE, description: 'The reference for rmhstudios.com.' },
  );
  assertOk('site settings', site.site.updateConfig);

  const mode = await wikiGraphql<{ navigation: { updateConfig: Result } }>(
    `mutation { navigation { updateConfig(mode: STATIC) { ${RESULT} } } }`,
  );
  assertOk('navigation mode', mode.navigation.updateConfig);

  const tree = await wikiGraphql<{ navigation: { updateTree: Result } }>(
    `mutation ($tree: [NavigationTreeInput]!) {
       navigation { updateTree(tree: $tree) { ${RESULT} } }
     }`,
    { tree: [{ locale, items: wikiNavigation(locale) }] },
  );
  assertOk('navigation', tree.navigation.updateTree);
}
