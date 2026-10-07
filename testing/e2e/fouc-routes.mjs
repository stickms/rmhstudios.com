// ─────────────────────────────────────────────────────────────────────────────
// Which pages the FOUC audit covers — derived, never hand-listed.
//
// The one thing a FOUC audit cannot afford is a hand-maintained route list. The
// same lesson `vitest.config.ts` records about test discovery applies with more
// force here: a page missing from the list is a page nobody ever checked, and
// the list reads as coverage either way. So the route set is PARSED out of
// `app/routeTree.gen.ts` — the file TanStack Router regenerates on every dev
// run and every build — and every entry in it must be either audited or
// explicitly, reasonedly excluded. `lib/__tests__/fouc-contract.test.ts` fails
// when something falls through that dichotomy.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, '../..');
const ROUTE_TREE = join(REPO_ROOT, 'app/routeTree.gen.ts');

/**
 * Concrete parameters for every parameterised route.
 *
 * A FOUC audit of `/u/$handle` has to request SOME handle, and the honest thing
 * is to say which and what that buys. Each entry carries:
 *
 * - `path`   — the URL to request, or `null` to skip the route entirely.
 * - `fidelity`
 *     `'content'` — the fixture resolves to a real record, so the audit sees the
 *                   page's loaded state.
 *     `'shell'`   — the fixture deliberately does not resolve; the route renders
 *                   its not-found / empty branch. Still a real page with a real
 *                   first paint, and the root-level detectors (ground, theme
 *                   class, direction, font) are exactly as meaningful there —
 *                   what it does NOT exercise is the content-level styling of a
 *                   populated page.
 * - `why`    — why that is the right fixture, or why the route is skipped.
 *
 * `'shell'` is the honest default for a route whose record would need seeded
 * data: a seeded fixture that silently stopped resolving would quietly downgrade
 * to the same thing while still claiming `'content'`.
 */
