/**
 * The icon for each achievement: a `lucide-react` icon name, so the library can draw
 * Steam-style square icon tiles instead of emoji. Names only, no imports, so this
 * stays client- and server-safe; `components/steam/AchievementIcon.tsx` resolves a
 * name to the component. `lib/achievements/__tests__/icons.test.ts` fails when an
 * achievement has no icon or a name is not a real lucide icon.
 */

export const DEFAULT_ACHIEVEMENT_ICON = 'Trophy';

export const ACHIEVEMENT_ICON: Record<string, string> = {
  // Social
  'social.first_post': 'PenLine',
  'social.posts_10': 'MessageCircle',
  'social.posts_100': 'Megaphone',
  'social.first_follower': 'UserPlus',
  'social.followers_50': 'Users',
  'social.followers_500': 'Trophy',
  'social.first_like_given': 'Heart',
  'social.first_comment': 'MessageSquare',
  'social.first_bookmark': 'Bookmark',
  'social.profile_complete': 'IdCard',
  'social.first_repost': 'Repeat2',
  'social.first_quote': 'Quote',
  'social.first_poll': 'ChartBar',
  'social.first_vote': 'Vote',
  'social.likes_received_100': 'ThumbsUp',
  'social.likes_received_1000': 'Flower2',
  'social.comments_50': 'MessagesSquare',
  'social.viral_post': 'TrendingUp',
  'social.first_dm': 'Mail',
  'social.first_mention_received': 'AtSign',
  'social.followers_5000': 'BadgeCheck',
  // Creator
  'creator.first_build': 'Hammer',
  'creator.builds_10': 'Factory',
  'creator.first_community': 'Building2',
  'creator.community_100': 'Radio',
  'creator.first_paid_post': 'Lock',
  'creator.first_sale': 'BadgeDollarSign',
  'creator.first_product': 'Store',
  'creator.build_likes_50': 'Award',
  // Economy
  'economy.first_purchase': 'ShoppingBag',
  'economy.first_tip_sent': 'Coins',
  'economy.first_tip_received': 'HeartHandshake',
  'economy.coins_1000': 'Wallet',
  'economy.coins_10000': 'Gem',
  'economy.tips_sent_10': 'Gift',
  'economy.first_unlock': 'KeyRound',
  'economy.first_gift_sub': 'Ticket',
  'economy.first_wheel': 'CircleDot',
  'economy.shop_collector': 'Shirt',
  // Special
  'special.streak_7': 'Flame',
  'special.streak_30': 'Zap',
  'special.streak_100': 'Infinity',
  'special.site_hunter': 'Compass',
  'special.night_owl': 'Moon',
  'special.early_bird': 'Bird',
  'special.level_10': 'ChevronsUp',
  'special.level_25': 'ShieldCheck',
  'special.level_50': 'Flag',
  'special.quest_master': 'Map',
  'special.completionist': 'ListChecks',
  'special.weekend_warrior': 'Gamepad2',
  'special.bookmark_collector': 'Archive',
  // Games
  'game.first_ranked': 'Swords',
  'game.first_music_guess': 'Music',
  'game.rmhbox.first_game': 'PartyPopper',
  'game.rmhbox.first_win': 'Medal',
  'game.rmhbox.wins_25': 'Crown',
  'game.rmhbox.host': 'Mic',
  'game.rmhbox.perfect': 'Target',
  'game.daily.first_solve': 'Lightbulb',
  'game.daily.solves_30': 'CalendarDays',
  'game.daily.streak_7': 'CalendarCheck',
  'game.daily.all_in_day': 'CheckCheck',
  'game.altair.first_run': 'Rocket',
  'game.altair.first_victory': 'Star',
  'game.altair.coop_revives_10': 'Handshake',
  'game.altair.coop_wins_10': 'UsersRound',
  'game.slice_it.first_play': 'Music2',
  'game.slice_it.upload': 'Headphones',
  'game.slice_it.full_combo': 'Link',
  'game.slice_it.s_rank': 'Slice',
  'game.slice_it.ss_rank': 'Diamond',
  'game.slice_it.expert_fc': 'Skull',
  'game.slice_it.stacked': 'SlidersHorizontal',
  'game.slice_it.centurion': 'ListMusic',
  'game.slice_it.charted': 'PencilRuler',
  'game.synapse.first_game': 'Brain',
  'game.temple.first_save': 'Landmark',
  'game.rmhtype.first_race': 'Keyboard',
  'game.rmhtype.wpm_100': 'Wind',
  'game.rmhtube.host_room': 'Tv',
  'game.rmhmusic.host_room': 'Disc3',
  'game.rmhstudy.session': 'BookOpen',
  'game.casino.first_win': 'Dices',
  'game.casino.high_roller': 'Banknote',
  'game.casino.blackjack': 'Spade',
  // Bum's Rush
  'games.bums_first_clear': 'Hand',
  'games.bums_world_1': 'Anchor',
  'games.bums_levels_25': 'Grab',
  'games.bums_levels_72': 'Layers',
  'games.bums_objectives_100': 'ClipboardList',
  'games.bums_parcels_40': 'Package',
  'games.bums_flawless_10': 'Shield',
  'games.bums_chain_4': 'Link2',
  'games.bums_showdown_first': 'Sword',
  'games.bums_showdown_25': 'Axe',
  'games.bums_cat': 'Cat',
  'games.bums_deaths_500': 'Bomb',
};

/** The lucide icon name for an achievement id; a trophy for an unknown one. */
export function achievementIconName(id: string): string {
  return ACHIEVEMENT_ICON[id] ?? DEFAULT_ACHIEVEMENT_ICON;
}

