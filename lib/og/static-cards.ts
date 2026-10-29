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
  /**
   * The section's own picture, a `public/`-relative path, drawn beside the text. Only for a section that belongs to
   * one thing with key art (a game, an app, the TF2 logo): a section about nothing in particular has no picture to
   * show, and a stock one would be worse than the empty pane.
   */
  art?: string;
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
      { value: '25', label: 'games', lead: true },
      { value: '14', label: 'apps' },
      { value: '16', label: 'languages' },
    ],
  },
  {
    path: '/games',
    file: 'games',
    eyebrow: 'Games',
    title: 'Games, in the browser.',
    subtitle:
      'Party games, puzzles, roguelikes and 3D — multiplayer where it matters, no download anywhere.',
    stats: [{ value: '25', label: 'to play', lead: true }],
  },
  {
    path: '/apps',
    file: 'apps',
    eyebrow: 'Apps',
    title: 'Tools that live here.',
    subtitle:
      'Watch parties, music, typing, study, code, ladders — full apps, not demos, all on one account.',
    stats: [{ value: '14', label: 'apps', lead: true }],
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
    path: '/rmh-datacenter',
    file: 'rmh-datacenter',
    eyebrow: 'RMH Datacenter',
    title: 'RMH Datacenter',
    subtitle: 'Six campuses, 148 MW, one backbone.',
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

  // ── Sections that used to unfurl as the home card ───────────────────────────────────────────────────────────
  // Every entry below answers for a page that had no card of its own, so a link to `/tf2/workshop` and a link to
  // `/communities` and a link to the home page were the same picture. Copy rules (design.md §1): short, literal, the
  // eyebrow says what kind of page it is, the title is a sentence and not a slogan, the subtitle is one line.
  { path: '/communities', file: 'communities', eyebrow: 'Communities', title: 'Find your people.', subtitle: 'Public communities with their own spaces, events and conversation.' },
  { path: '/groups', file: 'groups', eyebrow: 'Group chats', title: 'Talk it through.', subtitle: 'Start a group chat with friends, or drop into a public room.' },
  { path: '/create/builds', file: 'user-builds', eyebrow: 'User builds', title: 'Made here, by members.', subtitle: 'Games and apps published by the community.' },
  { path: '/create/personas', file: 'personas', eyebrow: 'AI personas', title: 'Characters you can talk to.', subtitle: 'Create a persona, give it a voice, and chat across the site.' },
  { path: '/create', file: 'create', eyebrow: 'Create', title: 'Make something here.', subtitle: 'Shareable pages, community builds and AI personas, in one place.' },
  { path: '/user-builds', file: 'user-builds', eyebrow: 'User builds', title: 'Made here, by members.', subtitle: 'Games and apps published by the community.' },
  { path: '/builds', file: 'user-builds', eyebrow: 'User builds', title: 'Made here, by members.', subtitle: 'Games and apps published by the community.' },
  { path: '/developer', file: 'developer', eyebrow: 'Developer API', title: 'Build on RMH Studios.', subtitle: 'Scoped API keys, a documented REST API, webhooks and quotas.' },
  { path: '/help', file: 'help', eyebrow: 'Help', title: 'Ask the concierge.', subtitle: 'Games, apps, coins, settings, and where to find them.' },
  { path: '/changelog', file: 'changelog', eyebrow: 'Changelog', title: 'Every fix, as it ships.', subtitle: 'New features, fixes and improvements on RMH Studios.' },
  { path: '/roadmap', file: 'roadmap', eyebrow: 'Roadmap', title: 'What is coming next.', subtitle: 'Plus a public request board: vote on what you want and read the replies.' },
  { path: '/jams', file: 'jams', eyebrow: 'Game jams', title: 'One secret theme. One build.', subtitle: 'Ship it as a User Build and get rated by the community.' },
  { path: '/rings', file: 'rings', eyebrow: 'Webrings', title: 'Small circles, on purpose.', subtitle: 'Member-run rings, with previous and next on every profile.' },
  { path: '/services/cars', file: 'cars', eyebrow: 'RMH Cars', title: 'The whole fleet, in 3D.', subtitle: 'Every model behind RMH Rideshare, turnable.' },
  { path: '/services/fashion', file: 'fashion', eyebrow: 'RMH Fashion', title: 'A wardrobe for a figure you design.', subtitle: 'Dress it in 3D.' },
  { path: '/services/rebar-rutabaga', file: 'rebar-rutabaga', eyebrow: 'Restaurant', title: 'Rebar & Rutabaga.', subtitle: 'Nine spherified courses in a decommissioned Göteborg rebar foundry.' },
  { path: '/services', file: 'services', eyebrow: 'Services', title: 'Housing, jobs, rides and more.', subtitle: 'RMHHomes, RMHLadder, Rideshare, RMH Cars and RMH Fashion.' },
  { path: '/homes/rent-split', file: 'rent-split', eyebrow: 'RMHHomes', title: 'Split the rent fairly.', subtitle: 'By room size and features, with every number explained.' },
  { path: '/homes', file: 'homes', eyebrow: 'RMHHomes', title: 'Rentals and houses, posted by members.', subtitle: 'Search, map every result, save favorites, message the poster.' },
  { path: '/rideshare', file: 'rideshare', eyebrow: 'RMH Rideshare', title: 'Request a ride, or drive.', subtitle: 'RMH-X, XL, Comfort and more, mapped on OpenStreetMap.' },
  { path: '/tf2/play', file: 'tf2-play', eyebrow: 'Team Fortress 2', title: 'Play TF2 in your browser.', subtitle: 'All nine classes, online or against bots.' },
  { path: '/tf2/workshop', file: 'tf2-workshop', eyebrow: 'TF2 Workshop', title: 'Community HUDs and loadouts.', subtitle: 'Preview, like, and copy them into your own.' },
  { path: '/tf2/loadout', file: 'tf2-loadout', eyebrow: 'TF2 Loadout Builder', title: 'Plan every class.', subtitle: 'Weapons, cosmetics, paints, unusuals and taunts.' },
  { path: '/tf2/hud-editor', file: 'tf2-hud-editor', eyebrow: 'TF2 HUD Editor', title: 'Build a HUD with a live preview.', subtitle: 'Then download it ready to install.' },
  { path: '/tf2', file: 'tf2', eyebrow: 'Team Fortress 2', title: 'TF2, in your browser.', subtitle: 'Play it, edit a HUD, build a loadout, share them in the workshop.' },
  { path: '/predictions', file: 'predictions', eyebrow: 'Predictions', title: 'Back your call.', subtitle: 'Prediction markets, plus casino games, played with RMH Coins.' },
  { path: '/wager', file: 'wager', eyebrow: 'Wager matches', title: 'Put coins on it.', subtitle: 'A staked head-to-head match on any skill game.' },
  { path: '/tournaments', file: 'tournaments', eyebrow: 'Tournaments', title: 'Brackets, with coin prizes.', subtitle: 'Compete across the RMH Studios games.' },
  { path: '/ranked', file: 'ranked', eyebrow: 'Ranked', title: 'Climb the ladder.', subtitle: 'Standings, your rating, and the seasons in progress.' },
  { path: '/speedruns', file: 'speedruns', eyebrow: 'Speedruns', title: 'Verified by replay.', subtitle: 'Every run is re-simulated from its own inputs.' },
  { path: '/today', file: 'today', eyebrow: 'Today', title: 'The last 24 hours.', subtitle: 'Top posts, new builds, news and what is trending.' },
  { path: '/qotd', file: 'qotd', eyebrow: 'Question of the day', title: 'One question. Everyone answers.', subtitle: 'Read the answers, or add your own.' },
  { path: '/photo-of-the-day', file: 'photo-of-the-day', eyebrow: 'Photo of the day', title: 'Nominate. Vote. Feature.', subtitle: 'One image a day, chosen by members.' },
  { path: '/game-night', file: 'game-night', eyebrow: 'Game night', title: 'A weekly lobby of party games.', subtitle: 'See what is on now, and what is next.' },
  { path: '/schedule', file: 'schedule', eyebrow: 'Schedule', title: 'Everything on this week.', subtitle: 'Puzzle drops, tournaments, premieres and events.' },
  { path: '/when', file: 'when', eyebrow: 'Find a time', title: 'Everyone paints when they are free.', subtitle: 'In their own timezone. The best slot rises to the top.' },
  { path: '/canvas', file: 'canvas', eyebrow: 'Community canvas', title: 'One pixel at a time.', subtitle: 'A shared canvas, with a timelapse when the event ends.' },
  { path: '/museum', file: 'museum', eyebrow: 'Site museum', title: 'Every era of RMH Studios.', subtitle: 'A timeline, with screenshots and what changed in each.' },
  { path: '/emoji-packs', file: 'emoji-packs', eyebrow: 'Emoji & stickers', title: 'Packs made by the community.', subtitle: 'Install the ones you like, or build your own.' },
  { path: '/study', file: 'study', eyebrow: 'RMHStudy', title: 'Flashcards that stick.', subtitle: 'Spaced repetition, public decks, and synced study rooms.', art: '/images/games/rmhstudy.webp' },
  { path: '/slice-it', file: 'slice-it', eyebrow: 'Slice It!', title: 'Upload a track. Get a chart.', subtitle: 'Then race up to eight players.', art: '/images/games/slice_it.webp' },
  { path: '/rmhbox', file: 'rmhbox', eyebrow: 'RMHbox', title: 'Every minigame, in one lobby.', subtitle: 'Leaderboards and match history for each.', art: '/images/games/rmhbox.webp' },
  { path: '/rmhcalculator', file: 'rmhcalculator', eyebrow: 'RMHCalculator', title: 'Graphs, computed by AI.', subtitle: 'A graphing and scientific calculator.' },
  { path: '/dunesday', file: 'dunesday', eyebrow: 'Dunesday', title: 'An MCU and Dune marathon.', subtitle: 'Planned night by night, before Doomsday.' },
  { path: '/design', file: 'design', eyebrow: 'Design', title: 'Spatial minimalism.', subtitle: 'Simple color, editorial hierarchy, purposeful motion.' },
  { path: '/breaches', file: 'breaches', eyebrow: 'Breaches', title: 'Our public incident log.', subtitle: 'What happened, how, and why deleting the line did not undo it.' },
  { path: '/adaptive-intelligence', file: 'adaptive-intelligence', eyebrow: 'Adaptive Intelligence', title: 'Adaptive Intelligence.', subtitle: 'An RMH Studios programme.' },
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

/**
 * Where a card's image lives.
 *
 * Only `default` is a committed PNG now: the site-wide card has to exist as a plain file, because `__root.tsx`
 * advertises it, the legacy `/og.png` aliases it, and it is what every failure falls back to. Every other section
 * card is rendered on request by `/api/og/section/$file` (`app/routes/api/og/section/$file.ts`), so the figures on
 * it are read from the catalog when it is drawn and a new section is one entry here, with no PNG to regenerate and
 * commit. (The older section PNGs are still on disk: a link shared before this change still points at them.)
 */
export function staticCardImage(card: StaticCard): string {
  return card.file === 'default' ? '/images/og/default.png' : `/api/og/section/${card.file}`;
}
