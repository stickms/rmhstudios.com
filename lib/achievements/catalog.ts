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