/**
 * A second, small glyph that goes on the badge beside the main one, so the two read
 * together ("rocket + crown" = won a run). Only where it says something the main
 * glyph does not; milestone counts are shown on a ribbon instead (see `compactCount`).
 */
export const ACHIEVEMENT_ACCENT: Record<string, string> = {
  'social.first_post': 'Sparkles',
  'social.first_follower': 'Heart',
  'social.followers_50': 'Star',
  'social.followers_500': 'Star',
  'social.followers_5000': 'Crown',
  'social.first_like_given': 'Sparkles',
  'social.first_comment': 'Plus',
  'social.first_bookmark': 'Star',
  'social.profile_complete': 'Check',
  'social.first_repost': 'Plus',
  'social.first_poll': 'Plus',
  'social.first_vote': 'Check',
  'social.likes_received_100': 'Heart',
  'social.likes_received_1000': 'Heart',
  'social.viral_post': 'Flame',
  'social.first_dm': 'Sparkles',
  'social.first_mention_received': 'Bell',
  'creator.first_build': 'Plus',
  'creator.first_community': 'Crown',
  'creator.community_100': 'Star',
  'creator.first_paid_post': 'Coins',
  'creator.first_sale': 'Check',
  'creator.first_product': 'Plus',
  'creator.build_likes_50': 'Heart',
  'economy.first_purchase': 'Check',
  'economy.first_tip_sent': 'Heart',
  'economy.first_tip_received': 'Star',
  'economy.coins_1000': 'Coins',
  'economy.coins_10000': 'Crown',
  'economy.tips_sent_10': 'Heart',
  'economy.first_unlock': 'Check',
  'economy.first_gift_sub': 'Heart',
  'economy.first_wheel': 'Star',
  'economy.shop_collector': 'Star',
  'special.streak_7': 'Clock',
  'special.streak_30': 'Clock',
  'special.streak_100': 'Crown',
  'special.site_hunter': 'Star',
  'special.night_owl': 'Star',
  'special.early_bird': 'Sun',
  'special.level_10': 'Star',
  'special.level_25': 'Star',
  'special.level_50': 'Crown',
  'special.quest_master': 'Sword',
  'special.completionist': 'Check',
  'special.weekend_warrior': 'Zap',
  'game.first_ranked': 'Trophy',
  'game.first_music_guess': 'Check',
  'game.rmhbox.first_game': 'Plus',
  'game.rmhbox.first_win': 'Star',
  'game.rmhbox.wins_25': 'Trophy',
  'game.rmhbox.host': 'Crown',
  'game.rmhbox.perfect': 'Check',
  'game.daily.first_solve': 'Check',
  'game.daily.solves_30': 'Star',
  'game.daily.streak_7': 'Flame',
  'game.daily.all_in_day': 'Star',
  'game.altair.first_run': 'Plus',
  'game.altair.first_victory': 'Crown',
  'game.altair.coop_revives_10': 'Heart',
  'game.altair.coop_wins_10': 'Star',
  'game.slice_it.first_play': 'Plus',
  'game.slice_it.upload': 'Plus',
  'game.slice_it.full_combo': 'Zap',
  'game.slice_it.s_rank': 'Star',
  'game.slice_it.ss_rank': 'Crown',
  'game.slice_it.expert_fc': 'Flame',
  'game.slice_it.stacked': 'Zap',
  'game.slice_it.centurion': 'Star',
  'game.slice_it.charted': 'Check',
  'game.synapse.first_game': 'Zap',
  'game.temple.first_save': 'Star',
  'game.rmhtype.first_race': 'Plus',
  'game.rmhtype.wpm_100': 'Zap',
  'game.rmhtube.host_room': 'Crown',
  'game.rmhmusic.host_room': 'Crown',
  'game.rmhstudy.session': 'Check',
  'game.casino.first_win': 'Star',
  'game.casino.high_roller': 'Crown',
  'game.casino.blackjack': 'Star',
  'games.bums_first_clear': 'Check',
  'games.bums_world_1': 'Star',
  'games.bums_levels_72': 'Crown',
  'games.bums_objectives_100': 'Check',
  'games.bums_parcels_40': 'Star',
  'games.bums_flawless_10': 'Heart',
  'games.bums_chain_4': 'Plus',
  'games.bums_showdown_first': 'Trophy',
  'games.bums_showdown_25': 'Crown',
  'games.bums_cat': 'Heart',
  'games.bums_deaths_500': 'Skull',
};

/** The accent glyph's lucide name, or null when the badge has none. */
export function achievementAccentName(id: string): string | null {
  return ACHIEVEMENT_ACCENT[id] ?? null;
}

export type AchievementShape = 'circle' | 'hex' | 'diamond' | 'shield' | 'square';

/**
 * The badge outline: one per category, so a list of achievements reads at a glance —
 * round for social, hexagon for creators, diamond for the economy, shield for special
 * milestones, rounded square for games.
 */
export function achievementShape(id: string): AchievementShape {
  const prefix = id.split('.')[0];
  switch (prefix) {
    case 'creator':
      return 'hex';
    case 'economy':
      return 'diamond';
    case 'special':
      return 'shield';
    case 'game':
    case 'games':
      return 'square';
    default:
      return 'circle';
  }
}

/** A milestone count short enough for a badge ribbon: 999, 1K, 1.5K, 10K. */
export function compactCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  return `${Number.isInteger(k) ? k : k.toFixed(1)}K`;
}
