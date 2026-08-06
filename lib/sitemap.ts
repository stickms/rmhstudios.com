/**
 * The sitemap route registry — what is discoverable, and what deliberately isn't.
 *
 * Every page route on the site is classified here exactly once, and
 * `lib/__tests__/sitemap-coverage.test.ts` fails the build when a route exists
 * that this file doesn't mention. That gate is the whole point: the previous
 * sitemap was a hand-written list of fourteen paths that nobody revisited as the
 * site grew, so it drifted into advertising `/games` and `/apps` (routes that do
 * not exist — both 404), `/blog` and `/user-builds` (both redirect), while
 * omitting user profiles, posts, vibe pages, communities and ~60 static pages
 * entirely. A list that can silently go stale will.
 *
 * Client-safe: no Prisma, no `node:*`. The DB-backed halves live in
 * `lib/sitemap.server.ts`.
 */

import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

/** One `<url>` in a sitemap. */
export interface SitemapEntry {
  loc: string;
  lastmod?: Date | string;
  changefreq?: 'always' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'never';
  priority?: number;
}

/**
 * Hard ceiling from the sitemap protocol: 50,000 URLs (and 50MB uncompressed)
 * per file. We chunk at 40,000 so a section can grow ~25% between deploys
 * without a chunk silently overflowing and invalidating the whole file.
 */
export const SITEMAP_CHUNK_SIZE = 40_000;

// ─────────────────────────── static routes ───────────────────────────

/**
 * Every static (non-parameterised) route that should be indexed.
 *
 * `priority` is relative-within-site only — it tells a crawler how to spend its
 * budget here, and means nothing across domains. The tiers: 1.0 home · 0.8 the
 * hubs people land on from search · 0.6 first-party games and apps · 0.5
 * secondary surfaces · 0.3 corporate/legal.
 */
