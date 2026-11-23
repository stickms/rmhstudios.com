/**
 * Which section card a path shares, as path → card file and nothing else.
 *
 * `buildMeta` (lib/seo) resolves a route's og:image from this on every page, and
 * route `head()`s run in the browser too: at hydration and on every client
 * navigation. It used to read `STATIC_CARDS` (./static-cards), whose eyebrow,
 * title, subtitle and stats exist only for the card renderer, so 13 KB of card
 * copy shipped in the client entry of every page to answer "which file?"
 * (low-bandwidth audit, 2026-11-18). The browser cannot simply skip the lookup:
 * the hydrated `<meta>` tags must match the server's, or React re-renders the
 * whole document.
 *
 * `STATIC_CARDS` stays the source of truth. `lib/__tests__/og-cards.test.ts`
 * fails when this list and it disagree, and names the row to fix.
 */

/**
 * The card design's version, carried on every card URL (`?v=`) here and by
 * `ogCardPath` in lib/seo.
 *
 * Link-preview services (Discord, X, Slack, iMessage) cache an image by its
 * URL, often for weeks, so a card redrawn under the same URL keeps unfurling
 * in the old design. Bump this when the look of the cards changes (not when
 * one card's content does: the renderers key that themselves) and every page's
 * og:image becomes a new URL. `steel` is the Steel redesign of 2026-11-15.
 */
export const OG_CARD_VERSION = 'steel';

/** `[path prefix, card file]`, in `STATIC_CARDS` order. */
export const STATIC_CARD_INDEX: readonly (readonly [string, string])[] = [
  ['/', 'default'],
  ['/games', 'games'],
  ['/apps', 'apps'],
  ['/blog', 'blog'],
  ['/elections', 'elections'],
  ['/news', 'news'],
  ['/rmhladder', 'rmhladder'],
  ['/library', 'library'],
  ['/daily', 'daily'],
  ['/market', 'market'],
  ['/store', 'pricing'],
  ['/leaderboard', 'leaderboard'],
  ['/rmh-capital', 'rmh-capital'],
  ['/rmh-datacenter', 'rmh-datacenter'],
  ['/rmh-research', 'rmh-research'],
  ['/rmh-pmc', 'rmh-pmc'],
  ['/ventures', 'ventures'],
  ['/rmh-medschool', 'rmh-medschool'],
  ['/rmh-medschool/live', 'rmh-medschool-live'],
  ['/communities', 'communities'],
  ['/groups', 'groups'],
  ['/create/builds', 'user-builds'],
  ['/create/personas', 'personas'],
  ['/create', 'create'],
  ['/create/builds', 'user-builds'],
  ['/builds', 'user-builds'],
  ['/developer', 'developer'],
  ['/rmh-research/psychology', 'psychology'],
  ['/site-history', 'site-history'],
  ['/progress', 'progress'],
  ['/arcade', 'arcade'],
  ['/compete', 'compete'],
  ['/connections', 'connections'],
  ['/quotes', 'quotes'],
  ['/rmhbox-packs', 'rmhbox-packs'],
  ['/kaikaidebtcounter', 'kaikaidebtcounter'],
  ['/explore', 'explore'],
  ['/sections', 'sections'],
  ['/strategies', 'strategies'],
  ['/controller', 'controller'],
  ['/help', 'help'],
  ['/roadmap', 'roadmap'],
  ['/jams', 'jams'],
  ['/rings', 'rings'],
  ['/services/cars', 'cars'],
  ['/services/fashion', 'fashion'],
  ['/services/rebar-rutabaga', 'rebar-rutabaga'],
  ['/services', 'services'],
  ['/homes/rent-split', 'rent-split'],
  ['/homes', 'homes'],
  ['/rideshare', 'rideshare'],
  ['/tf2/play', 'tf2-play'],
  ['/tf2/workshop', 'tf2-workshop'],
  ['/tf2/loadout', 'tf2-loadout'],
  ['/tf2/hud-editor', 'tf2-hud-editor'],
  ['/tf2', 'tf2'],
  ['/predictions', 'predictions'],
  ['/qotd', 'qotd'],
  ['/tools', 'tools'],
  ['/photo-of-the-day', 'photo-of-the-day'],
  ['/calendar', 'calendar'],
  ['/when', 'when'],
  ['/canvas', 'canvas'],
  ['/museum', 'museum'],
  ['/emoji-packs', 'emoji-packs'],
  ['/study', 'study'],
  ['/slice-it', 'slice-it'],
  ['/rmhbox', 'rmhbox'],
  ['/rmhcalculator', 'rmhcalculator'],
  ['/dunesday', 'dunesday'],
  ['/design', 'design'],
  ['/adaptive-intelligence', 'adaptive-intelligence'],
  ['/terms', 'legal'],
  ['/privacy', 'legal'],
  ['/cookies', 'legal'],
  ['/copyright', 'legal'],
];

/** Longest path first, so the most specific match wins. */
const BY_LENGTH = [...STATIC_CARD_INDEX].sort((a, b) => b[0].length - a[0].length);

/**
 * The card file a path should share, or null when nothing matches. `/` is
 * exact-matched: without that, every path would "match" the home card by prefix.
 */
export function staticCardFileFor(path: string): string | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return BY_LENGTH.find(([p]) => p === '/')?.[1] ?? null;
  return BY_LENGTH.find(([p]) => p !== '/' && (clean === p || clean.startsWith(`${p}/`)))?.[1] ?? null;
}

/**
 * Where a card file's image lives. Only `default` is a committed PNG; every other
 * section card is rendered on request by `/api/og/section/$file`.
 */
export function staticCardImageFor(file: string): string {
  return file === 'default'
    ? `/images/og/default.png?v=${OG_CARD_VERSION}`
    : `/api/og/section/${file}?v=${OG_CARD_VERSION}`;
}
