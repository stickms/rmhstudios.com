/**
 * Universal search — the static half of the corpus: every game, every app, and
 * every destination page on the site.
 *
 * None of this lives in the database, so it can be scored in the browser as
 * well as on the server. `/api/search` uses it so "isleworks" or "passkeys"
 * finds the thing from the search page; the ⌘K palette uses it so both surfaces
 * rank identically instead of each having its own idea of what matches.
 *
 * Client-safe. Icons are Lucide *names* (like `lib/games.ts` does) so this
 * module stays free of React imports.
 */

import { games } from '@/lib/games';
import { apps } from '@/lib/apps';
import { confidenceOf, scoreRecord, MATCH_FLOOR } from './score';
import type { SearchHit, SearchKind } from './types';

export interface SiteDestination {
  id: string;
  title: string;
  href: string;
  /** Lucide icon name; consumers map it to a component. */
  iconName: string;
  /** Extra words people plausibly type when looking for this page. */
  keywords: string;
  /** Hidden from signed-out visitors (the page redirects them to /login). */
  requiresAuth?: boolean;
  /** One-line description shown under the title in results. */
  description?: string;
}

/**
 * The site's named destinations. This is the single source of truth — the
 * command palette renders it too, so a page added here becomes findable from
 * both surfaces at once.
 */
