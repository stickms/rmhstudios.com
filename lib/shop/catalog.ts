/**
 * Cosmetics shop catalog — source of truth for purchasable items.
 *
 * Items are code-defined; ownership/equip state lives in `UserInventory`. The
 * `id` is the stable key stored there, so never rename a shipped id.
 *
 * `kind` maps to an equip slot — only one item per kind can be equipped at a
 * time. `data` holds kind-specific rendering info (a color, gradient, emoji, or
 * CSS class) the UI interprets.
 */

export type ShopItemKind =
  | 'THEME'
  | 'PET'
  | 'NAME_COLOR'
  | 'BADGE'
  | 'BANNER'
  | 'POST_FLAIR'
  | 'AVATAR_FRAME';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export interface ShopItem {
  id: string;
  kind: ShopItemKind;
  name: string;
  description: string;
  price: number; // coins
  rarity: Rarity;
  /** Kind-specific render data. */
  data: {
    color?: string;
    gradient?: string;
    emoji?: string;
    className?: string;
    themeId?: string;
  };
  /** Requires this subscription tier or higher to purchase (optional). */
  requiresTier?: 'starter' | 'pro';
}

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#9ca3af',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
};

export const KIND_LABELS: Record<ShopItemKind, string> = {
  NAME_COLOR: 'Name Colors',
  AVATAR_FRAME: 'Avatar Frames',
  BADGE: 'Badges',
  POST_FLAIR: 'Post Flair',
  BANNER: 'Profile Banners',
  PET: 'Pets',
  THEME: 'Premium Themes',
};

