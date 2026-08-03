/**
 * The static Open Graph cards, and which paths they answer for.
 *
 * Most of the site's pages are section indexes and marketing pages: they have no
 * row in a database to render a card from, and wiring an `image:` into each of
 * them by hand is exactly the kind of per-route bookkeeping that ends up half
 * done — which is how nearly every page on the site came to unfurl as the same
 * one generic image.
 *
 * So the mapping lives here instead, as data. `scripts/gen-og-cards.tsx` renders
 * one PNG per entry into `public/images/og/`, and `buildMeta` in `lib/seo.ts`
 * resolves a path to its card automatically — longest matching prefix wins, so
 * `/games/isleworks` inherits the games card unless it names its own (it does:
 * a dynamic one).
 *
 * This module is **client-safe** — plain data, no renderer — because `lib/seo`
 * imports it and `buildMeta` runs during SSR of every route.
 */

export interface StaticCard {
  /** Path prefix this card answers for. `/` matches only the home page. */
  path: string;
  /** Basename under `public/images/og/`, without the extension. */
  file: string;
  /** The kicker: what kind of page this is. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Optional figures, for sections that have a countable inventory. */
  stats?: { value: string; label: string; lead?: boolean }[];
}

/**
 * Ordered longest-path-first at lookup time, not here — keep this list grouped
 * by area so it stays readable.
 */
export const STATIC_CARDS: StaticCard[] = [
  {
    path: '/',
    file: 'default',
    eyebrow: 'The everything platform',
    title: 'Make it, play it, share it.',
    subtitle:
      'A social-first home for original games, creative tools, music, learning, and the people making them.',
    stats: [
      { value: '18', label: 'games', lead: true },
      { value: '12', label: 'apps' },
      { value: '16', label: 'languages' },
    ],
  },
  {
    path: '/games',
    file: 'games',
    eyebrow: 'Games',
    title: 'Eighteen games, in the browser.',
    subtitle:
      'Party games, puzzles, roguelikes and 3D — multiplayer where it matters, no download anywhere.',
    stats: [{ value: '18', label: 'to play', lead: true }],
  },
  {
    path: '/apps',
    file: 'apps',
    eyebrow: 'Apps',
    title: 'Twelve tools that live here.',
    subtitle:
      'Watch parties, music, typing, study, code, ladders — full apps, not demos, all on one account.',
    stats: [{ value: '12', label: 'apps', lead: true }],
  },
  {
    path: '/blog',
    file: 'blog',
    eyebrow: 'Devlog',
    title: 'How the site gets built.',
    subtitle: 'Notes on the design language, the physics, the rewrites, and what each one cost.',
  },
  {
    path: '/news',
    file: 'news',
    eyebrow: 'News',
    title: 'What changed, and when.',
    subtitle: 'Releases, write-ups and announcements from RMH Studios.',
  },
  {
    path: '/rmhladder',
    file: 'rmhladder',
    eyebrow: 'RMH Ladder',
    title: 'Verified early-career jobs.',
    subtitle:
      'Internships and new-grad roles, pulled from company boards, checked for whether they are still open.',
  },
  {
    path: '/library',
    file: 'library',
    eyebrow: 'Library',
    title: 'The reading room.',
    subtitle: 'Books, albums and collections, kept in one place and readable in the browser.',
  },
  {
    path: '/daily',
    file: 'daily',
    eyebrow: 'Daily puzzles',
    title: 'A new set every day.',
    subtitle: 'One run at each, a shared board, and a streak worth keeping.',
  },
  {
    path: '/market',
    file: 'market',
    eyebrow: 'Marketplace',
    title: 'Themes, cosmetics and cards.',
    subtitle: 'Bought with coins you earned, made by people who play here.',
  },
  {
    // `/pricing` is a redirect into this page's default tab now, so the card
    // answers for `/store` — which otherwise fell through to `default.png`.
    path: '/store',
    file: 'pricing',
    eyebrow: 'Membership',
    title: 'Everything, or everything plus.',
    subtitle: 'The whole platform is free. Membership adds coins, cosmetics and the developer API.',
  },
  {
    path: '/leaderboard',
    file: 'leaderboard',
    eyebrow: 'Leaderboards',
    title: 'Who is actually winning.',
    subtitle: 'Ranked ladders, arcade boards and daily streaks, across every game on the site.',
  },
  {
    path: '/rmh-capital',
    file: 'rmh-capital',
    eyebrow: 'RMH Capital',
    title: 'RMH Capital',
    subtitle: 'The investment arm of RMH Studios.',
  },
  {
    path: '/rmh-pmc',
    file: 'rmh-pmc',
    eyebrow: 'RMH PMC',
    title: 'RMH PMC',
    subtitle: 'Operations, intelligence and capability.',
  },
  {
    path: '/ventures',
    file: 'ventures',
    eyebrow: 'Ventures',
    title: 'The rest of the portfolio.',
    subtitle: 'What RMH Studios runs beyond the platform itself.',
  },
];

/** Legal pages share one card — they are the same kind of page. */
const LEGAL_PATHS = ['/terms', '/privacy', '/cookies', '/copyright'];
for (const path of LEGAL_PATHS) {
  STATIC_CARDS.push({
    path,
    file: 'legal',
    eyebrow: 'Legal',
    title: 'Terms, privacy and policies.',
    subtitle: 'How RMH Studios handles your account, your data and your content.',
  });
}

/** Cheap lookup index, longest path first so the most specific match wins. */
const BY_LENGTH = [...STATIC_CARDS].sort((a, b) => b.path.length - a.path.length);

/**
 * The static card a path should share, or null when nothing matches.
 *
 * `/` is exact-matched: without that, every path on the site would "match" the
 * home card by prefix and nothing else would ever be reached.
 */
export function staticCardFor(path: string): StaticCard | null {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (clean === '/') return BY_LENGTH.find((c) => c.path === '/') ?? null;
  return (
    BY_LENGTH.find((c) => c.path !== '/' && (clean === c.path || clean.startsWith(`${c.path}/`))) ??
    null
  );
}

/** Where the rendered PNG for a card lives. */
export function staticCardImage(card: StaticCard): string {
  return `/images/og/${card.file}.png`;
}