export const DYNAMIC_ROUTE_FIXTURES = {
  '/admin/albums/$id': {
    path: null,
    fidelity: 'shell',
    why: 'admin-only; `auth: admin` redirects a signed-out audit run before any paint of its own.',
  },
  '/admin/blog/$slug/edit': { path: null, fidelity: 'shell', why: 'admin-only, as above.' },
  '/altair/multiplayer/$lobbyId': {
    path: '/altair/multiplayer/fouc-audit',
    fidelity: 'shell',
    why: 'A non-existent lobby renders the join/error state — same full-screen game chrome, no socket needed.',
  },
  '/blog/$slug': {
    path: '/blog/fouc-audit-no-such-post',
    fidelity: 'shell',
    why: 'Not-found branch of the blog article shell.',
  },
  '/builds/$slug': {
    path: '/builds/fouc-audit-no-such-build',
    fidelity: 'shell',
    why: 'Not-found branch of the build detail page.',
  },
  '/c/$slug': {
    path: '/c/fouc-audit-no-such-community',
    fidelity: 'shell',
    why: 'Not-found branch of a community page.',
  },
  '/deeplink/$page': {
    path: null,
    fidelity: 'shell',
    why: 'Server route (`deeplink.$page.ts`) — emits a redirect, never an HTML document.',
  },
  '/embed/post/$id': {
    path: '/embed/post/fouc-audit',
    fidelity: 'shell',
    why: 'The oEmbed iframe shell; deliberately chrome-less, and it has its own first paint to protect.',
  },
  '/embed/replay/$id': {
    path: '/embed/replay/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for a replay embed.',
  },
  '/games/$gameId': {
    path: '/games/isleworks',
    fidelity: 'content',
    why: 'A catalog id from `lib/games.ts`, so the detail page renders fully populated.',
  },
  '/games/$gameId/guides/$guideId': {
    path: '/games/isleworks/guides/fouc-audit',
    fidelity: 'shell',
    why: 'Real game, absent guide — the guide shell with its not-found branch.',
  },
  '/groups/$id': {
    path: '/groups/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a group page.',
  },
  '/homes/listing/$id': {
    path: '/homes/listing/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch; RMHHomes keeps the site theme, so the listing shell is site-tier.',
  },
  '/library/$slug': {
    path: '/library/fouc-audit-no-such-book',
    fidelity: 'shell',
    why: 'Not-found branch of the reader. Its route chunk still pulls `library.css` + `vibe.css`, which is the point.',
  },
  '/library/albums/$albumId': {
    path: '/library/albums/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of the album viewer.',
  },
  '/lists/$id': {
    path: '/lists/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a list page.',
  },
  '/messages/$conversationId': {
    path: null,
    fidelity: 'shell',
    why: 'Signed-in only; a signed-out run is redirected before it paints.',
  },
  '/moments/$id': {
    path: '/moments/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a moment page.',
  },
  '/news/$slug': {
    path: '/news/fouc-audit-no-such-item',
    fidelity: 'shell',
    why: 'Not-found branch of a news article.',
  },
  '/personas/$id': {
    path: '/personas/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a persona page.',
  },
  '/profile/$id': {
    path: '/profile/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of the legacy profile route.',
  },
  '/ref/$code': {
    path: null,
    fidelity: 'shell',
    why: 'A tracking landing that stores an attribution code and redirects; no paint of its own, and it is on SPECULATION_EXCLUDED_PATHS for the same reason.',
  },
  '/replays/$id': {
    path: '/replays/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of the replay viewer.',
  },
  '/rmh-internal-affairs/$page': {
    path: null,
    fidelity: 'shell',
    why: 'Server route (`.ts`) serving a prebuilt static bundle, not a React page.',
  },
  '/rmhbox/$lobbyId': {
    path: '/rmhbox/FOUC',
    fidelity: 'shell',
    why: 'A non-existent room code renders the lobby-not-found state in RMHBox chrome.',
  },
  '/rmhbox/minigames/$minigameId/history': {
    path: '/rmhbox/minigames/fouc-audit/history',
    fidelity: 'shell',
    why: 'Not-found branch of the minigame history page.',
  },
  '/rmhladder/jobs/$jobId': {
    path: '/rmhladder/jobs/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch; RMHLadder keeps the site theme.',
  },
  '/rmhmusic/$roomId': {
    path: '/rmhmusic/fouc-audit',
    fidelity: 'shell',
    why: 'A non-existent room; the app shell paints before any socket work.',
  },
  '/rmhstudy/$roomId': {
    path: '/rmhstudy/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for RMHStudy.',
  },
  '/rmhtube/$roomId': {
    path: '/rmhtube/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for RMHTube.',
  },
  '/rmhtype/$roomId': {
    path: '/rmhtype/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for RMHType.',
  },
  '/sitemaps/$name': {
    path: null,
    fidelity: 'shell',
    why: 'Server route emitting XML — there is no unstyled content to flash.',
  },
  '/slice-it/artist/$key': {
    path: '/slice-it/artist/fouc-audit',
    fidelity: 'shell',
    why: 'Slice It is the canonical light/dark app-tier page; its artist route is where a wrong pre-paint ground would show.',
  },
  '/slice-it/edit/$songId': {
    path: '/slice-it/edit/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for the editor.',
  },
  '/slice-it/player/$handle': {
    path: '/slice-it/player/fouc-audit',
    fidelity: 'shell',
    why: 'As above, for a player card.',
  },
  '/sohumbum2/$date': {
    path: '/sohumbum2/2026-01-01',
    fidelity: 'shell',
    why: 'A well-formed date with no record behind it.',
  },
  '/sohumtracker/$date': {
    path: '/sohumtracker/2026-01-01',
    fidelity: 'shell',
    why: 'The dossier follows `prefers-color-scheme` with no toggle, so its pre-paint ground is the interesting part.',
  },
  '/sohumtracker/month/$month': {
    path: '/sohumtracker/month/2026-01',
    fidelity: 'shell',
    why: 'As above, month view.',
  },
  '/sohumtracker/week/$week': {
    path: '/sohumtracker/week/2026-W01',
    fidelity: 'shell',
    why: 'As above, week view.',
  },
  '/spaces/$id': {
    path: '/spaces/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a space page.',
  },
  '/store/$userid': {
    path: '/store/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a creator storefront. Pulls `storefront.css`, which is the reason it is audited rather than skipped.',
  },
  '/strategies/puzzles/$mode': {
    path: '/strategies/puzzles/fouc-audit',
    fidelity: 'shell',
    why: 'An unknown mode renders the picker/error branch in app chrome.',
  },
  '/study/$deckId': {
    path: '/study/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a deck page.',
  },
  '/tag/$tag': {
    path: '/tag/fouc-audit',
    fidelity: 'content',
    why: 'A tag with no posts still renders the populated tag shell plus its empty state.',
  },
  '/tag/$tag/rss.xml': { path: null, fidelity: 'shell', why: 'RSS feed — not an HTML document.' },
  '/thread/$rootId': {
    path: '/thread/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a thread permalink.',
  },
  '/tournaments/$id': {
    path: '/tournaments/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a tournament page.',
  },
  '/u/$handle/rss.xml': { path: null, fidelity: 'shell', why: 'RSS feed — not an HTML document.' },
  '/u/$userid/': {
    path: '/u/fouc-audit/',
    fidelity: 'shell',
    why: 'Not-found branch of a user profile.',
  },
  '/u/$userid/post/$postid': {
    path: '/u/fouc-audit/post/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a post permalink.',
  },
  '/user-builds/$slug': {
    path: '/user-builds/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a User Build page.',
  },
  '/v/$slug': {
    path: '/v/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a vibe page; pulls `vibe.css`.',
  },
  '/wager/$id': {
    path: '/wager/fouc-audit',
    fidelity: 'shell',
    why: 'Not-found branch of a wager page.',
  },
};

