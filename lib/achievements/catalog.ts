/**
 * Achievement catalog — the single source of truth for every achievement.
 *
 * Definitions live in code (not the DB); only a user's unlock/progress rows are
 * persisted (`UserAchievement`). The `id` is the stable key stored there, so
 * never rename an id once shipped — add a new one instead.
 *
 * `target` = 1 means a one-shot unlock. `target` > 1 is an incremental
 * achievement (e.g. "win 50 games") tracked via UserAchievement.progress.
 */

export type AchievementCategory = 'social' | 'creator' | 'economy' | 'games' | 'special';
export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  icon: string; // emoji
  category: AchievementCategory;
  tier: AchievementTier;
  /** Coins granted on unlock. */
  coinReward: number;
  /** Progress needed to unlock. 1 = one-shot. */
  target: number;
  /** Hidden until unlocked (spoiler/easter-egg achievements). */
  secret?: boolean;
  /** Optional grouping label, e.g. the game name. */
  group?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // ─── Social ──────────────────────────────────────────────────────────────
  { id: 'social.first_post', name: 'Hello, World', description: 'Publish your first RMHark.', icon: '✍️', category: 'social', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'social.posts_10', name: 'Getting Chatty', description: 'Publish 10 RMHarks.', icon: '💬', category: 'social', tier: 'bronze', coinReward: 20, target: 10 },
  { id: 'social.posts_100', name: 'Prolific', description: 'Publish 100 RMHarks.', icon: '📢', category: 'social', tier: 'gold', coinReward: 100, target: 100 },
  { id: 'social.first_follower', name: 'Noticed', description: 'Gain your first follower.', icon: '👋', category: 'social', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'social.followers_50', name: 'Crowd Pleaser', description: 'Reach 50 followers.', icon: '🌟', category: 'social', tier: 'silver', coinReward: 50, target: 50 },
  { id: 'social.followers_500', name: 'Influencer', description: 'Reach 500 followers.', icon: '🏆', category: 'social', tier: 'platinum', coinReward: 250, target: 500 },
  { id: 'social.first_like_given', name: 'Spread the Love', description: 'Like your first post.', icon: '❤️', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.first_comment', name: 'Joining In', description: 'Leave your first comment.', icon: '🗨️', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.first_bookmark', name: 'Saved for Later', description: 'Bookmark a post.', icon: '🔖', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.profile_complete', name: 'Looking Good', description: 'Set a display name, avatar, and bio.', icon: '🪪', category: 'social', tier: 'bronze', coinReward: 15, target: 1 },

  // ─── Creator (User Builds) ───────────────────────────────────────────────
  { id: 'creator.first_build', name: 'Builder', description: 'Publish your first User Build.', icon: '🛠️', category: 'creator', tier: 'bronze', coinReward: 25, target: 1 },
  { id: 'creator.builds_10', name: 'Workshop', description: 'Publish 10 User Builds.', icon: '🏭', category: 'creator', tier: 'gold', coinReward: 100, target: 10 },

  // ─── Economy ─────────────────────────────────────────────────────────────
  { id: 'economy.first_purchase', name: 'Treat Yourself', description: 'Buy your first item from the shop.', icon: '🛍️', category: 'economy', tier: 'bronze', coinReward: 0, target: 1 },
  { id: 'economy.first_tip_sent', name: 'Generous', description: 'Send a coin tip to someone.', icon: '🪙', category: 'economy', tier: 'bronze', coinReward: 0, target: 1 },
  { id: 'economy.first_tip_received', name: 'Appreciated', description: 'Receive a coin tip.', icon: '💝', category: 'economy', tier: 'bronze', coinReward: 0, target: 1 },
  { id: 'economy.coins_1000', name: 'Rolling in It', description: 'Hold 1,000 coins at once.', icon: '💰', category: 'economy', tier: 'silver', coinReward: 0, target: 1 },

  // ─── Engagement ─────────────────────────────────────────────────────────
  { id: 'special.streak_7', name: 'Regular', description: 'Reach a 7-day check-in streak.', icon: '🔥', category: 'special', tier: 'silver', coinReward: 30, target: 1 },
  { id: 'special.streak_30', name: 'Dedicated', description: 'Reach a 30-day check-in streak.', icon: '⚡', category: 'special', tier: 'gold', coinReward: 150, target: 1 },
  { id: 'special.night_owl', name: 'Night Owl', description: 'Post between 2am and 5am.', icon: '🦉', category: 'special', tier: 'bronze', coinReward: 10, target: 1, secret: true },

  // ─── Games ───────────────────────────────────────────────────────────────
  // RMHBox
  { id: 'game.first_ranked', name: 'Challenger', description: 'Finish your first ranked match.', icon: '⚔️', category: 'games', tier: 'silver', coinReward: 25, target: 1 },
  { id: 'game.first_music_guess', name: 'Name That Tune', description: 'Solve a Guess the Song puzzle.', icon: '🎵', category: 'games', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'game.rmhbox.first_game', name: 'Party Starter', description: 'Play your first RMHBox game.', icon: '🎉', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHBox' },
  { id: 'game.rmhbox.first_win', name: 'Winner Winner', description: 'Win an RMHBox game.', icon: '🥇', category: 'games', tier: 'silver', coinReward: 25, target: 1, group: 'RMHBox' },
  { id: 'game.rmhbox.wins_25', name: 'Box Champion', description: 'Win 25 RMHBox games.', icon: '👑', category: 'games', tier: 'gold', coinReward: 100, target: 25, group: 'RMHBox' },
  // Daily Puzzles / Lights Out
  { id: 'game.daily.first_solve', name: 'Switched On', description: 'Complete a daily puzzle.', icon: '💡', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Daily Puzzles' },
  { id: 'game.daily.solves_30', name: 'Daily Devotee', description: 'Complete 30 daily puzzles.', icon: '📅', category: 'games', tier: 'gold', coinReward: 100, target: 30, group: 'Daily Puzzles' },
  // Altair
  { id: 'game.altair.first_run', name: 'Into the Black', description: 'Finish an Altair run.', icon: '🚀', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Altair' },
  { id: 'game.altair.first_victory', name: 'Star Slayer', description: 'Win an Altair run.', icon: '⭐', category: 'games', tier: 'silver', coinReward: 30, target: 1, group: 'Altair' },
  { id: 'game.altair.coop_revives_10', name: 'Wingman', description: 'Revive teammates 10 times in co-op.', icon: '🤝', category: 'games', tier: 'silver', coinReward: 40, target: 10, group: 'Altair' },
  // Slice It!
  { id: 'game.slice_it.first_play', name: 'On Beat', description: 'Play a song in Slice It!', icon: '🎵', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Slice It!' },
  { id: 'game.slice_it.upload', name: 'DJ', description: 'Upload your own song to Slice It!', icon: '🎧', category: 'games', tier: 'silver', coinReward: 25, target: 1, group: 'Slice It!' },
  // Synapse Storm
  { id: 'game.synapse.first_game', name: 'Quick Thinker', description: 'Play a Synapse Storm round.', icon: '🧠', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Synapse Storm' },
  // Temple of Joy
  { id: 'game.temple.first_save', name: 'Pilgrim', description: 'Start your Temple of Joy journey.', icon: '🛕', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Temple of Joy' },
  // RMHType
  { id: 'game.rmhtype.first_race', name: 'Fast Fingers', description: 'Finish an RMHType race.', icon: '⌨️', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHType' },
  { id: 'game.rmhtype.wpm_100', name: 'Speed Demon', description: 'Hit 100 WPM in a race.', icon: '💨', category: 'games', tier: 'gold', coinReward: 75, target: 1, group: 'RMHType' },
  // Casino
  { id: 'game.casino.first_win', name: 'Beginner’s Luck', description: 'Win a hand at the tables.', icon: '🎰', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'Casino' },
  { id: 'game.casino.high_roller', name: 'High Roller', description: 'Place a single bet of 1,000+ coins.', icon: '💵', category: 'games', tier: 'gold', coinReward: 100, target: 1, group: 'Casino' },
  { id: 'game.casino.blackjack', name: 'Twenty-One', description: 'Hit a natural blackjack.', icon: '🃏', category: 'games', tier: 'silver', coinReward: 30, target: 1, group: 'Casino' },

  // ─── More social ─────────────────────────────────────────────────────────
  { id: 'social.first_repost', name: 'Boosted', description: 'Repost (reRMHark) something.', icon: '🔁', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.first_quote', name: 'In My Opinion', description: 'Quote-repost with commentary.', icon: '💭', category: 'social', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'social.first_poll', name: 'Pollster', description: 'Create a poll.', icon: '📊', category: 'social', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'social.first_vote', name: 'Your Voice', description: 'Vote in a poll.', icon: '🗳️', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.likes_received_100', name: 'Well Liked', description: 'Receive 100 likes across your posts.', icon: '💗', category: 'social', tier: 'silver', coinReward: 50, target: 100 },
  { id: 'social.likes_received_1000', name: 'Beloved', description: 'Receive 1,000 likes across your posts.', icon: '🌹', category: 'social', tier: 'platinum', coinReward: 300, target: 1000 },
  { id: 'social.comments_50', name: 'Conversationalist', description: 'Leave 50 comments.', icon: '🧵', category: 'social', tier: 'silver', coinReward: 40, target: 50 },
  { id: 'social.viral_post', name: 'Gone Viral', description: 'Get a single post to 100 likes.', icon: '🚀', category: 'social', tier: 'gold', coinReward: 150, target: 1 },
  { id: 'social.first_dm', name: 'Slid In', description: 'Send your first direct message.', icon: '✉️', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.first_mention_received', name: 'Tagged', description: 'Get mentioned in a post.', icon: '🔔', category: 'social', tier: 'bronze', coinReward: 5, target: 1 },
  { id: 'social.followers_5000', name: 'Verified Energy', description: 'Reach 5,000 followers.', icon: '💫', category: 'social', tier: 'platinum', coinReward: 1000, target: 5000 },

  // ─── More creator ────────────────────────────────────────────────────────
  { id: 'creator.first_community', name: 'Founder', description: 'Create a community.', icon: '🏛️', category: 'creator', tier: 'silver', coinReward: 50, target: 1 },
  { id: 'creator.community_100', name: 'Movement', description: 'Grow a community to 100 members.', icon: '📣', category: 'creator', tier: 'gold', coinReward: 200, target: 100 },
  { id: 'creator.first_paid_post', name: 'Going Pro', description: 'Publish a paid post.', icon: '🔐', category: 'creator', tier: 'silver', coinReward: 25, target: 1 },
  { id: 'creator.first_sale', name: 'Ka-ching', description: 'Sell a paid post or build.', icon: '🤑', category: 'creator', tier: 'silver', coinReward: 50, target: 1 },
  { id: 'creator.first_product', name: 'Open for Business', description: 'List a product on your storefront.', icon: '🏪', category: 'creator', tier: 'bronze', coinReward: 10, target: 1 },
  { id: 'creator.build_likes_50', name: 'Crowd Favorite', description: 'Get 50 likes on your builds.', icon: '⭐', category: 'creator', tier: 'gold', coinReward: 100, target: 50 },

  // ─── More economy ────────────────────────────────────────────────────────
  { id: 'economy.coins_10000', name: 'Whale', description: 'Hold 10,000 coins at once.', icon: '🐳', category: 'economy', tier: 'gold', coinReward: 0, target: 1 },
  { id: 'economy.tips_sent_10', name: 'Philanthropist', description: 'Send 10 tips.', icon: '🎁', category: 'economy', tier: 'silver', coinReward: 0, target: 10 },
  { id: 'economy.first_unlock', name: 'Curious', description: 'Unlock a paid post.', icon: '🗝️', category: 'economy', tier: 'bronze', coinReward: 0, target: 1 },
  { id: 'economy.first_gift_sub', name: 'Secret Santa', description: 'Gift a membership to someone.', icon: '🎁', category: 'economy', tier: 'gold', coinReward: 50, target: 1 },
  { id: 'economy.first_wheel', name: 'Spin to Win', description: 'Spin the daily coin wheel.', icon: '🎡', category: 'economy', tier: 'bronze', coinReward: 0, target: 1 },
  { id: 'economy.shop_collector', name: 'Fashionista', description: 'Own 10 shop items.', icon: '👗', category: 'economy', tier: 'gold', coinReward: 0, target: 10 },

  // ─── More engagement / special ───────────────────────────────────────────
  { id: 'special.streak_100', name: 'Unstoppable', description: 'Reach a 100-day check-in streak.', icon: '🌟', category: 'special', tier: 'platinum', coinReward: 500, target: 1 },
  { id: 'special.level_10', name: 'Seasoned', description: 'Reach account level 10.', icon: '🎖️', category: 'special', tier: 'silver', coinReward: 50, target: 1 },
  { id: 'special.level_25', name: 'Veteran', description: 'Reach account level 25.', icon: '🏅', category: 'special', tier: 'gold', coinReward: 150, target: 1 },
  { id: 'special.level_50', name: 'Legend', description: 'Reach account level 50.', icon: '👑', category: 'special', tier: 'platinum', coinReward: 500, target: 1 },
  { id: 'special.quest_master', name: 'Quest Master', description: 'Complete 50 quests.', icon: '🗺️', category: 'special', tier: 'gold', coinReward: 100, target: 50 },
  { id: 'special.completionist', name: 'Completionist', description: 'Unlock 50 achievements.', icon: '🏆', category: 'special', tier: 'platinum', coinReward: 500, target: 50 },
  { id: 'special.early_bird', name: 'Early Bird', description: 'Post between 5am and 7am.', icon: '🐦', category: 'special', tier: 'bronze', coinReward: 10, target: 1, secret: true },
  { id: 'special.weekend_warrior', name: 'Weekend Warrior', description: 'Play a game on both Saturday and Sunday.', icon: '🎮', category: 'special', tier: 'silver', coinReward: 25, target: 2, secret: true },
  { id: 'special.bookmark_collector', name: 'Pack Rat', description: 'Bookmark 25 posts.', icon: '🗂️', category: 'special', tier: 'silver', coinReward: 25, target: 25 },

  // ─── More games ──────────────────────────────────────────────────────────
  { id: 'game.altair.coop_wins_10', name: 'Squad Goals', description: 'Win 10 Altair co-op runs.', icon: '🛸', category: 'games', tier: 'gold', coinReward: 100, target: 10, group: 'Altair' },
  { id: 'game.rmhbox.host', name: 'Host With the Most', description: 'Host an RMHBox lobby.', icon: '🎙️', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHBox' },
  { id: 'game.rmhbox.perfect', name: 'Flawless', description: 'Win an RMHBox game without losing a round.', icon: '💯', category: 'games', tier: 'gold', coinReward: 75, target: 1, group: 'RMHBox' },
  { id: 'game.daily.streak_7', name: 'Daily Grind', description: 'Complete the daily puzzle 7 days in a row.', icon: '🔂', category: 'games', tier: 'silver', coinReward: 40, target: 7, group: 'Daily Puzzles' },
  { id: 'game.daily.all_in_day', name: 'Clean Sweep', description: 'Complete every daily puzzle in one day.', icon: '🧹', category: 'games', tier: 'gold', coinReward: 75, target: 1, group: 'Daily Puzzles' },
  { id: 'game.slice_it.full_combo', name: 'Full Combo', description: 'Clear a song with a full combo.', icon: '🎼', category: 'games', tier: 'gold', coinReward: 75, target: 1, group: 'Slice It!' },
  { id: 'game.rmhtube.host_room', name: 'Now Showing', description: 'Host an RMHTube watch room.', icon: '📺', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHTube' },
  { id: 'game.rmhmusic.host_room', name: 'On the Decks', description: 'Host an RMHMusic listening room.', icon: '🎚️', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHMusic' },
  { id: 'game.rmhstudy.session', name: 'Study Buddy', description: 'Complete a focus session in RMHStudy.', icon: '📖', category: 'games', tier: 'bronze', coinReward: 10, target: 1, group: 'RMHStudy' },
];

const BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function getAchievement(id: string): AchievementDef | undefined {
  return BY_ID.get(id);
}

export const TIER_ORDER: Record<AchievementTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  platinum: 3,
};

export const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: '#cd7f32',
  silver: '#c0c0c0',
  gold: '#ffd700',
  platinum: '#67e8f9',
};

export const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  social: 'Social',
  creator: 'Creator',
  economy: 'Economy',
  games: 'Games',
  special: 'Special',
};
