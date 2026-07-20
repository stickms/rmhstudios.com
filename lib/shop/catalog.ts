/**
 * Cosmetics shop catalog — source of truth for purchasable items.
 *
 * Items are code-defined; ownership/equip state lives in `UserInventory`. The
 * `id` is the stable key stored there, so never rename a shipped id.
 *
 * `kind` maps to an equip slot — only one item per kind can be equipped at a
 * time. `data` holds kind-specific rendering info (a color, gradient, emoji, or
 * CSS class) the UI interprets.
 *
 * The catalog is the original hand-authored set (`LEGACY_SHOP_ITEMS`, kept
 * verbatim for id stability) plus a large generated set (`GENERATED_ITEMS`)
 * that fills out every category across all rarities.
 */

export type ShopItemKind =
  | 'THEME'
  | 'PET'
  | 'NAME_COLOR'
  | 'BADGE'
  | 'BANNER'
  | 'POST_FLAIR'
  | 'AVATAR_FRAME';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic' | 'exotic';

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
  uncommon: '#22c55e',
  rare: '#3b82f6',
  epic: '#a855f7',
  legendary: '#f59e0b',
  mythic: '#ec4899',
  exotic: '#06b6d4',
};

/** Low → high. Used for sorting the shop and any rarity comparisons. */
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'exotic'];