export const SHOP_ITEMS: ShopItem[] = [
  // ─── Name Colors ───────────────────────────────────────────────────────
  { id: 'color.sunset', kind: 'NAME_COLOR', name: 'Sunset', description: 'Warm orange name color.', price: 100, rarity: 'common', data: { color: '#fb923c' } },
  { id: 'color.ocean', kind: 'NAME_COLOR', name: 'Ocean', description: 'Cool blue name color.', price: 100, rarity: 'common', data: { color: '#38bdf8' } },
  { id: 'color.mint', kind: 'NAME_COLOR', name: 'Mint', description: 'Fresh green name color.', price: 100, rarity: 'common', data: { color: '#34d399' } },
  { id: 'color.crimson', kind: 'NAME_COLOR', name: 'Crimson', description: 'Bold red name color.', price: 150, rarity: 'rare', data: { color: '#f43f5e' } },
  { id: 'color.violet', kind: 'NAME_COLOR', name: 'Violet', description: 'Royal purple name color.', price: 150, rarity: 'rare', data: { color: '#a78bfa' } },
  { id: 'color.gold', kind: 'NAME_COLOR', name: 'Gold', description: 'Shimmering gold name color.', price: 400, rarity: 'epic', data: { color: '#fbbf24' } },
  { id: 'color.rainbow', kind: 'NAME_COLOR', name: 'Rainbow', description: 'Animated rainbow gradient name.', price: 1000, rarity: 'legendary', data: { gradient: 'linear-gradient(90deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)' } },

  // ─── Avatar Frames ─────────────────────────────────────────────────────
  { id: 'frame.gold', kind: 'AVATAR_FRAME', name: 'Gold Ring', description: 'A polished gold ring.', price: 250, rarity: 'rare', data: { color: '#fbbf24' } },
  { id: 'frame.neon', kind: 'AVATAR_FRAME', name: 'Neon Ring', description: 'A glowing neon ring.', price: 250, rarity: 'rare', data: { color: '#22d3ee' } },
  { id: 'frame.fire', kind: 'AVATAR_FRAME', name: 'Inferno', description: 'A fiery animated frame.', price: 600, rarity: 'epic', data: { gradient: 'conic-gradient(#f97316,#ef4444,#f97316)' } },
  { id: 'frame.ice', kind: 'AVATAR_FRAME', name: 'Frostbite', description: 'A frozen crystalline frame.', price: 600, rarity: 'epic', data: { gradient: 'conic-gradient(#38bdf8,#a5f3fc,#38bdf8)' } },
  { id: 'frame.rainbow', kind: 'AVATAR_FRAME', name: 'Prism', description: 'A shifting rainbow frame.', price: 1200, rarity: 'legendary', data: { gradient: 'conic-gradient(#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa,#f43f5e)' } },

  // ─── Badges (flair next to your name) ──────────────────────────────────
  { id: 'badge.star', kind: 'BADGE', name: 'Star', description: 'A shining star badge.', price: 80, rarity: 'common', data: { emoji: '⭐' } },
  { id: 'badge.fire', kind: 'BADGE', name: 'Flame', description: 'A blazing flame badge.', price: 80, rarity: 'common', data: { emoji: '🔥' } },
  { id: 'badge.heart', kind: 'BADGE', name: 'Heart', description: 'A lovely heart badge.', price: 80, rarity: 'common', data: { emoji: '💖' } },
  { id: 'badge.bolt', kind: 'BADGE', name: 'Bolt', description: 'An electric bolt badge.', price: 120, rarity: 'rare', data: { emoji: '⚡' } },
  { id: 'badge.crown', kind: 'BADGE', name: 'Crown', description: 'A regal crown badge.', price: 500, rarity: 'epic', data: { emoji: '👑' } },
  { id: 'badge.diamond', kind: 'BADGE', name: 'Diamond', description: 'A brilliant diamond badge.', price: 500, rarity: 'epic', data: { emoji: '💎' } },
  { id: 'badge.galaxy', kind: 'BADGE', name: 'Galaxy', description: 'A cosmic galaxy badge.', price: 900, rarity: 'legendary', data: { emoji: '🌌' } },

  // ─── Post Flair (decoration on your posts) ─────────────────────────────
  { id: 'flair.accent', kind: 'POST_FLAIR', name: 'Accent Edge', description: 'An accent stripe on your posts.', price: 200, rarity: 'rare', data: { className: 'flair-accent', color: 'var(--site-accent)' } },
  { id: 'flair.gold', kind: 'POST_FLAIR', name: 'Gilded', description: 'A gold edge on your posts.', price: 450, rarity: 'epic', data: { className: 'flair-gold', color: '#fbbf24' } },
  { id: 'flair.rainbow', kind: 'POST_FLAIR', name: 'Spectrum', description: 'A rainbow edge on your posts.', price: 1000, rarity: 'legendary', data: { className: 'flair-rainbow', gradient: 'linear-gradient(180deg,#f43f5e,#38bdf8)' } },

  // ─── Profile Banners ───────────────────────────────────────────────────
  { id: 'banner.dusk', kind: 'BANNER', name: 'Dusk', description: 'A warm dusk gradient banner.', price: 150, rarity: 'common', data: { gradient: 'linear-gradient(135deg,#f97316,#db2777)' } },
  { id: 'banner.aurora', kind: 'BANNER', name: 'Aurora', description: 'An aurora gradient banner.', price: 150, rarity: 'common', data: { gradient: 'linear-gradient(135deg,#22d3ee,#a78bfa)' } },
  { id: 'banner.matrix', kind: 'BANNER', name: 'Matrix', description: 'A green code banner.', price: 300, rarity: 'rare', data: { gradient: 'linear-gradient(135deg,#022c22,#16a34a)' } },
  { id: 'banner.galaxy', kind: 'BANNER', name: 'Nebula', description: 'A deep-space nebula banner.', price: 700, rarity: 'epic', data: { gradient: 'linear-gradient(135deg,#1e1b4b,#7c3aed,#db2777)' } },

  // ─── Pets ──────────────────────────────────────────────────────────────
  { id: 'pet.cat', kind: 'PET', name: 'Cat Companion', description: 'A cat that follows your profile.', price: 200, rarity: 'rare', data: { emoji: '🐱' } },
  { id: 'pet.dragon', kind: 'PET', name: 'Baby Dragon', description: 'A tiny dragon companion.', price: 800, rarity: 'epic', data: { emoji: '🐲' } },
  { id: 'pet.ghost', kind: 'PET', name: 'Friendly Ghost', description: 'A spooky companion.', price: 400, rarity: 'rare', data: { emoji: '👻' } },
  { id: 'pet.robot', kind: 'PET', name: 'Bot Buddy', description: 'A loyal robot companion.', price: 400, rarity: 'rare', data: { emoji: '🤖' } },

  // ─── Premium Themes (bragging rights) ──────────────────────────────────
  { id: 'theme.midnight', kind: 'THEME', name: 'Midnight (Premium)', description: 'An exclusive deep-blue theme.', price: 1500, rarity: 'legendary', data: { themeId: 'midnight' }, requiresTier: 'pro' },
  { id: 'theme.vapor', kind: 'THEME', name: 'Vaporwave (Premium)', description: 'An exclusive retro theme.', price: 1500, rarity: 'legendary', data: { themeId: 'vapor' } },
];

const BY_ID = new Map(SHOP_ITEMS.map((i) => [i.id, i]));
export function getShopItem(id: string): ShopItem | undefined {
  return BY_ID.get(id);
}

export const KIND_ORDER: ShopItemKind[] = [
  'NAME_COLOR',
  'AVATAR_FRAME',
  'BADGE',
  'POST_FLAIR',
  'BANNER',
  'PET',
  'THEME',
];
