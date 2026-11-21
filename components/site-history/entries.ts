/**
 * The entries on /site-history: the commits that changed what the site is.
 *
 * Picked by hand from the full git history (5,400+ commits from 2026-01-27 on). Every homepage and feed redesign is
 * here, plus the first commit of each game and app that still ships and the platform changes a visitor would notice.
 * Each entry names its commit, so the claim can be checked against the code.
 *
 * Pictures live in public/images/site-history/. `shot` names a pair, `<shot>-desktop.webp` (1440x900, a 1280x800
 * viewport) and `<shot>-mobile.webp` (585x1266, a 390x844 viewport). The `era-*` pairs were taken from that commit
 * built locally against a seeded database. The `live-*` pairs are the page as it is now on rmhstudios.com, because
 * an old build of a game shows less than the game does today. `live` is the same-origin path the "Open here" frame
 * loads.
 *
 * The strings are written out as t() calls (not keys built at runtime) so i18next-parser finds every one.
 */
import type { TFunction } from 'i18next';

export type HistoryKind = 'home' | 'game' | 'app' | 'platform';

export interface HistoryEntry {
  id: string;
  /** ISO date of the commit, YYYY-MM-DD. */
  date: string;
  kind: HistoryKind;
  /** Short hash on main. */
  commit: string;
  /** Pull request number, when the commit came from one. */
  pr?: number;
  /** Picture pair in public/images/site-history/, without the `-desktop.webp` / `-mobile.webp` suffix. */
  shot?: string;
  /**
   * A third view with the era's navigator open: `<shot>-alt-desktop.webp` and `<shot>-alt-mobile.webp` when this is
   * 'both', only the phone picture when it is 'mobile'.
   */
  alt?: 'both' | 'mobile';
  /** What the pictures show, when they show the page today rather than at the commit. */
  shotIsCurrent?: boolean;
  /** Same-origin path to load in the frame. */
  live?: string;
  title: string;
  body: string;
}

export const REPO_URL = 'https://github.com/stickms/rmhstudios.com';

