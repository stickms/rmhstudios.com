/**
 * The wiki's sidebar. Wikipedia's look comes from MediaWiki itself (the classic
 * Vector skin, set in `deploy/mediawiki/LocalSettings.php`), so the only part of
 * it the site writes is the navigation: `MediaWiki:Sidebar`, a page in the
 * wiki's interface namespace.
 *
 * This module is the one place the sidebar is written down, and
 * `applyWikiSidebar()` saves it through the API with the site's bot password.
 * It is idempotent (saving the same text again is no edit) and safe to run
 * again after a change here: the "Update sidebar" button on /admin/wiki, or
 * `pnpm wiki:sidebar`. It replaces whatever the sidebar said; articles are
 * never touched.
 */
import { MAIN_PAGE, STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { writeWikiText } from '@/lib/wiki/mediawiki.server';

export const SIDEBAR_TITLE = 'MediaWiki:Sidebar';

/**
 * Wikipedia's shape: a "Navigation" group (MediaWiki's own message keys, so
 * the labels are MediaWiki's), the wiki's starter articles, a group that leads
 * back to the main site, and the skin's search, tools and languages boxes.
 */
export function wikiSidebar(): string {
  const articles = STARTER_PAGES.filter((p) => p.title !== MAIN_PAGE).map(
    (p) => `** ${p.title}|${p.title}`,
  );
  return [
    '* navigation',
    '** mainpage|mainpage-description',
    '** recentchanges-url|recentchanges',
    '** randompage-url|randompage',
    '* Articles',
    ...articles,
    '* RMH Studios',
    '** https://rmhstudios.com|rmhstudios.com',
    '* SEARCH',
    '* TOOLBOX',
    '* LANGUAGES',
    '',
  ].join('\n');
}

export async function applyWikiSidebar(): Promise<void> {
  await writeWikiText(SIDEBAR_TITLE, wikiSidebar(), 'Sidebar from rmhstudios.com/admin/wiki');
}
