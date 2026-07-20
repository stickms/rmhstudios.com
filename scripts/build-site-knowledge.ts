/**
 * Generate `data/site-knowledge.json` — the corpus the site-wide AI Concierge
 * (§11) retrieves over. It combines:
 *
 *   - every listed game (from `lib/games.ts`)
 *   - every listed app (from `lib/apps.ts`, minus hidden entries)
 *   - a hand-written set of "how the platform works" help snippets
 *
 * The concierge does simple server-side keyword ranking over these entries
 * (`lib/assistant/knowledge.server.ts`) — no vectors, no embeddings. Keep the
 * file small (< 100 KB): descriptions are trimmed and there's no full content.
 *
 *   Regenerate after editing games/apps or the help snippets below:
 *     pnpm exec tsx scripts/build-site-knowledge.ts
 *
 * The committed JSON is kept in sync by hand too, so the concierge works even
 * if this script is never run.
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

export interface KnowledgeEntry {
  id: string;
  kind: 'game' | 'app' | 'help';
  title: string;
  tags: string[];
  /** In-app route (games/apps) — the concierge may surface it as a link. */
  route?: string;
  /** Human hint about player count / solo-vs-multiplayer (games/apps only). */
  players?: string;
  text: string;
}

const MULTIPLAYER_TAGS = new Set(['Multiplayer', 'Co-op', 'Party', 'Real-time']);

function playersHint(tags: string[]): string {
  return tags.some((t) => MULTIPLAYER_TAGS.has(t))
    ? 'multiplayer / playable with friends'
    : 'single-player';
}