export function historyEntries(t: TFunction<'site-history'>): HistoryEntry[] {
  return [
    {
      id: 'hyperpop-landing',
      date: '2026-01-29',
      kind: 'home',
      commit: '10d99a3c9',
      shot: 'era-2026-01-hyperpop',
      title: t('e.hyperpop-landing.title', {
        defaultValue: 'The first homepage',
      }),
      body: t('e.hyperpop-landing.body', {
        defaultValue:
          'Two days after the first commit, rmhstudios.com was a Next.js landing page in a hyperpop theme: glowing colour blobs, particles, corner brackets and a large "RMH STUDIOS" over "Crafting Digital Worlds". Its sections were content, projects and merchandise.',
      }),
    },
    {
      id: 'slice-it',
      date: '2026-02-18',
      kind: 'game',
      commit: '113ee1af4',
      shot: 'live-slice-it',
      shotIsCurrent: true,
      live: '/slice-it',
      title: t('e.slice-it.title', {
        defaultValue: 'Slice It, the first game',
      }),
      body: t('e.slice-it.body', {
        defaultValue:
          'After a three-week gap the studio came back with a game. Slice It began as a rhythm game with a leaderboard, and the same day brought House Always Wins, Laundry Sort and an arcade page to hold them.',
      }),
    },
    {
      id: 'house-always-wins',
      date: '2026-02-18',
      kind: 'game',
      commit: '7e1c80974',
      shot: 'live-house-always-wins',
      shotIsCurrent: true,
      live: '/house-always-wins',
      title: t('e.house-always-wins.title', {
        defaultValue: 'House Always Wins',
      }),
      body: t('e.house-always-wins.body', {
        defaultValue:
          'A dark casino metroidvania, drawn on a 2D canvas, with a lobby, a dealer, security, dialogue and a debt system. It was the first game with its own tile on the homepage.',
      }),
    },
    {
      id: 'laundry-sort',
      date: '2026-02-18',
      kind: 'game',
      commit: 'dd667d44e',
      shot: 'live-laundry-sort',
      shotIsCurrent: true,
      live: '/laundry-sort',
      title: t('e.laundry-sort.title', {
        defaultValue: 'Laundry Sort',
      }),
      body: t('e.laundry-sort.body', {
        defaultValue:
          'A quick sorting game. In July it was rebuilt as a soft-body cloth race, and in October it gained a daily basket.',
      }),
    },
    {
      id: 'neon-driftway',
      date: '2026-02-20',
      kind: 'game',
      commit: '9125c8cc8',
      shot: 'live-neon-driftway',
      shotIsCurrent: true,
      live: '/neon-driftway',
      title: t('e.neon-driftway.title', {
        defaultValue: 'Neon Driftway',
      }),
      body: t('e.neon-driftway.body', {
        defaultValue:
          'An endless highway racer: three levels, boost pads, and new levels that unlock as you finish the old ones.',
      }),
    },
    {
      id: 'temple-of-joy',
      date: '2026-02-20',
      kind: 'game',
      commit: '28fb469fb',
      shot: 'live-temple-of-joy',
      shotIsCurrent: true,
      live: '/temple-of-joy',
      title: t('e.temple-of-joy.title', {
        defaultValue: 'Temple of Joy',
      }),
      body: t('e.temple-of-joy.body', {
        defaultValue:
          'An idle game that started as a design document. It has grown events, achievements and a global multiplier, and in August a field of liquid globes you can buy.',
      }),
    },
    {
      id: 'studio-home',
      date: '2026-02-22',
      kind: 'home',
      commit: 'aa79a37ae',
      shot: 'era-2026-02-studio-home',
      title: t('e.studio-home.title', {
        defaultValue: 'A studio site with games and apps',
      }),
      body: t('e.studio-home.body', {
        defaultValue:
          'Games and apps got their own pages and a navigation bar across the top: Home, Games, Apps, Roadmap and Blog in monospace capitals on navy, with the active tab in cyan and an outlined Sign In.',
      }),
    },
    {
      id: 'rmhbox',
      date: '2026-02-22',
      kind: 'game',
      commit: '6d2ab2035',
      shot: 'live-rmhbox',
      shotIsCurrent: true,
      live: '/games/rmhbox',
      title: t('e.rmhbox.title', {
        defaultValue: 'RMHBox, the party game platform',
      }),
      body: t('e.rmhbox.body', {
        defaultValue:
          'Phones as controllers, one shared screen and a rotating set of minigames. RMHBox became the most tested part of the site; its phase tests are still the mission-critical suite.',
      }),
    },
    {
      id: 'synapse-storm',
      date: '2026-02-22',
      kind: 'game',
      commit: '9fdbe4292',
      shot: 'live-synapse-storm',
      shotIsCurrent: true,
      live: '/synapse-storm',
      title: t('e.synapse-storm.title', {
        defaultValue: 'Synapse Storm',
      }),
      body: t('e.synapse-storm.body', {
        defaultValue:
          'A storm of micro-challenges to juggle, which got multiplayer lobbies and reconnection three days later.',
      }),
    },
    {
      id: 'rmhcode',
      date: '2026-02-22',
      kind: 'app',
      commit: '8ec3449d6',
      shot: 'live-rmhcode',
      shotIsCurrent: true,
      live: '/rmhcode',
      title: t('e.rmhcode.title', {
        defaultValue: 'RMHCode',
      }),
      body: t('e.rmhcode.body', {
        defaultValue:
          'An AI coding assistant that publishes what you build to User Builds, and later a command-line tool of the same name.',
      }),
    },
    {
      id: 'minimal',
      date: '2026-02-25',
      kind: 'home',
      commit: '1984c7f21',
      shot: 'era-2026-02-minimal',
      title: t('e.minimal.title', {
        defaultValue: 'Clean and minimal, in lavender',
      }),
      body: t('e.minimal.body', {
        defaultValue:
          'Three days later the same layout was recoloured: charcoal with a soft lavender accent, "RMH" in white and "STUDIOS" in purple, solid purple buttons, sentence-case navigation and a palette switcher in the header.',
      }),
    },
    {
      id: 'rmhtube',
      date: '2026-02-25',
      kind: 'app',
      commit: '6f5894476',
      shot: 'live-rmhtube',
      shotIsCurrent: true,
      live: '/games/rmhtube',
      title: t('e.rmhtube.title', {
        defaultValue: 'RMHTube, RMHType and RMHStudy',
      }),
      body: t('e.rmhtube.body', {
        defaultValue:
          'Three apps arrived in one week: RMHTube for watching videos together in a room, RMHType for typing races and RMHStudy for studying together on synced Pomodoro timers, which later gained spaced-repetition flashcards and an AI tutor.',
      }),
    },
    {
      id: 'void-breaker',
      date: '2026-02-27',
      kind: 'game',
      commit: 'fbc96e33e',
      shot: 'live-void-breaker',
      shotIsCurrent: true,
      live: '/void-breaker',
      title: t('e.void-breaker.title', {
        defaultValue: 'Void Breaker',
      }),
      body: t('e.void-breaker.body', {
        defaultValue:
          'An arena shooter in obsidian and gold. In November it became the first game to ship as an island, loading its own code only when you open it.',
      }),
    },
    {
      id: 'altair',
      date: '2026-02-27',
      kind: 'game',
      commit: '1ba4f0949',
      shot: 'live-altair',
      shotIsCurrent: true,
      live: '/altair',
      title: t('e.altair.title', {
        defaultValue: 'Altair',
      }),
      body: t('e.altair.body', {
        defaultValue:
          'A narrative extraction thriller on a deep-space mining rig, with its own multiplayer server, and one of the first official builds the feed promoted.',
      }),
    },
    {
      id: 'velum-versecraft',
      date: '2026-02-28',
      kind: 'game',
      commit: '3a9534f46',
      shot: 'live-velum2099',
      shotIsCurrent: true,
      live: '/velum2099',
      title: t('e.velum-versecraft.title', {
        defaultValue: 'Velum 2099 and Versecraft',
      }),
      body: t('e.velum-versecraft.body', {
        defaultValue:
          'A cyberpunk driving game and a visual-novel word game with saved progress, both on the same day.',
      }),
    },
    {
      id: 'rmhark',
      date: '2026-02-28',
      kind: 'home',
      commit: '56fc769b3',
      title: t('e.rmhark.title', {
        defaultValue: 'RMHarks: the site gets a feed',
      }),
      body: t('e.rmhark.body', {
        defaultValue:
          'Short posts, called RMHarks, with a composer, likes, reposts, comments and a following tab. Polls and GIFs followed two days later. From here on the feed is the centre of the site.',
      }),
    },
    {
      id: 'news',
      date: '2026-02-28',
      kind: 'app',
      commit: '449063aca',
      shot: 'live-news',
      shotIsCurrent: true,
      live: '/news',
      title: t('e.news.title', {
        defaultValue: 'RMH News',
      }),
      body: t('e.news.body', {
        defaultValue: 'A news section, now fed by a pipeline that writes, sources and illustrates the stories.',
      }),
    },
    {
      id: 'kowloon-knockout',
      date: '2026-03-01',
      kind: 'game',
      commit: 'c5c18ac6f',
      shot: 'live-kowloon-knockout',
      shotIsCurrent: true,
      live: '/kowloon-knockout',
      title: t('e.kowloon-knockout.title', {
        defaultValue: 'Kowloon Knockout',
      }),
      body: t('e.kowloon-knockout.body', {
        defaultValue:
          'A fighting game. In November every menu was redrawn phone-first, with a neon HUD and touch controls.',
      }),
    },
    {
      id: 'dream-rift',
      date: '2026-03-02',
      kind: 'game',
      commit: '69ee178ae',
      shot: 'live-dream-rift',
      shotIsCurrent: true,
      live: '/dream-rift',
      title: t('e.dream-rift.title', {
        defaultValue: 'Dream Rift',
      }),
      body: t('e.dream-rift.body', {
        defaultValue: 'A bullet-hell shooter on PixiJS, with radial and aimed patterns that scale with difficulty.',
      }),
    },
    {
      id: 'rmhmusic',
      date: '2026-03-02',
      kind: 'app',
      commit: '33fd1504b',
      shot: 'live-rmhmusic',
      shotIsCurrent: true,
      live: '/games/rmhmusic',
      title: t('e.rmhmusic.title', {
        defaultValue: 'RMHMusic',
      }),
      body: t('e.rmhmusic.body', {
        defaultValue:
          'A music app. By November it had realistic instruments, sight reading, a tuner, sheet music and tab play-along, voice as an instrument and a daily leaderboard.',
      }),
    },
    {
      id: 'coins',
      date: '2026-03-05',
      kind: 'platform',
      commit: '3d3a31f65',
      shot: 'live-wallet',
      shotIsCurrent: true,
      live: '/wallet',
      title: t('e.coins.title', {
        defaultValue: 'RMH Coins',
      }),
      body: t('e.coins.body', {
        defaultValue:
          'A coin economy, launched with a Plinko game, a coin shop, a profile pet and /@handle profile addresses.',
      }),
    },
    {
      id: 'feed-home',
      date: '2026-03-05',
      kind: 'home',
      commit: '74f665f4b',
      shot: 'era-2026-03-feed-home',
      title: t('e.feed-home.title', {
        defaultValue: 'The feed becomes the homepage',
      }),
      body: t('e.feed-home.body', {
        defaultValue:
          'Three columns on charcoal with purple accents: a sidebar on the left, the feed in the middle, and cards for builds, recommended users and the blog on the right. The same day, new posts started arriving live over server-sent events.',
      }),
    },
    {
      id: 'tanstack',
      date: '2026-03-06',
      kind: 'platform',
      commit: 'be48ea332',
      shot: 'era-2026-03-tanstack',
      title: t('e.tanstack.title', {
        defaultValue: 'From Next.js to TanStack Start',
      }),
      body: t('e.tanstack.body', {
        defaultValue:
          'The whole site moved from Next.js to TanStack Start on Vite. The picture is the feed a week later: almost the same, with a shorter sidebar and official builds leading the right column.',
      }),
    },
    {
      id: 'strategies',
      date: '2026-03-22',
      kind: 'app',
      commit: 'fa07456bb',
      shot: 'live-strategies',
      shotIsCurrent: true,
      live: '/strategies',
      title: t('e.strategies.title', {
        defaultValue: 'RMH Strategies',
      }),
      body: t('e.strategies.body', {
        defaultValue:
          'The Doctrine Engine: a coalition command centre with daily puzzles, a safehouse and reputation. It was the last big change before the studio paused for April and May.',
      }),
    },
    {
      id: 'vibe-home',
      date: '2026-06-12',
      kind: 'home',
      commit: 'fc1b35f34',
      shot: 'era-2026-06-vibe-home',
      title: t('e.vibe-home.title', {
        defaultValue: 'The anything platform',
      }),
      body: t('e.vibe-home.body', {
        defaultValue:
          'Work resumed with a homepage that was one sentence and one field: "The anything platform. Type anything, and we\'ll build it." on black, with a prompt box asking where you wanted to go. It lasted a week.',
      }),
    },
    {
      id: 'pricing',
      date: '2026-06-19',
      kind: 'platform',
      commit: 'd43aadf4d',
      shot: 'live-store',
      shotIsCurrent: true,
      live: '/store',
      title: t('e.pricing.title', {
        defaultValue: 'Memberships',
      }),
      body: t('e.pricing.body', {
        defaultValue:
          'Paid memberships through Stripe, with a Membership link in the navigation. The membership page now lives in the store.',
      }),
    },
    {
      id: 'sidebar-shell',
      date: '2026-06-19',
      kind: 'home',
      commit: '41748c0e0',
      title: t('e.sidebar-shell.title', {
        defaultValue: 'One shell for the whole site',
      }),
      body: t('e.sidebar-shell.body', {
        defaultValue:
          'The feed, builds, library and the other pages moved under one sidebar shell, and synthetic bot users began posting to the feed. The next day the timeline was rebuilt the way large social sites do it: keyset pagination, stored counters and targeted live updates.',
      }),
    },
    {
      id: 'developer-api',
      date: '2026-06-21',
      kind: 'platform',
      commit: '17e54b440',
      shot: 'live-developer',
      shotIsCurrent: true,
      live: '/developer',
      title: t('e.developer-api.title', {
        defaultValue: 'A developer API',
      }),
      body: t('e.developer-api.body', {
        defaultValue:
          'A REST API for members, with scoped keys. It now has webhooks, quotas and its own documentation.',
      }),
    },
    {
      id: 'communities',
      date: '2026-06-21',
      kind: 'platform',
      commit: 'd25effa9e',
      shot: 'live-communities',
      shotIsCurrent: true,
      live: '/communities',
      title: t('e.communities.title', {
        defaultValue: 'Communities',
      }),
      body: t('e.communities.body', {
        defaultValue:
          'Topic communities with their own feeds and members. The same day added quote reposts, followers-only posts, scheduled polls and pinned posts.',
      }),
    },
    {
      id: 'explore',
      date: '2026-06-21',
      kind: 'platform',
      commit: '454f53c3a',
      shot: 'live-explore',
      shotIsCurrent: true,
      live: '/explore',
      title: t('e.explore.title', {
        defaultValue: 'Explore, hashtags and For You',
      }),
      body: t('e.explore.body', {
        defaultValue:
          'An Explore page, hashtag pages, a way to ask the feed a question, and a personalised For You ranking.',
      }),
    },
    {
      id: 'i18n',
      date: '2026-06-22',
      kind: 'platform',
      commit: '5a8fd4d75',
      title: t('e.i18n.title', {
        defaultValue: 'The site in other languages',
      }),
      body: t('e.i18n.body-nine', {
        defaultValue:
          "The core of the site was translated, and posts could be translated into the reader's language. It ships in nine languages today, including Arabic laid out right to left.",
      }),
    },
    {
      id: 'creator-studio',
      date: '2026-06-23',
      kind: 'app',
      commit: '0c4af5cb3',
      shot: 'live-creator-studio',
      shotIsCurrent: true,
      live: '/creator-studio',
      title: t('e.creator-studio.title', {
        defaultValue: 'Creator Studio',
      }),
      body: t('e.creator-studio.body', {
        defaultValue: 'One place to make and manage what you publish on the site. Clans were removed the same day.',
      }),
    },
    {
      id: 'black-shell',
      date: '2026-06-28',
      kind: 'home',
      commit: '15bcfeab6',
      shot: 'era-2026-06-black-shell',
      title: t('e.black-shell.title', {
        defaultValue: 'White on black',
      }),
      body: t('e.black-shell.body', {
        defaultValue:
          'The shell went fully monochrome: a serif "RMHStudios" wordmark, For You and Following tabs over the feed, and bordered cards on the right. The library and blog were merged into one section.',
      }),
    },
    {
      id: 'passkeys',
      date: '2026-07-02',
      kind: 'platform',
      commit: '6ab36a0a0',
      shot: 'live-login',
      shotIsCurrent: true,
      live: '/login',
      title: t('e.passkeys.title', {
        defaultValue: 'Passkeys',
      }),
      body: t('e.passkeys.body', {
        defaultValue: 'Sign-in with a passkey, alongside Discord and GitHub.',
      }),
    },
    {
      id: 'homes',
      date: '2026-07-07',
      kind: 'app',
      commit: 'ae400fc81',
      shot: 'live-homes',
      shotIsCurrent: true,
      live: '/homes',
      title: t('e.homes.title', {
        defaultValue: 'RMHHomes',
      }),
      body: t('e.homes.body', {
        defaultValue:
          'A housing marketplace with member posts and real listings on one map, redesigned the same week to match the rest of the site.',
      }),
    },
    {
      id: 'rmhladder',
      date: '2026-07-08',
      kind: 'app',
      commit: '63d6015f9',
      shot: 'live-rmhladder',
      shotIsCurrent: true,
      live: '/rmhladder',
      title: t('e.rmhladder.title', {
        defaultValue: 'RMHLadder',
      }),
      body: t('e.rmhladder.body', {
        defaultValue:
          'Internships, new-grad programs and early-career roles from official sources, with a pipeline to track your applications and alerts.',
      }),
    },
    {
      id: 'apple-shell',
      date: '2026-07-11',
      kind: 'home',
      commit: 'e8c1e4b71',
      shot: 'era-2026-07-apple-shell',
      title: t('e.apple-shell.title', {
        defaultValue: 'Softer, with a violet accent',
      }),
      body: t('e.apple-shell.body', {
        defaultValue:
          'An Apple-style pass over the same black layout: rounder cards and pills, larger navigation, a violet accent on the active item and buttons, and press feedback on every post action.',
      }),
    },
    {
      id: 'liquid-glass',
      date: '2026-07-21',
      kind: 'home',
      commit: '6fde0b5e2',
      shot: 'era-2026-07-liquid-glass',
      title: t('e.liquid-glass.title', {
        defaultValue: 'Liquid glass',
      }),
      body: t('e.liquid-glass.body', {
        defaultValue:
          'A week after the liquid-glass foundation landed, the shell itself floated: a glass rail for navigation, the feed header as a capsule, glass panels on the right and aurora colour in the gutters, on deep navy with a sky-blue accent.',
      }),
    },
    {
      id: 'calculator',
      date: '2026-07-23',
      kind: 'app',
      commit: '53857a145',
      shot: 'live-rmhcalculator',
      shotIsCurrent: true,
      live: '/games/rmhcalculator',
      title: t('e.calculator.title', {
        defaultValue: 'RMHCalculator',
      }),
      body: t('e.calculator.body', {
        defaultValue: 'A graphing and scientific calculator that you can also ask in words.',
      }),
    },
    {
      id: 'radial',
      date: '2026-07-24',
      kind: 'home',
      commit: '426d1d14e',
      shot: 'era-2026-07-radial',
      alt: 'both',
      title: t('e.radial.title', {
        defaultValue: 'The radial interface',
      }),
      body: t('e.radial.body', {
        defaultValue:
          'After a day as an ultra-minimal site, the front end was rewritten around a radial dial. By the end of that day it was a light page with a lavender wash, one column of white cards with the composer inline, and an indigo orb at the bottom that opened a frosted ring of every section.',
      }),
    },
    {
      id: 'liquid-globe',
      date: '2026-08-01',
      kind: 'home',
      commit: 'b5bffe095',
      shot: 'era-2026-08-liquid-globe',
      alt: 'both',
      title: t('e.liquid-globe.title', {
        defaultValue: 'The liquid globe',
      }),
      body: t('e.liquid-globe.body', {
        defaultValue:
          'The radial dial became a globe you turn to choose where to go, and the next day the whole site was drawn in the same glass material, in strict black and white, rippling when you poked it. Some form of the globe has navigated the site ever since.',
      }),
    },
    {
      id: 'gabriels-horn',
      date: '2026-08-02',
      kind: 'game',
      commit: '563feb8c6',
      shot: 'live-gabriels-horn',
      shotIsCurrent: true,
      live: '/gabriels-horn',
      title: t('e.gabriels-horn.title', {
        defaultValue: "Gabriel's Horn",
      }),
      body: t('e.gabriels-horn.body', {
        defaultValue: 'A blind-dice bluffing card game, multiplayer from the start.',
      }),
    },
    {
      id: 'nightrail',
      date: '2026-08-04',
      kind: 'game',
      commit: 'f3cb43d22',
      shot: 'live-nightrail',
      shotIsCurrent: true,
      live: '/nightrail',
      title: t('e.nightrail.title', {
        defaultValue: 'Nightrail',
      }),
      body: t('e.nightrail.body', {
        defaultValue: 'An on-rails trick racer built on momentum.',
      }),
    },
    {
      id: 'ssr-feed',
      date: '2026-08-12',
      kind: 'platform',
      commit: 'd1224826a',
      title: t('e.ssr-feed.title', {
        defaultValue: 'The feed renders on the server',
      }),
      body: t('e.ssr-feed.body', {
        defaultValue:
          'The first screen of the feed arrived as HTML instead of waiting for scripts, and the shell stopped loading parts it was not showing.',
      }),
    },
    {
      id: 'globeset',
      date: '2026-09-21',
      kind: 'game',
      commit: '4f19b808c',
      shot: 'live-daily',
      shotIsCurrent: true,
      live: '/daily',
      title: t('e.globeset.title', {
        defaultValue: 'GlobeSet and the daily puzzles',
      }),
      body: t('e.globeset.body', {
        defaultValue:
          'A daily puzzle played on the liquid globe, with races and records. It sits with the other daily puzzles today.',
      }),
    },
    {
      id: 'dunesday',
      date: '2026-10-06',
      kind: 'app',
      commit: 'd183fffab',
      shot: 'live-dunesday',
      shotIsCurrent: true,
      live: '/dunesday',
      title: t('e.dunesday.title', {
        defaultValue: 'Dunesday',
      }),
      body: t('e.dunesday.body', {
        defaultValue:
          'A planner for a Marvel and Dune film marathon, drawn in Frutiger Aero, with a calendar subscription and an RSS feed.',
      }),
    },
    {
      id: 'eversion',
      date: '2026-10-17',
      kind: 'home',
      commit: 'f9cfa9ea0',
      title: t('e.eversion.title', {
        defaultValue: 'The globe eversion',
      }),
      body: t('e.eversion.body', {
        defaultValue:
          'Navigation became an animation: the globe turned itself inside out and the next page arrived inside it. It was on for every visitor for about three weeks.',
      }),
    },
    {
      id: 'plasmatic-jelly',
      date: '2026-10-24',
      kind: 'home',
      commit: '51d801b84',
      shot: 'era-2026-10-plasmatic-jelly',
      alt: 'mobile',
      title: t('e.plasmatic-jelly.title', {
        defaultValue: 'Plasmatic Jelly',
      }),
      body: t('e.plasmatic-jelly.body', {
        defaultValue:
          'Every surface became a thick, glossy slab of shader-drawn glass with lit lavender and pink rims, buttons turned electric blue, and a dark liquid globe sat open in the desktop sidebar. Each slab was its own WebGL canvas.',
      }),
    },
    {
      id: 'mobile-globe',
      date: '2026-10-29',
      kind: 'home',
      commit: 'ce03fa247',
      pr: 1106,
      shot: 'era-2026-10-mobile-globe',
      alt: 'mobile',
      title: t('e.mobile-globe.title', {
        defaultValue: 'A globe in your thumb',
      }),
      body: t('e.mobile-globe.body', {
        defaultValue:
          'On phones the bottom tab bar was replaced by a small docked jelly globe that grew into the full navigator when touched, with a compose pill beside it.',
      }),
    },
    {
      id: 'source-games',
      date: '2026-10-29',
      kind: 'game',
      commit: 'af113c974',
      pr: 1104,
      shot: 'live-portal',
      shotIsCurrent: true,
      live: '/portal',
      title: t('e.source-games.title', {
        defaultValue: 'Source games in the browser',
      }),
      body: t('e.source-games.body', {
        defaultValue:
          'Team Fortress 2, a Half-Life 2 demo and a first slice of Portal, playable in a browser tab. CS:GO followed the next day.',
      }),
    },
    {
      id: 'csgo',
      date: '2026-10-30',
      kind: 'game',
      commit: 'b7938ef65',
      pr: 1118,
      shot: 'live-csgo',
      shotIsCurrent: true,
      live: '/csgo',
      title: t('e.csgo.title', {
        defaultValue: 'CS:GO',
      }),
      body: t('e.csgo.body', {
        defaultValue: 'Rooms, a buy menu, bots with their own play styles, and peer-to-peer online play.',
      }),
    },
    {
      id: 'elections',
      date: '2026-11-02',
      kind: 'app',
      commit: '36eff4f0e',
      pr: 1315,
      shot: 'live-elections',
      shotIsCurrent: true,
      live: '/elections',
      title: t('e.elections.title', {
        defaultValue: 'The election hub',
      }),
      body: t('e.elections.body', {
        defaultValue:
          'Live results, a map, races and a predictor for election night, with AI summaries and a live chat added the same day.',
      }),
    },
    {
      id: 'hearthworks',
      date: '2026-11-04',
      kind: 'game',
      commit: '82d09917f',
      pr: 1393,
      shot: 'live-hearthworks',
      shotIsCurrent: true,
      live: '/hearthworks',
      title: t('e.hearthworks.title', {
        defaultValue: 'Hearthworks',
      }),
      body: t('e.hearthworks.body', {
        defaultValue:
          'Build a town, farm, forage, cook and sell, in isometric or third-person view, with multiplayer sessions and an economy.',
      }),
    },
    {
      id: 'redesign-phases',
      date: '2026-11-09',
      kind: 'platform',
      commit: 'a1eee7155',
      pr: 1530,
      title: t('e.redesign-phases.title', {
        defaultValue: 'The rebuild underneath',
      }),
      body: t('e.redesign-phases.body', {
        defaultValue:
          'Thirty-two phases in three days: typed API contracts, games moved into feature folders, the Go workers ported to Node, one job scheduler, Geist everywhere and the site stylesheet under 40 KB.',
      }),
    },
    {
      id: 'steel',
      date: '2026-11-11',
      kind: 'home',
      commit: 'ac1a438a5',
      pr: 1572,
      shot: 'live-2026-11-steel',
      shotIsCurrent: true,
      live: '/',
      title: t('e.steel.title', {
        defaultValue: 'Steel',
      }),
      body: t('e.steel.body', {
        defaultValue:
          'The design the site has now. A flat, neutral page in one typeface, divided by hairline rules, with a sidebar of words and one chrome globe for navigation. Content hangs on the spine, the thin line down the side of this page. Phase 6 deleted the jelly, the eversion and the WebAssembly behind them.',
      }),
    },
    {
      id: 'wiki',
      date: '2026-11-14',
      kind: 'platform',
      commit: '8f516c5fb',
      pr: 1614,
      title: t('e.wiki.title', {
        defaultValue: 'The wiki on MediaWiki',
      }),
      body: t('e.wiki.body', {
        defaultValue:
          'The wiki moved to MediaWiki, editable in place with your rmhstudios.com account, with an Edit with AI button on every edit page.',
      }),
    },
    {
      id: 'rmhos',
      date: '2026-11-14',
      kind: 'app',
      commit: '6802a1db6',
      pr: 1634,
      shot: 'live-rmhos',
      shotIsCurrent: true,
      live: '/games/rmhos',
      title: t('e.rmhos.title', {
        defaultValue: 'rmhOS',
      }),
      body: t('e.rmhos.body', {
        defaultValue: 'A Linux desktop that runs in the browser, with a stored home folder that follows your account.',
      }),
    },
    {
      id: 'rmh-capital',
      date: '2026-11-14',
      kind: 'app',
      commit: 'dba659612',
      pr: 1616,
      shot: 'live-rmh-capital',
      shotIsCurrent: true,
      live: '/rmh-capital',
      title: t('e.rmh-capital.title', {
        defaultValue: 'RMH Capital',
      }),
      body: t('e.rmh-capital.body', {
        defaultValue:
          'The RMH Capital site, redrawn in chrome on the structure of an advisory bank, with a Deals page.',
      }),
    },
    {
      id: 'psychology',
      date: '2026-11-15',
      kind: 'platform',
      commit: '6c6c75605',
      pr: 1650,
      shot: 'live-psychology',
      shotIsCurrent: true,
      live: '/rmh-research/psychology',
      title: t('e.psychology.title', {
        defaultValue: 'The psychology page',
      }),
      body: t('e.psychology.body', {
        defaultValue:
          'The research behind how the site behaves, who did it, and where you meet it here, including the things the site chooses not to do. It now lives in RMH Research.',
      }),
    },
    {
      id: 'sign-in',
      date: '2026-11-16',
      kind: 'platform',
      commit: '87eec3629',
      pr: 1666,
      title: t('e.sign-in.title', {
        defaultValue: 'More ways to sign in',
      }),
      body: t('e.sign-in.body', {
        defaultValue:
          'Steam, Twitch, Microsoft, GitLab and X sign-in, then account consolidation and email verification, so one person has one account however they arrive.',
      }),
    },
    {
      id: 'rmh-research',
      date: '2026-11-16',
      kind: 'platform',
      commit: 'dffc09114',
      pr: 1669,
      shot: 'live-rmh-research',
      shotIsCurrent: true,
      live: '/rmh-research',
      title: t('e.rmh-research.title', {
        defaultValue: 'RMH Research returns',
      }),
      body: t('e.rmh-research.body', {
        defaultValue:
          'The research section came back as an institute of its own: twelve fields, a searchable archive, author pages and the r-index.',
      }),
    },
  ];
}
