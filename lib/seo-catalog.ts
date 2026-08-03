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
import { buildCanonical, buildMeta, ogCardPath } from '@/lib/seo';
import { breadcrumbSchema, jsonLdScript, videoGameSchema } from '@/lib/schema';

/** Where the games/apps browser actually lives. There is no `/games` route. */
export const GAMES_INDEX_PATH = '/create?tab=games';
export const APPS_INDEX_PATH = '/create?tab=apps';

/** A `<link>` descriptor, as TanStack's `head().links` accepts it. */
type LinkTag = Record<string, string>;

interface HeadOptions {
  /**
   * Links the route already needed — several game shells load their own
   * stylesheet from `head()`, and merging here keeps that a one-line change
   * rather than a reason to hand-roll the whole head again.
   */
  links?: LinkTag[];
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
  return {
    meta: buildMeta({
      title: `${game.title} — play free in your browser | RMH Studios`,
      description: game.description,
      path,
      image: ogCardPath('game', game.id),
      imageAlt: `${game.title} on RMH Studios.`,
    }),
    links: [buildCanonical(path), ...(options.links ?? [])],
    scripts: [
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
  return {
    meta: buildMeta({
      title: `${app.title} — ${app.cta} | RMH Studios`,
      description: app.description,
      path,
      image: app.imagePath || undefined,
      imageAlt: app.imagePath ? `${app.title} on RMH Studios.` : undefined,
      imageSize: app.imagePath ? null : undefined,
    }),
    links: [buildCanonical(path), ...(options.links ?? [])],
    scripts: [
      jsonLdScript(
        breadcrumbSchema([
          { name: 'Apps', path: APPS_INDEX_PATH },
          { name: app.title, path },
        ]),
      ),
    ],
  };
}