export const SITE_DESTINATIONS: SiteDestination[] = [
  {
    id: 'home',
    title: 'Home',
    href: '/',
    iconName: 'Home',
    keywords: 'feed timeline rmharks posts following',
    description: 'Your feed of posts from people you follow.',
  },
  {
    id: 'explore',
    title: 'Explore & Search',
    href: '/search',
    iconName: 'Compass',
    keywords: 'search find discover trending explore',
    description: 'Search people, posts, builds and writing across RMH Studios.',
  },
  {
    id: 'messages',
    title: 'Messages',
    href: '/messages',
    iconName: 'Inbox',
    keywords: 'inbox dm chat conversations direct',
    requiresAuth: true,
    description: 'Direct messages and group chats.',
  },
  {
    id: 'notifications',
    title: 'Notifications',
    href: '/notifications',
    iconName: 'Bell',
    keywords: 'alerts mentions activity inbox',
    requiresAuth: true,
    description: 'Mentions, replies and activity on your posts.',
  },
  {
    id: 'bookmarks',
    title: 'Bookmarks',
    href: '/bookmarks',
    iconName: 'Bookmark',
    keywords: 'saved posts read later',
    requiresAuth: true,
    description: 'Posts you saved for later.',
  },
  {
    id: 'library',
    title: 'Library',
    href: '/library',
    iconName: 'Library',
    keywords: 'books reading documents pdf epub shelves',
    description: 'Read and share books and documents.',
  },
  {
    id: 'communities',
    title: 'Communities',
    href: '/communities',
    iconName: 'Users',
    keywords: 'groups clubs events spaces live audio rooms rsvp',
    description: 'Groups, spaces and events.',
  },
  {
    id: 'store',
    title: 'Store',
    href: '/store',
    iconName: 'ShoppingBag',
    keywords: 'shop marketplace buy market listings trade sell cosmetics',
    description: 'Cosmetics, listings and the coin marketplace.',
  },
  {
    id: 'arcade',
    title: 'Arcade Pass',
    href: '/arcade',
    iconName: 'Gamepad2',
    keywords: 'games daily challenge leaderboard ranking create',
    description: 'Daily arcade challenges and rewards.',
  },
  {
    id: 'predictions',
    title: 'Predictions',
    href: '/predictions',
    iconName: 'TrendingUp',
    keywords: 'bets markets coins wagers forecasts',
    description: 'Prediction markets settled in coins.',
  },
  {
    id: 'games',
    title: 'Games',
    href: '/games',
    iconName: 'Gamepad2',
    keywords: 'play arcade browser multiplayer puzzle catalog builds',
    description: 'Every game made here, free in the browser.',
  },
  {
    id: 'apps',
    title: 'Apps',
    href: '/apps',
    iconName: 'AppWindow',
    keywords: 'tools watch listen study type code catalog builds',
    description: 'Watch, listen, study, type and code together.',
  },
  {
    id: 'create',
    title: 'Create',
    href: '/create',
    iconName: 'Wand2',
    keywords: 'vibe build ai generate creator studio personas arcade earnings',
    description: 'Build pages and personas, and track what you earn.',
  },
  {
    id: 'achievements',
    title: 'Achievements',
    href: '/achievements',
    iconName: 'Trophy',
    keywords: 'badges progress streaks journey quests battlepass',
    requiresAuth: true,
    description: 'Badges, streaks and daily check-in.',
  },
  {
    id: 'wallet',
    title: 'Wallet',
    href: '/wallet',
    iconName: 'Wallet',
    keywords: 'coins balance transactions ledger staking',
    requiresAuth: true,
    description: 'Your coin balance and transactions.',
  },
  {
    id: 'daily',
    title: 'Daily Puzzles',
    href: '/daily',
    iconName: 'Puzzle',
    keywords: 'lights out alibi spectrum outcast chainlink impostor puzzle',
    description: 'A new set of puzzles every day.',
  },
  {
    id: 'blog',
    title: 'Blog',
    href: '/blog',
    iconName: 'Newspaper',
    keywords: 'articles research posts writing',
    description: 'Long-form writing from RMH Studios.',
  },
  {
    id: 'news',
    title: 'News',
    href: '/news',
    iconName: 'Newspaper',
    keywords: 'headlines updates announcements',
    description: 'Headlines and platform updates.',
  },
  {
    id: 'study',
    title: 'Study Decks',
    href: '/study',
    iconName: 'BookOpen',
    keywords: 'flashcards learn revision rmhstudy decks',
    description: 'Flashcard decks and spaced revision.',
  },
  {
    id: 'roadmap',
    title: 'Roadmap',
    href: '/roadmap',
    iconName: 'Map',
    keywords: 'plans upcoming features changelog',
    description: "What's shipping next.",
  },
  {
    id: 'pricing',
    title: 'Pricing',
    href: '/store?tab=membership',
    iconName: 'Gem',
    keywords: 'subscription membership plans upgrade billing stripe',
    description: 'Membership tiers and what each includes.',
  },
  {
    id: 'ranked',
    title: 'Ranked',
    href: '/ranked',
    iconName: 'Trophy',
    keywords: 'leaderboard elo competitive ladder seasons',
    description: 'Competitive ladders and leaderboards.',
  },
  {
    id: 'help',
    title: 'Help',
    href: '/help',
    iconName: 'HelpCircle',
    keywords: 'help support concierge assistant faq questions guide contact',
    description: 'Guides, FAQ and support.',
  },
  {
    id: 'settings',
    title: 'Settings',
    href: '/settings',
    iconName: 'SlidersHorizontal',
    keywords: 'settings preferences appearance theme language locale notifications account',
    description: 'Appearance, language, notifications and account.',
  },
  {
    id: 'security',
    title: 'Passkeys & Security',
    href: '/settings/security',
    iconName: 'KeyRound',
    keywords: 'passkey webauthn password sign-in settings account sessions devices two factor',
    requiresAuth: true,
    description: 'Passkeys, sessions and sign-in security.',
  },
  {
    id: 'privacy',
    title: 'Privacy & Data',
    href: '/settings/privacy',
    iconName: 'ShieldUser',
    keywords: 'privacy data export download gdpr delete account erasure settings',
    requiresAuth: true,
    description: 'Export or delete your data.',
  },
];

/** Field weights per catalog kind — a title match always beats a keyword match. */
const CATALOG_WEIGHTS = { title: 1, tags: 0.72, description: 0.6, long: 0.4 } as const;