/** Default coin price per rarity tier (generated items). */
const PRICE: Record<Rarity, number> = {
  common: 100,
  uncommon: 175,
  rare: 300,
  epic: 600,
  legendary: 1100,
  mythic: 2000,
  exotic: 3500,
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

const LEGACY_SHOP_ITEMS: ShopItem[] = [
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
  // Onboarding v2 "First Week" graduation pack (also cheaply buyable). See lib/quests/onboarding.ts.
  { id: 'frame.starter', kind: 'AVATAR_FRAME', name: 'Newcomer Ring', description: 'A welcoming ring for finishing your first week.', price: 120, rarity: 'common', data: { color: '#34d399' } },
  { id: 'frame.neon', kind: 'AVATAR_FRAME', name: 'Neon Ring', description: 'A glowing neon ring.', price: 250, rarity: 'rare', data: { color: '#22d3ee' } },
  { id: 'frame.fire', kind: 'AVATAR_FRAME', name: 'Inferno', description: 'A fiery animated frame.', price: 600, rarity: 'epic', data: { gradient: 'conic-gradient(#f97316,#ef4444,#f97316)' } },
  { id: 'frame.ice', kind: 'AVATAR_FRAME', name: 'Frostbite', description: 'A frozen crystalline frame.', price: 600, rarity: 'epic', data: { gradient: 'conic-gradient(#38bdf8,#a5f3fc,#38bdf8)' } },
  { id: 'frame.rainbow', kind: 'AVATAR_FRAME', name: 'Prism', description: 'A shifting rainbow frame.', price: 1200, rarity: 'legendary', data: { gradient: 'conic-gradient(#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa,#f43f5e)' } },

  // ─── Badges (flair next to your name) ──────────────────────────────────
  { id: 'badge.star', kind: 'BADGE', name: 'Star', description: 'A shining star badge.', price: 80, rarity: 'common', data: { emoji: '⭐' } },
  // Onboarding v2 "First Week" graduation pack (also cheaply buyable). See lib/quests/onboarding.ts.
  { id: 'badge.newcomer', kind: 'BADGE', name: 'Newcomer', description: 'Awarded for completing the First Week arc.', price: 80, rarity: 'common', data: { emoji: '🌱' } },
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

// ───────────────────────────────────────────────────────────────────────────
// Curated expansion set. A focused, varied selection per category (not just
// color swatches) across all rarities. New ids only — existing ids above are
// never reused.
// ───────────────────────────────────────────────────────────────────────────

const co = (rarity: Rarity) => PRICE[rarity];

const GENERATED_ITEMS: ShopItem[] = [
  // ─── Name Colors (a few solids + standout gradients) ────────────────────
  { id: 'color.x.coral', kind: 'NAME_COLOR', name: 'Coral', description: 'A warm coral name color.', price: co('common'), rarity: 'common', data: { color: '#ff7f6b' } },
  { id: 'color.x.teal', kind: 'NAME_COLOR', name: 'Teal', description: 'A cool teal name color.', price: co('uncommon'), rarity: 'uncommon', data: { color: '#14b8a6' } },
  { id: 'color.x.magenta', kind: 'NAME_COLOR', name: 'Magenta', description: 'A vivid magenta name color.', price: co('uncommon'), rarity: 'uncommon', data: { color: '#d946ef' } },
  { id: 'color.x.lime', kind: 'NAME_COLOR', name: 'Electric Lime', description: 'A punchy lime name color.', price: co('rare'), rarity: 'rare', data: { color: '#a3e635' } },
  { id: 'color.x.aurora', kind: 'NAME_COLOR', name: 'Aurora', description: 'A shifting aurora gradient name.', price: co('epic'), rarity: 'epic', data: { gradient: 'linear-gradient(90deg,#22d3ee,#a78bfa,#f0abfc)' } },
  { id: 'color.x.molten', kind: 'NAME_COLOR', name: 'Molten', description: 'A fiery molten gradient name.', price: co('legendary'), rarity: 'legendary', data: { gradient: 'linear-gradient(90deg,#f97316,#ef4444,#fbbf24)' } },
  { id: 'color.x.galaxy', kind: 'NAME_COLOR', name: 'Galaxy', description: 'A deep-space gradient name.', price: co('mythic'), rarity: 'mythic', data: { gradient: 'linear-gradient(90deg,#7c3aed,#db2777,#2563eb)' } },
  { id: 'color.x.holographic', kind: 'NAME_COLOR', name: 'Holographic', description: 'An iridescent holo gradient name.', price: co('exotic'), rarity: 'exotic', data: { gradient: 'linear-gradient(90deg,#fca5a5,#fde68a,#a7f3d0,#bfdbfe,#ddd6fe)' } },

  // ─── Avatar Frames (distinct effects, not plain colors) ─────────────────
  { id: 'frame.x.silver', kind: 'AVATAR_FRAME', name: 'Silver Ring', description: 'A brushed silver ring.', price: co('uncommon'), rarity: 'uncommon', data: { color: '#cbd5e1' } },
  { id: 'frame.x.sakura', kind: 'AVATAR_FRAME', name: 'Sakura', description: 'Soft cherry-blossom petals.', price: co('rare'), rarity: 'rare', data: { gradient: 'conic-gradient(#fb7185,#fbcfe8,#fda4af,#fb7185)' } },
  { id: 'frame.x.ember', kind: 'AVATAR_FRAME', name: 'Emberglow', description: 'A smouldering ember frame.', price: co('epic'), rarity: 'epic', data: { gradient: 'conic-gradient(#f97316,#fbbf24,#ef4444,#f97316)' } },
  { id: 'frame.x.glacier', kind: 'AVATAR_FRAME', name: 'Glacier', description: 'A crystalline glacier frame.', price: co('epic'), rarity: 'epic', data: { gradient: 'conic-gradient(#38bdf8,#a5f3fc,#e0f2fe,#38bdf8)' } },
  { id: 'frame.x.venom', kind: 'AVATAR_FRAME', name: 'Venom', description: 'A toxic green animated frame.', price: co('legendary'), rarity: 'legendary', data: { gradient: 'conic-gradient(#22c55e,#a3e635,#16a34a,#22c55e)' } },
  { id: 'frame.x.nebula', kind: 'AVATAR_FRAME', name: 'Nebula Ring', description: 'A cosmic nebula halo.', price: co('mythic'), rarity: 'mythic', data: { gradient: 'conic-gradient(#7c3aed,#db2777,#2563eb,#7c3aed)' } },
  { id: 'frame.x.prismatic', kind: 'AVATAR_FRAME', name: 'Prismatic Halo', description: 'A full-spectrum prismatic halo.', price: co('exotic'), rarity: 'exotic', data: { gradient: 'conic-gradient(#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa,#f43f5e)' } },

  // ─── Badges (emoji variety) ─────────────────────────────────────────────
  { id: 'badge.x.sparkle', kind: 'BADGE', name: 'Sparkle', description: 'A sparkle badge.', price: co('common'), rarity: 'common', data: { emoji: '✨' } },
  { id: 'badge.x.rocket', kind: 'BADGE', name: 'Rocket', description: 'A rocket badge.', price: co('common'), rarity: 'common', data: { emoji: '🚀' } },
  { id: 'badge.x.clover', kind: 'BADGE', name: 'Clover', description: 'A lucky clover badge.', price: co('common'), rarity: 'common', data: { emoji: '🍀' } },
  { id: 'badge.x.trophy', kind: 'BADGE', name: 'Trophy', description: 'A trophy badge.', price: co('uncommon'), rarity: 'uncommon', data: { emoji: '🏆' } },
  { id: 'badge.x.game', kind: 'BADGE', name: 'Gamepad', description: 'A gamepad badge.', price: co('uncommon'), rarity: 'uncommon', data: { emoji: '🎮' } },
  { id: 'badge.x.crystal', kind: 'BADGE', name: 'Crystal Ball', description: 'A crystal ball badge.', price: co('rare'), rarity: 'rare', data: { emoji: '🔮' } },
  { id: 'badge.x.comet', kind: 'BADGE', name: 'Comet', description: 'A comet badge.', price: co('rare'), rarity: 'rare', data: { emoji: '☄️' } },
  { id: 'badge.x.unicorn', kind: 'BADGE', name: 'Unicorn', description: 'A unicorn badge.', price: co('epic'), rarity: 'epic', data: { emoji: '🦄' } },
  { id: 'badge.x.skull', kind: 'BADGE', name: 'Skull', description: 'A skull badge.', price: co('epic'), rarity: 'epic', data: { emoji: '💀' } },
  { id: 'badge.x.dragon', kind: 'BADGE', name: 'Dragon', description: 'A dragon badge.', price: co('legendary'), rarity: 'legendary', data: { emoji: '🐉' } },
  { id: 'badge.x.atom', kind: 'BADGE', name: 'Atom', description: 'An atom badge.', price: co('mythic'), rarity: 'mythic', data: { emoji: '⚛️' } },
  { id: 'badge.x.milky-way', kind: 'BADGE', name: 'Milky Way', description: 'A galaxy badge.', price: co('exotic'), rarity: 'exotic', data: { emoji: '🌌' } },

  // ─── Post Flair (varied edges) ──────────────────────────────────────────
  { id: 'flair.x.neon', kind: 'POST_FLAIR', name: 'Neon Edge', description: 'A glowing neon edge on your posts.', price: co('rare'), rarity: 'rare', data: { className: 'flair-solid', color: '#22d3ee' } },
  { id: 'flair.x.ocean', kind: 'POST_FLAIR', name: 'Tidal Edge', description: 'An ocean gradient edge on your posts.', price: co('rare'), rarity: 'rare', data: { className: 'flair-gradient', gradient: 'linear-gradient(180deg,#0ea5e9,#22d3ee)' } },
  { id: 'flair.x.ember', kind: 'POST_FLAIR', name: 'Ember Edge', description: 'A fiery edge on your posts.', price: co('epic'), rarity: 'epic', data: { className: 'flair-gradient', gradient: 'linear-gradient(180deg,#f97316,#ef4444)' } },
  { id: 'flair.x.frost', kind: 'POST_FLAIR', name: 'Frost Edge', description: 'An icy edge on your posts.', price: co('epic'), rarity: 'epic', data: { className: 'flair-solid', color: '#bae6fd' } },
  { id: 'flair.x.toxic', kind: 'POST_FLAIR', name: 'Toxic Edge', description: 'A toxic gradient edge on your posts.', price: co('legendary'), rarity: 'legendary', data: { className: 'flair-gradient', gradient: 'linear-gradient(180deg,#a3e635,#14b8a6)' } },
  { id: 'flair.x.prism', kind: 'POST_FLAIR', name: 'Prism Edge', description: 'A full-spectrum edge on your posts.', price: co('mythic'), rarity: 'mythic', data: { className: 'flair-gradient', gradient: 'linear-gradient(180deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)' } },

  // ─── Profile Banners (distinct scenes) ──────────────────────────────────
  { id: 'banner.x.mono-noir', kind: 'BANNER', name: 'Noir', description: 'A moody monochrome banner.', price: co('uncommon'), rarity: 'uncommon', data: { gradient: 'linear-gradient(135deg,#0a0a0a,#3f3f46)' } },
  { id: 'banner.x.candy', kind: 'BANNER', name: 'Candy', description: 'A sweet candy banner.', price: co('uncommon'), rarity: 'uncommon', data: { gradient: 'linear-gradient(135deg,#f472b6,#c084fc)' } },
  { id: 'banner.x.sandstorm', kind: 'BANNER', name: 'Sandstorm', description: 'A desert sandstorm banner.', price: co('rare'), rarity: 'rare', data: { gradient: 'linear-gradient(135deg,#b45309,#fcd34d)' } },
  { id: 'banner.x.vaporwave', kind: 'BANNER', name: 'Vaporwave', description: 'A retro vaporwave banner.', price: co('rare'), rarity: 'rare', data: { gradient: 'linear-gradient(135deg,#a21caf,#22d3ee)' } },
  { id: 'banner.x.sunrise', kind: 'BANNER', name: 'Sunrise', description: 'A glowing sunrise banner.', price: co('epic'), rarity: 'epic', data: { gradient: 'linear-gradient(135deg,#fde047,#fb923c,#f43f5e)' } },
  { id: 'banner.x.forest', kind: 'BANNER', name: 'Forest Canopy', description: 'A lush forest banner.', price: co('epic'), rarity: 'epic', data: { gradient: 'linear-gradient(135deg,#14532d,#16a34a,#a3e635)' } },
  { id: 'banner.x.firestorm', kind: 'BANNER', name: 'Firestorm', description: 'A blazing firestorm banner.', price: co('legendary'), rarity: 'legendary', data: { gradient: 'linear-gradient(135deg,#7f1d1d,#ef4444,#fbbf24)' } },
  { id: 'banner.x.northern-lights', kind: 'BANNER', name: 'Northern Lights', description: 'An aurora-lit banner.', price: co('legendary'), rarity: 'legendary', data: { gradient: 'linear-gradient(135deg,#064e3b,#22d3ee,#a78bfa)' } },
  { id: 'banner.x.cosmos', kind: 'BANNER', name: 'Cosmos', description: 'A cosmic banner.', price: co('mythic'), rarity: 'mythic', data: { gradient: 'linear-gradient(135deg,#1e1b4b,#7c3aed,#2563eb,#db2777)' } },
  { id: 'banner.x.spectra', kind: 'BANNER', name: 'Spectra', description: 'A full-spectrum banner.', price: co('exotic'), rarity: 'exotic', data: { gradient: 'linear-gradient(135deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)' } },

  // ─── Pets (emoji variety) ───────────────────────────────────────────────
  { id: 'pet.x.fox', kind: 'PET', name: 'Fox', description: 'A clever fox companion.', price: co('uncommon'), rarity: 'uncommon', data: { emoji: '🦊' } },
  { id: 'pet.x.panda', kind: 'PET', name: 'Panda', description: 'A cuddly panda companion.', price: co('uncommon'), rarity: 'uncommon', data: { emoji: '🐼' } },
  { id: 'pet.x.penguin', kind: 'PET', name: 'Penguin', description: 'A dapper penguin companion.', price: co('uncommon'), rarity: 'uncommon', data: { emoji: '🐧' } },
  { id: 'pet.x.owl', kind: 'PET', name: 'Owl', description: 'A wise owl companion.', price: co('rare'), rarity: 'rare', data: { emoji: '🦉' } },
  { id: 'pet.x.tiger', kind: 'PET', name: 'Tiger Cub', description: 'A fierce tiger cub companion.', price: co('rare'), rarity: 'rare', data: { emoji: '🐯' } },
  { id: 'pet.x.octopus', kind: 'PET', name: 'Octopus', description: 'An inky octopus companion.', price: co('rare'), rarity: 'rare', data: { emoji: '🐙' } },
  { id: 'pet.x.dino', kind: 'PET', name: 'Dino', description: 'A prehistoric dino companion.', price: co('epic'), rarity: 'epic', data: { emoji: '🦕' } },
  { id: 'pet.x.whale', kind: 'PET', name: 'Whale', description: 'A gentle whale companion.', price: co('epic'), rarity: 'epic', data: { emoji: '🐳' } },
  { id: 'pet.x.dragon2', kind: 'PET', name: 'Wyrmling', description: 'A mighty dragon companion.', price: co('legendary'), rarity: 'legendary', data: { emoji: '🐉' } },
  { id: 'pet.x.fairy', kind: 'PET', name: 'Fairy', description: 'A magical fairy companion.', price: co('mythic'), rarity: 'mythic', data: { emoji: '🧚' } },
  { id: 'pet.x.void-cat', kind: 'PET', name: 'Void Cat', description: 'A mysterious void cat companion.', price: co('exotic'), rarity: 'exotic', data: { emoji: '🐈‍⬛' } },

  // ─── Premium Themes (decorative; preview gradient + themeId) ─────────────
  { id: 'theme.x.arctic', kind: 'THEME', name: 'Arctic', description: 'The Arctic premium theme.', price: co('epic'), rarity: 'epic', data: { themeId: 'arctic', gradient: 'linear-gradient(135deg,#0e7490,#a5f3fc)' } },
  { id: 'theme.x.meadow', kind: 'THEME', name: 'Meadow', description: 'The Meadow premium theme.', price: co('epic'), rarity: 'epic', data: { themeId: 'meadow', gradient: 'linear-gradient(135deg,#166534,#a3e635)' } },
  { id: 'theme.x.neon-city', kind: 'THEME', name: 'Neon City', description: 'The Neon City premium theme.', price: co('legendary'), rarity: 'legendary', data: { themeId: 'neon-city', gradient: 'linear-gradient(135deg,#0f172a,#22d3ee,#db2777)' } },
  { id: 'theme.x.golden-hour', kind: 'THEME', name: 'Golden Hour', description: 'The Golden Hour premium theme.', price: co('legendary'), rarity: 'legendary', data: { themeId: 'golden-hour', gradient: 'linear-gradient(135deg,#b45309,#fbbf24,#fde68a)' } },
  { id: 'theme.x.deep-space', kind: 'THEME', name: 'Deep Space', description: 'The Deep Space premium theme.', price: co('legendary'), rarity: 'legendary', data: { themeId: 'deep-space', gradient: 'linear-gradient(135deg,#020617,#4338ca,#7c3aed)' } },
  { id: 'theme.x.cyberpunk', kind: 'THEME', name: 'Cyberpunk', description: 'The Cyberpunk premium theme.', price: co('mythic'), rarity: 'mythic', data: { themeId: 'cyberpunk', gradient: 'linear-gradient(135deg,#831843,#22d3ee,#fde047)' } },
  { id: 'theme.x.inferno', kind: 'THEME', name: 'Inferno', description: 'The Inferno premium theme.', price: co('mythic'), rarity: 'mythic', data: { themeId: 'inferno', gradient: 'linear-gradient(135deg,#450a0a,#ef4444,#fbbf24)' } },
  { id: 'theme.x.prism-break', kind: 'THEME', name: 'Prism Break', description: 'The Prism Break premium theme.', price: co('exotic'), rarity: 'exotic', data: { themeId: 'prism-break', gradient: 'linear-gradient(135deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)' } },
  { id: 'theme.x.iridescence', kind: 'THEME', name: 'Iridescence', description: 'The Iridescence premium theme.', price: co('exotic'), rarity: 'exotic', data: { themeId: 'iridescence', gradient: 'linear-gradient(135deg,#fca5a5,#fde68a,#a7f3d0,#bfdbfe,#ddd6fe)' }, requiresTier: 'pro' },
];

export const SHOP_ITEMS: ShopItem[] = [...LEGACY_SHOP_ITEMS, ...GENERATED_ITEMS];

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