export const STATIC_ROUTES: SitemapEntry[] = [
  { loc: '/', changefreq: 'daily', priority: 1.0 },

  // Primary hubs. `/games` and `/apps` are the public catalog indexes; they
  // were listed here for a long time with nothing behind them, then dropped
  // when that was found, and now exist. `/create` is the creator half of the
  // same catalog (Arcade Pass, Ranked, personas, earnings) and stays listed.
  { loc: '/games', changefreq: 'weekly', priority: 0.9 },
  { loc: '/apps', changefreq: 'weekly', priority: 0.9 },
  { loc: '/create', changefreq: 'daily', priority: 0.8 },
  { loc: '/explore', changefreq: 'daily', priority: 0.8 },
  { loc: '/library', changefreq: 'daily', priority: 0.8 },
  { loc: '/news', changefreq: 'daily', priority: 0.8 },
  { loc: '/communities', changefreq: 'daily', priority: 0.8 },
  // `/rmhladder`, `/homes` and `/rmhcode` are apps, so `catalogRoutes()`
  // already emits them — listing them here too would put the same URL in the
  // sitemap twice, which Search Console reports as a warning.
  { loc: '/rmhladder/jobs', changefreq: 'daily', priority: 0.8 },

  // Secondary site surfaces.
  //
  // Absent on purpose: `/arcade`, `/leaderboard`, `/events`, `/market`,
  // `/shop`, `/pricing`, `/personas`, `/playlists`, `/spaces` and `/v` all look
  // like destinations in the nav but are `beforeLoad` redirects into a tab of
  // `/create`, `/store`, `/communities` or `/library`. They are in
  // `EXCLUDED_ROUTES` as redirects; the pages they land on are listed here
  // instead. `/shop` and `/pricing` joined that list late — they were listed
  // here *and* self-canonical while `/store` was too, so one catalog and one
  // pricing table each claimed two canonical URLs.
  { loc: '/achievements', changefreq: 'weekly', priority: 0.5 },
  // Community-made packs: a public browse surface, so it's indexable.
  { loc: '/emoji-packs', changefreq: 'weekly', priority: 0.5 },
  // Public per-game speedrun boards.
  { loc: '/speedruns', changefreq: 'daily', priority: 0.5 },
  { loc: '/groups', changefreq: 'weekly', priority: 0.5 },
  { loc: '/help', changefreq: 'monthly', priority: 0.6 },
  { loc: '/predictions', changefreq: 'daily', priority: 0.5 },
  { loc: '/quotes', changefreq: 'weekly', priority: 0.4 },
  { loc: '/ranked', changefreq: 'daily', priority: 0.5 },
  { loc: '/rideshare', changefreq: 'weekly', priority: 0.5 },
  { loc: '/roadmap', changefreq: 'weekly', priority: 0.5 },
  { loc: '/services', changefreq: 'monthly', priority: 0.6 },
  { loc: '/store', changefreq: 'weekly', priority: 0.5 },
  { loc: '/study', changefreq: 'weekly', priority: 0.5 },
  { loc: '/study/browse', changefreq: 'daily', priority: 0.5 },
  { loc: '/tournaments', changefreq: 'daily', priority: 0.5 },
  { loc: '/ventures', changefreq: 'monthly', priority: 0.6 },
  { loc: '/wager', changefreq: 'daily', priority: 0.4 },

  // Developer platform — the API is a promotable product surface.
  { loc: '/developer', changefreq: 'weekly', priority: 0.6 },

  // Ventures: separately-branded arms, each a small marketing site.
  { loc: '/rmh-capital', changefreq: 'monthly', priority: 0.5 },
  { loc: '/rmh-capital/businesses', changefreq: 'monthly', priority: 0.4 },
  { loc: '/rmh-capital/careers', changefreq: 'weekly', priority: 0.4 },
  { loc: '/rmh-capital/contact', changefreq: 'yearly', priority: 0.3 },
  { loc: '/rmh-capital/firm', changefreq: 'monthly', priority: 0.4 },
  { loc: '/rmh-capital/insights', changefreq: 'weekly', priority: 0.4 },
  { loc: '/rmh-pmc', changefreq: 'monthly', priority: 0.5 },
  { loc: '/rmh-pmc/capabilities', changefreq: 'monthly', priority: 0.4 },
  { loc: '/rmh-pmc/command', changefreq: 'monthly', priority: 0.4 },
  { loc: '/rmh-pmc/contact', changefreq: 'yearly', priority: 0.3 },
  { loc: '/rmh-pmc/intelligence', changefreq: 'monthly', priority: 0.4 },
  { loc: '/rmh-pmc/operators', changefreq: 'monthly', priority: 0.4 },
  { loc: '/adaptive-intelligence', changefreq: 'monthly', priority: 0.5 },
  { loc: '/deeplink', changefreq: 'monthly', priority: 0.5 },

  // Campaigns and standalone statements.
  { loc: '/black-lives-matter', changefreq: 'yearly', priority: 0.3 },
  { loc: '/covid', changefreq: 'yearly', priority: 0.3 },

  // Engineering/design write-ups. Real content, and the kind that earns links.
  { loc: '/design', changefreq: 'monthly', priority: 0.5 },
  { loc: '/liquid-glass', changefreq: 'monthly', priority: 0.4 },
  { loc: '/optimization', changefreq: 'monthly', priority: 0.4 },
  { loc: '/security', changefreq: 'monthly', priority: 0.4 },

  // Legal. Low priority, but they must be crawlable — several app stores and
  // payment processors check that the linked policy actually resolves.
  { loc: '/privacy', changefreq: 'yearly', priority: 0.3 },
  { loc: '/terms', changefreq: 'yearly', priority: 0.3 },
  { loc: '/cookies', changefreq: 'yearly', priority: 0.3 },
  { loc: '/copyright', changefreq: 'yearly', priority: 0.3 },
];

// ────────────────────── games, apps and their hubs ──────────────────────

/**
 * The playable/usable route for every listed first-party game and app, plus the
 * `/games/{id}` hub that carries the per-game meta, reviews and VideoGame
 * JSON-LD. External entries (Steam, Discord) are skipped — they aren't ours to
 * list. `/rmhbox/minigames` is included because it is a real content page.
 */
export function catalogRoutes(): SitemapEntry[] {
  const entries: SitemapEntry[] = [];

  for (const g of games) {
    if (!g.href.startsWith('/') || g.unlisted) continue;
    entries.push({ loc: g.href, changefreq: 'weekly', priority: 0.6 });
    // The hub is the indexable landing page: the playable route is a
    // full-screen canvas with nothing for a crawler to read.
    entries.push({ loc: `/games/${g.id}`, changefreq: 'weekly', priority: 0.6 });
    // Curated-build detail pages mirror the catalog and carry the long copy.
    entries.push({ loc: `/builds/${g.id}`, changefreq: 'monthly', priority: 0.4 });
  }

  for (const a of apps) {
    if (!a.href.startsWith('/') || a.unlisted || a.hidden) continue;
    entries.push({ loc: a.href, changefreq: 'weekly', priority: 0.6 });
    entries.push({ loc: `/builds/${a.id}`, changefreq: 'monthly', priority: 0.4 });
  }

  entries.push({ loc: '/rmhbox/minigames', changefreq: 'monthly', priority: 0.4 });

  // A game and an app could in principle share an id; de-dupe on `loc` so the
  // same URL is never emitted twice (a validation warning in Search Console).
  const seen = new Set<string>();
  return entries.filter((e) => (seen.has(e.loc) ? false : (seen.add(e.loc), true)));
}