function truncate(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** ~30 hand-written help snippets covering the platform's cross-cutting systems. */
export const HELP_SNIPPETS: Omit<KnowledgeEntry, 'kind'>[] = [
  {
    id: 'help:coins',
    title: 'How coins work',
    tags: ['coins', 'economy', 'currency', 'rewards'],
    text: 'Coins are the site-wide currency. You earn them by checking in daily, completing quests, winning games, and hitting achievements. Spend them in the shop on cosmetics, on the prize wheel, on gifts, and to buy streak freezes. Your balance lives in your wallet.',
  },
  {
    id: 'help:wallet',
    title: 'Where to find your wallet and coin balance',
    tags: ['wallet', 'coins', 'balance'],
    route: '/wallet',
    text: 'Open your wallet at /wallet to see your coin balance, your transaction history (the coin ledger), and ways to earn or spend coins.',
  },
  {
    id: 'help:daily-streak',
    title: 'Daily check-in streak',
    tags: ['streak', 'daily', 'check-in', 'coins'],
    text: 'Check in once per day to build a streak. Consecutive days grow it and pay out coins that scale with the streak length. Miss a day and it resets — unless you hold streak freezes, which are spent automatically to bridge a missed day. Buy freezes with coins.',
  },
  {
    id: 'help:quests',
    title: 'Quests and how to claim rewards',
    tags: ['quests', 'daily', 'weekly', 'xp', 'coins', 'rewards'],
    route: '/achievements',
    text: 'Daily and weekly quests give you goals like playing a game or posting. Progress fills as you go; once a quest is complete you claim it for XP and coins. Unclaimed completed rewards wait for you.',
  },
  {
    id: 'help:achievements',
    title: 'Achievements',
    tags: ['achievements', 'badges', 'progression', 'xp'],
    route: '/achievements',
    text: 'Achievements are one-time milestones across the whole platform (social, games, economy). Unlocking one grants XP and sometimes coins. See your progress on the achievements page.',
  },
  {
    id: 'help:xp-levels',
    title: 'XP and levels',
    tags: ['xp', 'levels', 'progression'],
    text: 'You earn XP from quests, achievements, streaks, and activity. XP raises your level, which shows on your profile and feeds progression rewards.',
  },
  {
    id: 'help:battle-pass',
    title: 'The season pass / battle pass',
    tags: ['pass', 'battle pass', 'season', 'tiers', 'rewards'],
    text: 'Each season has a pass that awards tiered rewards as you earn season XP by playing and engaging. Climb tiers over the season to unlock cosmetics and coins.',
  },
  {
    id: 'help:membership',
    title: 'Memberships and paid tiers',
    tags: ['membership', 'subscription', 'stripe', 'pro', 'starter', 'enterprise', 'billing'],
    route: '/membership',
    text: 'Paid memberships (Starter, Pro, Enterprise) unlock perks like the developer API, a profile badge, and higher limits. Manage or upgrade your plan on the membership page; billing is handled by Stripe.',
  },
  {
    id: 'help:gift-membership',
    title: 'Gifting a membership with coins',
    tags: ['gift', 'membership', 'coins'],
    text: 'You can gift a membership to another user using coins. The recipient gets the tier perks for the gift period.',
  },
  {
    id: 'help:theme',
    title: 'Changing your theme and appearance',
    tags: ['theme', 'appearance', 'dark mode', 'light mode', 'accent', 'settings', 'customize'],
    route: '/settings',
    text: 'Change your look in Settings under appearance. Pick a base or curated theme (the default is Liquid Glass), choose an accent color, and toggle reduced transparency. Your choice syncs across devices once signed in.',
  },
  {
    id: 'help:language',
    title: 'Changing your language',
    tags: ['language', 'locale', 'i18n', 'translation', 'settings'],
    route: '/settings',
    text: 'The site is available in 32 languages, including right-to-left layouts for Arabic, Urdu, and Farsi. Switch languages from the language switcher or in settings.',
  },
  {
    id: 'help:tournaments',
    title: 'Joining a tournament',
    tags: ['tournament', 'compete', 'bracket', 'events', 'games'],
    text: 'Tournaments are organized competitions for supported games. Browse open tournaments, join one before it starts, then play your matches through the bracket. Winners earn coins and bragging rights.',
  },
  {
    id: 'help:wagers',
    title: 'What wagers are',
    tags: ['wager', 'bet', 'coins', 'games', 'stakes'],
    text: 'A wager lets you stake coins on the outcome of a match or challenge. Both sides put up coins; the winner takes the pot. Only wager coins you can afford to lose — it is for fun, not real money.',
  },
  {
    id: 'help:ladder',
    title: 'Ranked ladder and Elo',
    tags: ['ladder', 'ranked', 'elo', 'rating', 'leaderboard', 'compete'],
    text: 'Ranked play tracks an Elo-style rating that goes up when you win and down when you lose, placing you on the competitive leaderboard for that game.',
  },
  {
    id: 'help:feed',
    title: 'The RMHarks social feed',
    tags: ['feed', 'rmharks', 'posts', 'social', 'follow', 'timeline'],
    route: '/',
    text: 'RMHarks is the social feed. Post text, images, GIFs, and polls; like, comment, repost, and react; and follow people to fill your timeline. The home page is your feed.',
  },
  {
    id: 'help:posting',
    title: 'How to make a post (RMHark)',
    tags: ['post', 'rmhark', 'compose', 'feed', 'share'],
    text: 'Use the composer on the feed to write a post (an RMHark). You can attach images with alt text, a GIF, or a poll, mark it sensitive, and choose who can reply. AI compose-assist can help you improve or rewrite a draft.',
  },
  {
    id: 'help:communities',
    title: 'Communities',
    tags: ['community', 'communities', 'groups', 'join'],
    route: '/communities',
    text: 'Communities are topic-based spaces. Join ones that interest you and post to them; community picks can surface in your feed and digest.',
  },
  {
    id: 'help:messages',
    title: 'Direct messages and group chats',
    tags: ['messages', 'dm', 'chat', 'group chat', 'inbox'],
    route: '/messages',
    text: 'Send direct messages and start group chats from your inbox. Chats support real-time messaging and reactions.',
  },
  {
    id: 'help:events',
    title: 'Events and RSVPs',
    tags: ['events', 'rsvp', 'calendar', 'community'],
    text: 'Communities and profiles can host events. RSVP "going" or "maybe"; your upcoming RSVPs also show up in your weekly digest email.',
  },
  {
    id: 'help:notifications',
    title: 'Notification settings',
    tags: ['notifications', 'settings', 'preferences', 'push', 'email'],
    route: '/settings',
    text: 'Control what you get notified about — likes, comments, follows, mentions, reposts, and system events — in notification settings. You can also opt into the weekly digest email and enable web push.',
  },
  {
    id: 'help:weekly-digest',
    title: 'The weekly digest email',
    tags: ['digest', 'email', 'weekly', 'newsletter', 'unsubscribe', 'notifications'],
    route: '/settings',
    text: 'The weekly digest is an opt-in email recapping top posts from people you follow, a featured story, your streak and quest progress, and upcoming events. Turn it on in notification settings; every email has a one-click unsubscribe link.',
  },
  {
    id: 'help:profile',
    title: 'Your profile and handle',
    tags: ['profile', 'handle', 'username', 'bio', 'avatar'],
    text: 'Your profile shows your posts, achievements, and level. Your @handle is your unique address for mentions and your profile URL; you can change it (with a cooldown) in settings.',
  },
  {
    id: 'help:shop-cosmetics',
    title: 'The shop and cosmetics',
    tags: ['shop', 'store', 'cosmetics', 'coins', 'inventory'],
    route: '/shop',
    text: 'Spend coins in the shop on cosmetics like avatar frames and profile flair. Owned items live in your inventory and can be equipped from your profile.',
  },
  {
    id: 'help:prize-wheel',
    title: 'The prize wheel',
    tags: ['wheel', 'spin', 'coins', 'prizes', 'luck'],
    text: 'The prize wheel lets you spend coins for a chance at coin payouts and cosmetic prizes.',
  },
  {
    id: 'help:developer-api',
    title: 'The developer API',
    tags: ['api', 'developer', 'tokens', 'webhooks', 'integration'],
    route: '/developer',
    text: 'Members on Starter and above get a scoped developer API with API keys and webhooks. Manage keys and read the docs in the developer area.',
  },
  {
    id: 'help:library',
    title: 'The library',
    tags: ['library', 'books', 'documents', 'reading'],
    route: '/library',
    text: 'The library hosts documents and books you can browse and read on the site.',
  },
  {
    id: 'help:blog-news',
    title: 'Blog and news',
    tags: ['blog', 'news', 'articles', 'updates'],
    route: '/news',
    text: 'The blog and newsroom carry platform updates, announcements, and curated stories. Featured articles can appear in your weekly digest.',
  },
  {
    id: 'help:leaderboards',
    title: 'Leaderboards',
    tags: ['leaderboard', 'scores', 'ranking', 'compete', 'games'],
    text: 'Many games have global leaderboards ranking players by score, time, or rating. Post a strong run to climb.',
  },
  {
    id: 'help:ai-features',
    title: 'AI features on the site',
    tags: ['ai', 'assistant', 'compose', 'translate', 'concierge'],
    route: '/help',
    text: 'AI powers several features: compose-assist and translation on posts, an "ask the feed" answer layer, AI personas you can chat with, and this concierge, which answers questions about the platform.',
  },
  {
    id: 'help:concierge',
    title: 'What the concierge can do',
    tags: ['concierge', 'help', 'assistant', 'guide', 'support'],
    route: '/help',
    text: 'The concierge is your in-site guide. Ask it how something works, where to find a page, or for a game recommendation, and it points you to the right place. It answers only about RMH Studios and never performs actions for you.',
  },
  {
    id: 'help:security-privacy',
    title: 'Account security and privacy',
    tags: ['security', 'privacy', 'password', 'passkey', 'login', '2fa'],
    route: '/settings',
    text: 'Sign in with Discord, Google, GitHub, or email, and add a passkey for passwordless login. Manage sign-in methods and security options in settings.',
  },
  {
    id: 'help:report-block',
    title: 'Reporting and blocking',
    tags: ['report', 'block', 'moderation', 'safety', 'harassment'],
    text: 'You can report posts or users that break the rules and block accounts you do not want to interact with. Reports go to moderators for review.',
  },
];

function buildEntries(): KnowledgeEntry[] {
  const gameEntries: KnowledgeEntry[] = games.map((g) => ({
    id: `game:${g.id}`,
    kind: 'game',
    title: g.title,
    tags: g.tags,
    route: g.href,
    players: playersHint(g.tags),
    text: truncate(`${g.description} ${g.longDescription}`, 360),
  }));

  const appEntries: KnowledgeEntry[] = apps
    .filter((a) => !a.hidden)
    .map((a) => ({
      id: `app:${a.id}`,
      kind: 'app',
      title: a.title,
      tags: a.tags,
      route: a.href,
      players: playersHint(a.tags),
      text: truncate(`${a.description} ${a.longDescription}`, 360),
    }));

  const helpEntries: KnowledgeEntry[] = HELP_SNIPPETS.map((h) => ({ ...h, kind: 'help' as const }));

  return [...helpEntries, ...gameEntries, ...appEntries];
}

function main() {
  const entries = buildEntries();
  const out = join(process.cwd(), 'data', 'site-knowledge.json');
  const json = JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2);
  writeFileSync(out, `${json}\n`);
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1);
  console.info(`[site-knowledge] wrote ${entries.length} entries to ${out} (${kb} KB)`);
}

// Run when invoked directly.
main();