export interface CatalogSearchOptions {
  /** Drop auth-gated destinations for signed-out visitors. */
  signedIn?: boolean;
  /** Max hits per kind. */
  limit?: number;
  /** Minimum score to include. Defaults to {@link MATCH_FLOOR}. */
  floor?: number;
}

/**
 * Score the static catalog against an already-normalised query.
 *
 * Returns hits for the `game`, `app` and `page` kinds, each sorted by score.
 * Pure and synchronous — there is nothing to await, so `/api/search` folds this
 * in without adding latency.
 */
export function searchCatalog(
  normalized: string,
  opts: CatalogSearchOptions = {},
): Record<'game' | 'app' | 'page', SearchHit[]> {
  const floor = opts.floor ?? MATCH_FLOOR;
  const limit = opts.limit ?? 8;
  const empty = { game: [], app: [], page: [] } as Record<'game' | 'app' | 'page', SearchHit[]>;
  if (!normalized) return empty;

  const collect = <T>(
    items: T[],
    kind: SearchKind & ('game' | 'app' | 'page'),
    toHit: (item: T, score: number, reason: SearchHit['reason']) => SearchHit,
    fields: (item: T) => Parameters<typeof scoreRecord>[1],
  ): SearchHit[] => {
    const out: SearchHit[] = [];
    for (const item of items) {
      const { score, reason } = scoreRecord(normalized, fields(item));
      if (score < floor) continue;
      out.push(toHit(item, score, reason));
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  };

  const gameHits = collect(
    games.filter((g) => !g.unlisted),
    'game',
    (g, score, reason) => ({
      key: `game:${g.id}`,
      id: g.id,
      kind: 'game',
      title: g.title,
      subtitle: g.tags.join(' · '),
      snippet: g.description,
      href: g.href,
      image: g.imagePath ?? null,
      score,
      confidence: confidenceOf(score),
      reason,
      meta: { status: g.status, iconName: g.iconName, external: !g.href.startsWith('/') },
    }),
    (g) => [
      { value: g.title, weight: CATALOG_WEIGHTS.title },
      { value: g.tags.join(' '), weight: CATALOG_WEIGHTS.tags },
      { value: g.description, weight: CATALOG_WEIGHTS.description },
      { value: g.longDescription, weight: CATALOG_WEIGHTS.long },
    ],
  );

  const appHits = collect(
    apps.filter((a) => !a.hidden && !a.unlisted),
    'app',
    (a, score, reason) => ({
      key: `app:${a.id}`,
      id: a.id,
      kind: 'app',
      title: a.title,
      subtitle: a.tags.join(' · '),
      snippet: a.description,
      href: a.href,
      image: a.imagePath ?? null,
      score,
      confidence: confidenceOf(score),
      reason,
      meta: { status: a.status, iconName: a.iconName, external: !a.href.startsWith('/') },
    }),
    (a) => [
      { value: a.title, weight: CATALOG_WEIGHTS.title },
      { value: a.tags.join(' '), weight: CATALOG_WEIGHTS.tags },
      { value: a.description, weight: CATALOG_WEIGHTS.description },
      { value: a.longDescription, weight: CATALOG_WEIGHTS.long },
    ],
  );

  const pageHits = collect(
    SITE_DESTINATIONS.filter((d) => opts.signedIn !== false || !d.requiresAuth),
    'page',
    (d, score, reason) => ({
      key: `page:${d.id}`,
      id: d.id,
      kind: 'page',
      title: d.title,
      snippet: d.description,
      href: d.href,
      score,
      confidence: confidenceOf(score),
      reason,
      meta: { iconName: d.iconName },
    }),
    (d) => [
      { value: d.title, weight: CATALOG_WEIGHTS.title },
      { value: d.keywords, weight: CATALOG_WEIGHTS.tags },
      { value: d.description, weight: CATALOG_WEIGHTS.description },
    ],
  );

  return { game: gameHits, app: appHits, page: pageHits };
}