// ─────────────────────── deliberately not indexed ───────────────────────

/**
 * Why a route is absent from the sitemap. The reason is not decoration — the
 * coverage test prints it, so whoever trips the gate can tell at a glance
 * whether their new route belongs in `STATIC_ROUTES` or here.
 */
export type ExclusionReason =
  /** Requires a session; a crawler only ever sees the login redirect. */
  | 'auth-gated'
  /** Personal to one viewer — inbox, wallet, drafts, settings. */
  | 'personal'
  /** Admin-only. */
  | 'admin'
  /** Only redirects somewhere else. Listing it would advertise a redirect. */
  | 'redirect'
  /** Public, but intentionally not indexed (embeds, easter eggs, tooling). */
  | 'noindex'
  /** An ephemeral realtime room — a lobby id that is dead within the hour. */
  | 'ephemeral'
  /** Alias of a canonical URL that IS listed. */
  | 'duplicate';

/**
 * Static routes that are not in the sitemap, and why.
 *
 * Keyed by the route's `fullPath` with any trailing slash stripped.
 */
export const EXCLUDED_ROUTES: Record<string, ExclusionReason> = {
  // ── personal / auth-gated ──
  '/analytics': 'personal',
  '/bookmarks': 'redirect', // → /saves
  '/drafts': 'personal',
  '/history': 'personal',
  '/lists': 'redirect', // → /saves?tab=lists
  '/messages': 'personal',
  '/notifications': 'personal',
  '/progress': 'personal',
  '/recap': 'personal',
  '/saves': 'personal',
  '/share': 'personal',
  '/wallet': 'personal',
  '/trash': 'personal',
  '/wishlist': 'redirect', // → /saves?tab=wishlist
  '/wrapped': 'personal',
  '/creator-studio': 'personal',
  '/homes/manage': 'personal',
  '/homes/saved': 'personal',
  '/homes/submit': 'auth-gated',
  '/homes/watches': 'personal',
  '/rideshare/drive': 'auth-gated',
  '/rideshare/ride': 'auth-gated',
  '/rmhladder/alerts': 'personal',
  '/rmhladder/health': 'personal',
  '/rmhladder/pipeline': 'personal',
  '/rmhladder/resume': 'personal',
  '/rmhladder/review': 'personal',
  '/rmhladder/settings': 'personal',
  '/settings': 'personal',
  '/settings/account-status': 'personal',
  '/settings/appearance': 'personal',
  '/settings/circle': 'personal',
  '/settings/content': 'personal',
  '/settings/layout': 'personal',
  '/settings/notifications': 'personal',
  '/settings/privacy': 'personal',
  '/settings/profile': 'personal',
  '/settings/security': 'personal',
  '/settings/themes': 'personal',
  '/studio/themes': 'redirect', // → /settings/themes
  '/user-builds/manage': 'personal',
  '/user-builds/submit': 'auth-gated',
  '/v/new': 'auth-gated',
  '/login': 'noindex',
  '/rmhcode/auth': 'auth-gated',

  // ── admin ──
  '/admin': 'admin',
  '/admin/albums': 'admin',
  '/admin/analytics': 'admin',
  '/admin/announcements': 'admin',
  '/admin/appeals': 'admin',
  '/admin/audit': 'admin',
  '/admin/blog': 'admin',
  '/admin/blog/new': 'admin',
  '/admin/economy': 'admin',
  '/admin/library-quota': 'admin',
  '/admin/library-storage': 'admin',
  '/admin/predictions': 'admin',
  '/admin/redemptions': 'admin',
  '/admin/reports': 'admin',
  '/admin/rideshare': 'admin',
  '/admin/security-reports': 'admin',
  '/admin/user-builds': 'admin',
  '/admin/users': 'admin',

  // ── redirects ──
  // A sitemap entry that redirects is an indexing error in Search Console, and
  // `/user-builds` → `/builds` → `/create?tab=games` was two errors for one
  // URL. `/blog` and `/user-builds` were both in the old sitemap.
  //
  // The rest of this block is the trap that made the old list wrong in the
  // first place: these read like destinations — they have nav entries, they
  // have names people use — but each is a `beforeLoad` redirect into a tab of
  // another page. Nothing about the route file's name says so.
  '/blog': 'redirect', // → /library
  '/user-builds': 'redirect', // → /builds → /create?tab=games
  '/builds': 'redirect', // → /create?tab=games
  '/lights-out': 'redirect', // → /daily/lights-out
  '/arcade': 'redirect', // → /create?tab=games
  '/leaderboard': 'redirect', // → /create?tab=games&sub=leaderboard
  '/events': 'redirect', // → /communities?tab=events
  '/market': 'redirect', // → /store?tab=market
  '/shop': 'redirect', // → /store?tab=shop
  '/pricing': 'redirect', // → /store?tab=membership
  '/personas': 'redirect', // → /create?tab=personas
  '/playlists': 'redirect', // → /library?view=music
  '/spaces': 'redirect', // → /communities?tab=spaces
  '/v': 'redirect', // → /create?tab=pages
  '/search': 'redirect', // → /explore (the two pages were merged)
  // Admin-gated: signed-in non-admins are redirected to /rmhladder.
  '/rmhladder/companies': 'admin',

  // ── public but not for the index ──
  '/offline': 'noindex', // the service worker's offline shell
  '/music-trivia': 'noindex', // an in-page widget, not a destination
  '/discord/lights-out': 'noindex', // Discord Activity surface, minimal head
  '/discord/rmhbox': 'noindex',
  '/rmh-internal-affairs': 'noindex', // internal microsite
  '/secret': 'noindex', // easter eggs — indexing them defeats the point
  '/secret/cursed-logic': 'noindex',
  '/secret/signal-forge': 'noindex',
  '/secret/vega': 'noindex',
  // A page about one named person, linked from their profile. It is meant to be
  // found by people who already know them, not by a search for their name.
  '/sohumbum': 'noindex',

  // ── ephemeral realtime rooms ──
  '/altair/multiplayer': 'ephemeral',
  '/rmhmusic/player': 'ephemeral',
  '/rmhtype/multiplayer': 'ephemeral',
  '/rmhtype/solo': 'duplicate', // same content as `/rmhtype`

  // ── strategies: an in-game meta layer, all of it behind a save ──
  '/strategies/incidents': 'auth-gated',
  '/strategies/profile': 'personal',
  '/strategies/profile/reputation': 'personal',
  '/strategies/profile/settings': 'personal',
  '/strategies/puzzles': 'auth-gated',
  '/strategies/puzzles/archive': 'auth-gated',
  '/strategies/puzzles/leaderboard': 'auth-gated',
  '/strategies/safehouse': 'auth-gated',
  '/strategies/safehouse/drops': 'auth-gated',
  '/strategies/safehouse/recruit': 'auth-gated',
  '/strategies/sahur': 'noindex',

  // ── daily puzzles: the hub `/daily` is listed via the catalog, the
  //     individual puzzles rotate their content every day ──
  '/daily/alibi': 'duplicate',
  '/daily/chainlink': 'duplicate',
  '/daily/impostor': 'duplicate',
  '/daily/lights-out': 'duplicate',
  '/daily/outcast': 'duplicate',
  '/daily/spectrum': 'duplicate',
  '/forest-explorer/explore': 'duplicate',
  '/forest-explorer/story': 'duplicate',
};

