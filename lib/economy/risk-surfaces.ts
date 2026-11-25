/**
 * The places that stake coins, as one list (W8, "self-exclusion hides the surfaces rather than only blocking them").
 *
 * Client-safe and tiny: the shell imports it, so it holds no zod, no icons and no server code. Every menu, list,
 * search and shortcut that points at a risk surface asks `isRiskSurfacePath` (or `withoutRiskSurfaces`) when the
 * member is self-excluded; the two surfaces themselves answer with a notice decided on the server.
 *
 * Only self-exclusion hides. A cool-off refuses the stake and leaves the site's shape alone
 * (`hidesRiskSurfaces`, `lib/economy/play-limits.ts`).
 */

/** Path prefixes of the pages that stake coins. `/predictions` also holds the casino tables (its Games tab). */
export const RISK_SURFACE_PATHS = ['/predictions', '/wager'] as const;

/** The Compete hub's Wagers tab: not a page of its own, but a risk surface all the same. */
export const RISK_SURFACE_TAB_HREF = '/compete?tab=wagers';

/** What a risk page's loader says about the viewer. Signed-out viewers are never excluded. */
export type ExclusionNotice = { excluded: false } | { excluded: true; until: string };

/**
 * Does this href (a path, optionally with a query or hash) lead to a risk surface?
 *
 * `/predictions` and `/wager/<id>` match with any query or sub-path; `/predictionsfoo` and `/admin/predictions` do not.
 * `/compete?tab=wagers` matches, `/compete` and `/compete?tab=ranked` do not.
 */
export function isRiskSurfacePath(href: string): boolean {
  const withoutHash = href.split('#', 1)[0] ?? '';
  const queryAt = withoutHash.indexOf('?');
  const rawPath = queryAt === -1 ? withoutHash : withoutHash.slice(0, queryAt);
  const query = queryAt === -1 ? '' : withoutHash.slice(queryAt + 1);
  const path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : rawPath;
  if (RISK_SURFACE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  if (path === '/compete') return new URLSearchParams(query).get('tab') === 'wagers';
  return false;
}

/** The items left once the risk surfaces are taken out; the same array back while nothing is hidden. */
export function withoutRiskSurfaces<T extends { href: string }>(items: readonly T[], hidden: boolean): readonly T[] {
  return hidden ? items.filter((item) => !isRiskSurfacePath(item.href)) : items;
}

/**
 * How a file that links a risk surface keeps it from a self-excluded member.
 *
 *  - `hook`: reads `useRiskSurfacesHidden()` (`hooks/useRiskSurfacesHidden.ts`) and drops the link.
 *  - `server`: the answer is decided on the server (`readExclusionNotice`, `isSelfExcluded`), so it holds with scripting
 *    off.
 *  - `exempt`: links nothing a self-excluded member sees; the reason says why.
 */
export type RiskSurfaceLinker =
  { file: string; how: 'hook' | 'server' } | { file: string; how: 'exempt'; reason: string };

const NOT_A_LINK = 'a path in data or a comment; no member sees a link from it';
const SIGNED_OUT = 'the signed-out sign-in path; a signed-out viewer is never excluded';

/**
 * Every file that mentions a risk surface outside a comment. `lib/economy/__tests__/risk-surface-linkers.test.ts`
 * scans the source and fails a file that links one without being listed here, and a `hook` or `server` entry that
 * does not call what it says it does.
 */
export const RISK_SURFACE_LINKERS: readonly RiskSurfaceLinker[] = [
  // Menus and lists.
  { file: 'components/shell/Sidebar.tsx', how: 'hook' },
  { file: 'components/shell/GlobeNav.tsx', how: 'hook' },
  { file: 'components/shell/AccountMenu.tsx', how: 'hook' },
  { file: 'components/site/SidebarEditMode.tsx', how: 'hook' },
  { file: 'app/routes/_site/sections.tsx', how: 'hook' },
  // Search and shortcuts. The palette filters its own page list; `/api/search` drops the hits on the server.
  { file: 'components/site/CommandPalette.tsx', how: 'hook' },
  { file: 'components/site/KeyboardShortcuts.tsx', how: 'hook' },
  { file: 'lib/search/universal.server.ts', how: 'server' },
  // Places that point at the surfaces from elsewhere.
  { file: 'components/profile/ProfileHero.tsx', how: 'hook' },
  { file: 'components/wallet/WalletPage.tsx', how: 'hook' },
  { file: 'components/elections/Hero.tsx', how: 'hook' },
  { file: 'components/elections/MarketsPanel.tsx', how: 'hook' },
  { file: 'components/rmhcoins/TableInvite.tsx', how: 'hook' },
  // The surfaces themselves, and the hub that holds a tab.
  { file: 'app/routes/_site/predictions.tsx', how: 'server' },
  { file: 'app/routes/_site/wager.$id.tsx', how: 'server' },
  { file: 'app/routes/_site/compete.tsx', how: 'server' },
  // Data and mentions with no link a member sees.
  {
    file: 'lib/sidebar-nav.ts',
    how: 'exempt',
    reason: 'the nav list; Sidebar, GlobeNav, sections and SidebarEditMode (all listed) filter it',
  },
  {
    file: 'lib/home-widgets.ts',
    how: 'exempt',
    reason: 'the ids a saved sidebar arrangement may name; the editor and the sidebar (listed) filter what they draw',
  },
  {
    file: 'lib/search/catalog.ts',
    how: 'exempt',
    reason: 'the destination catalogue; the palette (hook) and /api/search (server), both listed, filter it',
  },
  {
    file: 'components/wager/WagerCard.tsx',
    how: 'exempt',
    reason: 'drawn only inside the Wagers tab and on /wager/$id, both decided on the server',
  },
  {
    file: 'lib/wager/wager.server.ts',
    how: 'exempt',
    reason: 'a notification link to a match; the page it opens answers a self-excluded member with the notice',
  },
  { file: 'components/rmhcoins/RMHCoinsPage.tsx', how: 'exempt', reason: SIGNED_OUT },
  { file: 'components/rmhcoins/SignedOutLobby.tsx', how: 'exempt', reason: SIGNED_OUT },
  {
    file: 'lib/route/legacy-redirects.ts',
    how: 'exempt',
    reason: 'redirects /wager to /compete, whose loader drops the tab',
  },
  {
    file: 'lib/economy/flows.ts',
    how: 'exempt',
    reason: 'a catalogue of where coins move, shown to admins and documents',
  },
  {
    file: 'lib/sitemap.ts',
    how: 'exempt',
    reason: 'the crawler list; /predictions is a public page that answers the notice',
  },
  { file: 'lib/og/static-card-index.ts', how: 'exempt', reason: NOT_A_LINK },
  { file: 'lib/og/static-cards.ts', how: 'exempt', reason: NOT_A_LINK },
  { file: 'features/casino/feature.ts', how: 'exempt', reason: 'the feature manifest names where the tables live' },
];
