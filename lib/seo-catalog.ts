/**
 * `head()` for the playable route of a first-party game or app.
 *
 * Eighteen game roots and several app roots shipped with no `head()` at all —
 * no title, no description, no canonical, no card. A crawler landing on
 * `/void-breaker` got the site-wide default document, so every one of them was
 * indistinguishable from every other, and a link to one unfurled as "RMH
 * Studios" with the generic card.
 *
 * The copy already exists, in `lib/games.ts` / `lib/apps.ts`, which is the
 * catalog these pages are listed from. Deriving the head from that entry rather
 * than retyping it per route means the two can't drift, and adding a game to
 * the catalog gives its page a correct head for free.
 */

import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { buildCanonical, buildMeta, ogCardPath, SITE_URL } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript, videoGameSchema } from '@/lib/schema';
import { deferredFontScript, preconnectGoogleFonts } from '@/lib/fonts/deferred';

/**
 * The head fragments a `fontsUrl` implies: non-blocking preconnects, and the
 * idle-append script. Empty when the route asked for no font, so a route that
 * doesn't use one emits exactly what it did before.
 */
function fontHead(fontsUrl: string | undefined) {
  if (!fontsUrl) return { links: [], scripts: [] };
  return {
    links: [...preconnectGoogleFonts()],
    scripts: [{ children: deferredFontScript(fontsUrl) }],
  };
}

/**
 * The catalog index pages, and what every game/app breadcrumb walks back to.
 *
 * These used to be `/create?tab=games` and `/create?tab=apps`, because the
 * browser lived only as a tab of Create and there was no `/games` route. That
 * made the browse surface for the whole catalog the one page on the site that
 * could not be submitted to a search engine — `sitemap-coverage` refuses query
 * strings, correctly, since a `?tab=` is a page state and not a page. Both are
 * real routes now (`_site/games/index.tsx`, `_site/apps/index.tsx`) and the
 * Create tabs remain for the creator surfaces stacked above them.
 */
export const GAMES_INDEX_PATH = '/games';
export const APPS_INDEX_PATH = '/apps';

/** A `<link>` descriptor, as TanStack's `head().links` accepts it. */
type LinkTag = Record<string, string>;

interface HeadOptions {
  /**
   * Links the route already needed — several game shells load their own
   * stylesheet from `head()`, and merging here keeps that a one-line change
   * rather than a reason to hand-roll the whole head again.
   */
  links?: LinkTag[];
  /**
   * A Google Fonts `css2?...` URL for a game whose look depends on a display
   * family, loaded the ONLY way that doesn't gate first paint on a third party:
   * preconnect in the head, stylesheet appended on idle
   * (`lib/fonts/deferred.ts`).
   *
   * It is an option here rather than a `<link>` in each game's layout because
   * that is precisely what four game shells used to do, and a
   * `<link rel="stylesheet">` in a component body is the worst available shape:
   * React 19 hoists it and **suspends rendering until it loads**, so the game
   * painted nothing at all until fonts.googleapis.com answered. Routing it
   * through here means a game asks for a font by naming it, and cannot
   * accidentally re-acquire the blocking behaviour.
   */
  fontsUrl?: string;
}

/**
 * Head for a game's playable route.
 *
 * The canonical points at the playable route itself (it is a distinct page from
 * the `/games/{id}` hub — one is the game, the other is its reviews and
 * guides), and the hub is what the JSON-LD breadcrumb walks back through.
 */
export function gameRouteHead(id: string, options: HeadOptions = {}) {
  const game = games.find((g) => g.id === id);
  if (!game) {
    // A route whose id isn't in the catalog is a bug, but a missing head is a
    // worse outcome than a generic one — so degrade rather than throw.
    return {
      meta: buildMeta({ title: 'RMH Studios', description: '', path: `/${id}` }),
      links: options.links ?? [],
    };
  }

  const path = game.href;
  const fonts = fontHead(options.fontsUrl);
  return {
    meta: buildMeta({
      title: `${game.title} — play free in your browser | RMH Studios`,
      description: game.description,
      path,
      image: ogCardPath('game', game.id),
      imageAlt: `${game.title} on RMH Studios.`,
    }),
    links: [buildCanonical(path), ...(options.links ?? []), ...fonts.links],
    scripts: [
      ...fonts.scripts,
      jsonLdScript([
        videoGameSchema({
          name: game.title,
          description: game.longDescription || game.description,
          path,
          image: game.imagePath,
          genres: game.tags,
        }),
        breadcrumbSchema([
          { name: 'Games', path: GAMES_INDEX_PATH },
          { name: game.title, path },
        ]),
      ]),
    ],
  };
}

/** Head for an app's route. Apps are software, not games — no VideoGame node. */
export function appRouteHead(id: string, options: HeadOptions = {}) {
  const app = apps.find((a) => a.id === id);
  if (!app) {
    return {
      meta: buildMeta({ title: 'RMH Studios', description: '', path: `/${id}` }),
      links: options.links ?? [],
    };
  }

  const path = app.href;
  const fonts = fontHead(options.fontsUrl);
  return {
    meta: buildMeta({
      title: `${app.title} — ${app.cta} | RMH Studios`,
      description: app.description,
      path,
      image: app.imagePath || undefined,
      imageAlt: app.imagePath ? `${app.title} on RMH Studios.` : undefined,
      imageSize: app.imagePath ? null : undefined,
    }),
    links: [buildCanonical(path), ...(options.links ?? []), ...fonts.links],
    scripts: [
      ...fonts.scripts,
      jsonLdScript(
        breadcrumbSchema([
          { name: 'Apps', path: APPS_INDEX_PATH },
          { name: app.title, path },
        ]),
      ),
    ],
  };
}

/**
 * `ItemList` JSON-LD for a catalog index page.
 *
 * The index pages are the only place a crawler can see the catalog as a *set*
 * rather than as 21 unrelated documents, so they carry the list. Entries are
 * `url`-only positions rather than nested objects: the full `VideoGame` /
 * `SoftwareApplication` description lives on each item's own page, and
 * repeating it here would be two sources for one fact.
 */
export function catalogItemListSchema(kind: 'game' | 'app') {
  const entries =
    kind === 'game'
      ? games.filter((g) => !g.unlisted && g.href.startsWith('/')).map((g) => `/games/${g.id}`)
      : apps.filter((a) => a.href.startsWith('/')).map((a) => a.href);

  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: kind === 'game' ? 'RMH Studios games' : 'RMH Studios apps',
    numberOfItems: entries.length,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    itemListElement: entries.map((path, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}${path}`,
    })),
  };
}