/**
 * The child sitemaps `/sitemap.xml` can point at.
 *
 * Declared here rather than inferred from `SITEMAP_SECTIONS` so the names are
 * reachable without importing the server module (and with it Prisma, and with
 * that a `DATABASE_URL`) — which is what lets the coverage test check the
 * wiring at all. `lib/sitemap.server.ts` implements exactly this set, and the
 * test asserts the two halves agree.
 */
export const SITEMAP_SECTION_NAMES = [
  'pages',
  'content',
  'builds',
  'users',
  'posts',
  'community',
  'homes',
  'jobs',
] as const;

export type SitemapSectionName = (typeof SITEMAP_SECTION_NAMES)[number];

/**
 * Parameterised routes, and which sitemap section supplies their URLs.
 *
 * A value of `null` means the route is dynamic but deliberately unlisted — the
 * reason is in the comment. Anything else names a section in
 * `SITEMAP_SECTIONS` (`lib/sitemap.server.ts`), and the coverage test asserts
 * that section actually exists.
 */
export const DYNAMIC_ROUTES: Record<string, SitemapSectionName | null> = {
  '/blog/$slug': 'content',
  '/news/$slug': 'content',
  '/library/$slug': 'content',
  '/library/albums/$albumId': 'content',
  '/games/$gameId': 'pages', // from the catalog, not the DB
  '/games/$gameId/guides/$guideId': 'content',
  '/builds/$slug': 'pages', // curated builds mirror the catalog
  '/user-builds/$slug': 'builds',
  '/v/$slug': 'builds',
  '/u/$userid': 'users',
  '/u/$userid/post/$postid': 'posts',
  '/c/$slug': 'community',
  '/personas/$id': 'community',
  '/study/$deckId': 'community',
  '/tournaments/$id': 'community',
  '/homes/listing/$id': 'homes',
  '/rmhladder/jobs/$jobId': 'jobs',

  // Dynamic and deliberately unlisted.
  '/deeplink/$page': null, // sub-pages of the raw-HTML Deeplink microsite
  '/rmh-internal-affairs/$page': null, // internal microsite
  '/embed/post/$id': null, // iframe embed of a post that IS listed
  '/embed/replay/$id': null,
  '/replays/$id': null, // a match replay; the payload is a binary trace
  '/moments/$id': null, // short-lived, expires
  '/profile/$id': null, // legacy alias of `/u/$userid`
  '/store/$userid': null, // mirrors the profile; would duplicate it
  '/thread/$rootId': null, // canonicalised to `/u/{handle}/post/{id}`
  '/tag/$tag': null, // unbounded tag space; crawlable via posts, not listed
  '/groups/$id': null, // membership-scoped
  '/spaces/$id': null, // live audio room, gone when it ends
  '/wager/$id': null, // settles and becomes stale within a day
  '/lists/$id': null, // personal
  '/messages/$conversationId': null, // personal
  '/admin/albums/$id': null,
  '/admin/blog/$slug/edit': null,
  '/altair/multiplayer/$lobbyId': null, // ephemeral lobby
  '/rmhbox/$lobbyId': null,
  '/rmhbox/minigames/$minigameId/history': null,
  '/rmhmusic/$roomId': null,
  '/rmhstudy/$roomId': null,
  '/rmhtube/$roomId': null,
  '/rmhtype/$roomId': null,
  '/strategies/puzzles/$mode': null,
  '/ref/$code': null, // referral link; redirects and is noindex
};