/**
 * Static paths excluded from the audit, each with the reason.
 *
 * The only acceptable reason is "this route does not produce an HTML document a
 * human looks at". Anything that renders through `__root.tsx` is in scope — a
 * legal page, an offline fallback and a 404 all have a first paint to protect.
 */
export const EXCLUDED_STATIC_PATHS = {
  '/ads.txt':
    'Server route (`ads[.]txt.ts`) emitting text/plain — no document, no cascade, nothing to flash.',
  '/blog/rss.xml': 'Server route emitting an RSS feed; a feed reader does not paint it.',
  '/news/rss.xml': 'Server route emitting an RSS feed; a feed reader does not paint it.',
  '/sitemap.xml': 'Server route emitting XML for crawlers, not an HTML document.',
  '/robots.txt': 'Static file served from `public/`, not a React page.',
  '/handle': 'Server route that resolves a handle and answers with a redirect; it never paints.',
  '/deeplink': 'Server route that emits a redirect into the app; it never paints.',
  '/rmh-internal-affairs':
    'Server route serving a prebuilt static bundle with its own stylesheet, outside the React tree and the `--site-*` contract entirely.',
  '/.well-known/apple-app-site-association': 'Server route emitting JSON for iOS universal links.',
  '/.well-known/assetlinks.json': 'Server route emitting JSON for Android app links.',
  '/api': 'The JSON API tier — no documents are served from it.',
};

/** True for a path that is part of the JSON API rather than a page. */
const isApiPath = (p) => p === '/api' || p.startsWith('/api/');

/**
 * Every `fullPath` the generated route tree declares, with the source file it
 * came from. The file matters: a `.ts` route is a server route (JSON, XML,
 * a redirect) and a `.tsx` route is a React page, and only the second kind can
 * flash.
 */
export function parseRouteTree(treePath = ROUTE_TREE) {
  const src = readFileSync(treePath, 'utf8');

  // `import { Route as FooRouteImport } from './routes/<file>'`
  const importToFile = new Map();
  for (const m of src.matchAll(/import \{ Route as (\w+) \} from '\.\/routes\/([^']+)'/g)) {
    importToFile.set(m[1], m[2]);
  }

  // `const FooRoute = FooRouteImport.update({ id: '…', path: '…', … })`
  const routes = [];
  const blockRe = /const (\w+) = (\w+)\.update\(\{\s*id: '([^']*)',(?:\s*path: '([^']*)',)?/g;
  for (const m of src.matchAll(blockRe)) {
    const [, , importName, id, path] = m;
    routes.push({ importName, id, path: path ?? null, file: importToFile.get(importName) ?? null });
  }

  // The declared, fully-resolved URLs. `FileRoutesByFullPath` is the generated
  // map of every addressable path, which is what we audit against; the blocks
  // above only give per-segment paths.
  const fullPaths = [...new Set([...src.matchAll(/fullPath: '([^']*)'/g)].map((m) => m[1]))];

  return { routes, fullPaths, importToFile };
}

/**
 * The audit's route set.
 *
 * Returns `{ audited, skipped, unaccounted }`. `unaccounted` is the gate's
 * tripwire: a path that is neither audited nor deliberately excluded. It is
 * always empty in a healthy tree, and the moment someone adds a route it is not,
 * until they say what the new page's FOUC posture is.
 */
export function collectRoutes() {
  const { fullPaths } = parseRouteTree();

  const audited = [];
  const skipped = [];
  const unaccounted = [];

  for (const full of fullPaths.sort()) {
    if (isApiPath(full)) continue;

    if (Object.prototype.hasOwnProperty.call(EXCLUDED_STATIC_PATHS, full)) {
      skipped.push({ route: full, why: EXCLUDED_STATIC_PATHS[full], fidelity: 'excluded' });
      continue;
    }

    if (full.includes('$')) {
      const fixture = DYNAMIC_ROUTE_FIXTURES[full];
      if (!fixture) {
        unaccounted.push(full);
        continue;
      }
      if (fixture.path === null) {
        skipped.push({ route: full, why: fixture.why, fidelity: 'excluded' });
      } else {
        audited.push({
          route: full,
          url: fixture.path,
          fidelity: fixture.fidelity,
          why: fixture.why,
        });
      }
      continue;
    }

    // A static path that ends in a file extension is a server route by
    // convention in this tree (`…rss.xml`, `….txt`); anything else is a page.
    if (/\.[a-z0-9]{2,5}$/i.test(full)) {
      unaccounted.push(full);
      continue;
    }

    audited.push({ route: full, url: full, fidelity: 'content', why: 'Static page.' });
  }

  return { audited, skipped, unaccounted };
}