// ──────────────────────────── XML rendering ────────────────────────────

export function xmlEscape(value: string): string {
  return value.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

/** Render a `<urlset>`. `origin` is the absolute site root, no trailing slash. */
export function renderUrlset(entries: SitemapEntry[], origin: string): string {
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(origin + entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${isoDate(entry.lastmod)}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority !== undefined) {
        parts.push(`    <priority>${entry.priority.toFixed(1)}</priority>`);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/** Render a `<sitemapindex>` pointing at child sitemaps. */
export function renderSitemapIndex(paths: string[], origin: string, lastmod: Date): string {
  const body = paths
    .map(
      (p) =>
        `  <sitemap>\n    <loc>${xmlEscape(origin + p)}</loc>\n    <lastmod>${lastmod.toISOString()}</lastmod>\n  </sitemap>`,
    )
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</sitemapindex>\n`;
}

/** `/sitemaps/users-2.xml` → `{ section: 'users', chunk: 2 }`. */
export function parseChunkName(name: string): { section: string; chunk: number } | null {
  const match = /^([a-z]+)(?:-(\d+))?\.xml$/.exec(name);
  if (!match) return null;
  const chunk = match[2] ? Number(match[2]) : 1;
  if (!Number.isInteger(chunk) || chunk < 1 || chunk > 1000) return null;
  return { section: match[1], chunk };
}

/** The inverse: `('users', 2)` → `/sitemaps/users-2.xml`. */
export function chunkPath(section: string, chunk: number): string {
  return `/sitemaps/${section}${chunk > 1 ? `-${chunk}` : ''}.xml`;
}
