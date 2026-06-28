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

// ───────────────────────────────────────────────────────────────────────────
// Generated catalog. Curated data tables expanded into ShopItems below, so each
// category spans dozens of options across every rarity. New ids only — existing
// ids above are never reused.
// ───────────────────────────────────────────────────────────────────────────

type ColorDef = [slug: string, name: string, color: string, rarity: Rarity];
type GradDef = [slug: string, name: string, gradient: string, rarity: Rarity];
type EmojiDef = [slug: string, name: string, emoji: string, rarity: Rarity];

// Shared solid-color palette — reused for name colors, avatar rings, and flair.
const COLOR_DEFS: ColorDef[] = [
  // common
  ['coral', 'Coral', '#ff7f6b', 'common'],
  ['lemon', 'Lemon', '#facc15', 'common'],
  ['sky', 'Sky', '#7dd3fc', 'common'],
  ['rosewater', 'Rosewater', '#fb7185', 'common'],
  ['limeade', 'Limeade', '#a3e635', 'common'],
  ['lavender', 'Lavender', '#c4b5fd', 'common'],
  ['peachy', 'Peachy', '#fdba74', 'common'],
  ['aquamarine', 'Aquamarine', '#5eead4', 'common'],
  ['bubblegum', 'Bubblegum', '#f9a8d4', 'common'],
  ['sage', 'Sage', '#86efac', 'common'],
  ['periwinkle', 'Periwinkle', '#a5b4fc', 'common'],
  ['apricot', 'Apricot', '#fcd34d', 'common'],
  // uncommon
  ['tangerine', 'Tangerine', '#f97316', 'uncommon'],
  ['cobalt', 'Cobalt', '#2563eb', 'uncommon'],
  ['emerald', 'Emerald', '#10b981', 'uncommon'],
  ['magenta', 'Magenta', '#d946ef', 'uncommon'],
  ['ruby', 'Ruby', '#e11d48', 'uncommon'],
  ['teal', 'Teal', '#14b8a6', 'uncommon'],
  ['amber', 'Amber', '#f59e0b', 'uncommon'],
  ['indigo', 'Indigo', '#6366f1', 'uncommon'],
  ['jade', 'Jade', '#059669', 'uncommon'],
  ['fuchsia', 'Fuchsia', '#c026d3', 'uncommon'],
  ['scarlet', 'Scarlet', '#dc2626', 'uncommon'],
  ['azure', 'Azure', '#0ea5e9', 'uncommon'],
  // rare
  ['electric', 'Electric Blue', '#3b82f6', 'rare'],
  ['hot-pink', 'Hot Pink', '#ec4899', 'rare'],
  ['spring', 'Spring Green', '#22c55e', 'rare'],
  ['royal', 'Royal Purple', '#8b5cf6', 'rare'],
  ['sunburst', 'Sunburst', '#fbbf24', 'rare'],
  ['turquoise', 'Turquoise', '#06b6d4', 'rare'],
  ['cherry', 'Cherry', '#ef4444', 'rare'],
  ['orchid', 'Orchid', '#a855f7', 'rare'],
  ['seafoam', 'Seafoam', '#2dd4bf', 'rare'],
  ['marigold', 'Marigold', '#eab308', 'rare'],
  ['cerulean', 'Cerulean', '#0284c7', 'rare'],
  ['raspberry', 'Raspberry', '#be123c', 'rare'],
  // epic
  ['champagne', 'Champagne', '#f7e7ce', 'epic'],
  ['platinum', 'Platinum', '#e5e7eb', 'epic'],
  ['neon-green', 'Neon Green', '#4ade80', 'epic'],
  ['electric-violet', 'Electric Violet', '#7c3aed', 'epic'],
  ['ice-blue', 'Ice Blue', '#bae6fd', 'epic'],
  ['flamingo', 'Flamingo', '#fb7185', 'epic'],
  ['citrine', 'Citrine', '#fde047', 'epic'],
  ['emerald-shine', 'Emerald Shine', '#34d399', 'epic'],
];

// Gradient/multi-stop colors for the top rarities (name colors + flair).
const COLOR_GRADIENT_DEFS: GradDef[] = [
  ['aurora-borealis', 'Aurora Borealis', 'linear-gradient(90deg,#22d3ee,#a78bfa,#f0abfc)', 'legendary'],
  ['molten-core', 'Molten Core', 'linear-gradient(90deg,#f97316,#ef4444,#fbbf24)', 'legendary'],
  ['oceanic', 'Oceanic', 'linear-gradient(90deg,#0ea5e9,#22d3ee,#34d399)', 'legendary'],
  ['cotton-candy', 'Cotton Candy', 'linear-gradient(90deg,#f472b6,#c084fc,#60a5fa)', 'legendary'],
  ['galaxy-swirl', 'Galaxy Swirl', 'linear-gradient(90deg,#7c3aed,#db2777,#2563eb)', 'mythic'],
  ['phoenix', 'Phoenix', 'linear-gradient(90deg,#fde047,#fb923c,#ef4444)', 'mythic'],
  ['toxic', 'Toxic', 'linear-gradient(90deg,#a3e635,#22c55e,#14b8a6)', 'mythic'],
  ['chromatic', 'Chromatic', 'linear-gradient(90deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)', 'exotic'],
  ['holographic', 'Holographic', 'linear-gradient(90deg,#fca5a5,#fde68a,#a7f3d0,#bfdbfe,#ddd6fe)', 'exotic'],
];

// Conic/gradient avatar frames for top rarities.
const FRAME_GRADIENT_DEFS: GradDef[] = [
  ['emberglow', 'Emberglow', 'conic-gradient(#f97316,#fbbf24,#ef4444,#f97316)', 'legendary'],
  ['glacier', 'Glacier', 'conic-gradient(#38bdf8,#a5f3fc,#e0f2fe,#38bdf8)', 'legendary'],
  ['venom', 'Venom', 'conic-gradient(#22c55e,#a3e635,#16a34a,#22c55e)', 'legendary'],
  ['amethyst', 'Amethyst Halo', 'conic-gradient(#a855f7,#d8b4fe,#7c3aed,#a855f7)', 'legendary'],
  ['solar-flare', 'Solar Flare', 'conic-gradient(#fde047,#fb923c,#ef4444,#fde047)', 'mythic'],
  ['nebula-ring', 'Nebula Ring', 'conic-gradient(#7c3aed,#db2777,#2563eb,#7c3aed)', 'mythic'],
  ['abyssal', 'Abyssal', 'conic-gradient(#0ea5e9,#6366f1,#0284c7,#0ea5e9)', 'mythic'],
  ['prismatic', 'Prismatic Halo', 'conic-gradient(#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa,#f43f5e)', 'exotic'],
  ['eclipse', 'Eclipse', 'conic-gradient(#111827,#a855f7,#111827,#f59e0b,#111827)', 'exotic'],
  ['celestial', 'Celestial', 'conic-gradient(#fde68a,#fca5a5,#a7f3d0,#bfdbfe,#ddd6fe,#fde68a)', 'exotic'],
];

const BADGE_DEFS: EmojiDef[] = [
  // common
  ['sparkle', 'Sparkle', '✨', 'common'], ['rocket', 'Rocket', '🚀', 'common'],
  ['rainbow', 'Rainbow', '🌈', 'common'], ['clover', 'Clover', '🍀', 'common'],
  ['music', 'Music Note', '🎵', 'common'], ['coffee', 'Coffee', '☕', 'common'],
  ['cherry', 'Cherry', '🍒', 'common'], ['sun', 'Sun', '☀️', 'common'],
  ['moon', 'Moon', '🌙', 'common'], ['leaf', 'Leaf', '🍃', 'common'],
  // uncommon
  ['gem', 'Gem', '💠', 'uncommon'], ['trophy', 'Trophy', '🏆', 'uncommon'],
  ['medal', 'Medal', '🥇', 'uncommon'], ['target', 'Bullseye', '🎯', 'uncommon'],
  ['game', 'Gamepad', '🎮', 'uncommon'], ['palette', 'Palette', '🎨', 'uncommon'],
  ['camera', 'Camera', '📷', 'uncommon'], ['book', 'Book', '📚', 'uncommon'],
  ['popcorn', 'Popcorn', '🍿', 'uncommon'], ['guitar', 'Guitar', '🎸', 'uncommon'],
  // rare
  ['comet', 'Comet', '☄️', 'rare'], ['crystal', 'Crystal Ball', '🔮', 'rare'],
  ['lightning', 'Lightning', '🌩️', 'rare'], ['snowflake', 'Snowflake', '❄️', 'rare'],
  ['mushroom', 'Mushroom', '🍄', 'rare'], ['cactus', 'Cactus', '🌵', 'rare'],
  ['anchor', 'Anchor', '⚓', 'rare'], ['compass', 'Compass', '🧭', 'rare'],
  ['feather', 'Feather', '🪶', 'rare'], ['shield', 'Shield', '🛡️', 'rare'],
  // epic
  ['unicorn', 'Unicorn', '🦄', 'epic'], ['volcano', 'Volcano', '🌋', 'epic'],
  ['ringed', 'Ringed Planet', '🪐', 'epic'], ['fireworks', 'Fireworks', '🎆', 'epic'],
  ['skull', 'Skull', '💀', 'epic'], ['alien', 'Alien', '👽', 'epic'],
  ['ninja', 'Ninja', '🥷', 'epic'], ['wizard', 'Wizard', '🧙', 'epic'],
  // legendary
  ['dragon', 'Dragon', '🐉', 'legendary'], ['phoenix', 'Phoenix', '🦅', 'legendary'],
  ['gem-stone', 'Gemstone', '💎', 'legendary'], ['sword', 'Crossed Swords', '⚔️', 'legendary'],
  ['ringbell', 'Glowing Star', '🌟', 'legendary'], ['comet-2', 'Shooting Star', '💫', 'legendary'],
  // mythic
  ['infinity', 'Infinity', '♾️', 'mythic'], ['atom', 'Atom', '⚛️', 'mythic'],
  ['yin-yang', 'Yin Yang', '☯️', 'mythic'], ['trident', 'Trident', '🔱', 'mythic'],
  ['fleur', 'Fleur-de-lis', '⚜️', 'mythic'],
  // exotic
  ['sun-face', 'Radiant Sun', '🌞', 'exotic'], ['milky-way', 'Milky Way', '🌌', 'exotic'],
  ['ouroboros', 'Cyclone', '🌀', 'exotic'], ['supernova', 'Supernova', '🎇', 'exotic'],
  ['black-hole', 'Black Hole', '🕳️', 'exotic'], ['crown-jewel', 'Jewel Crown', '👑', 'exotic'],
];

const PET_DEFS: EmojiDef[] = [
  // common
  ['dog', 'Puppy', '🐶', 'common'], ['hamster', 'Hamster', '🐹', 'common'],
  ['rabbit', 'Rabbit', '🐰', 'common'], ['chick', 'Chick', '🐤', 'common'],
  ['fish', 'Fish', '🐟', 'common'], ['turtle', 'Turtle', '🐢', 'common'],
  ['frog', 'Frog', '🐸', 'common'], ['bee', 'Bee', '🐝', 'common'],
  ['snail', 'Snail', '🐌', 'common'], ['ladybug', 'Ladybug', '🐞', 'common'],
  // uncommon
  ['fox', 'Fox', '🦊', 'uncommon'], ['panda', 'Panda', '🐼', 'uncommon'],
  ['koala', 'Koala', '🐨', 'uncommon'], ['penguin', 'Penguin', '🐧', 'uncommon'],
  ['owl', 'Owl', '🦉', 'uncommon'], ['hedgehog', 'Hedgehog', '🦔', 'uncommon'],
  ['otter', 'Otter', '🦦', 'uncommon'], ['duck', 'Duck', '🦆', 'uncommon'],
  ['parrot', 'Parrot', '🦜', 'uncommon'], ['pig', 'Piglet', '🐷', 'uncommon'],
  // rare
  ['tiger', 'Tiger Cub', '🐯', 'rare'], ['lion', 'Lion Cub', '🦁', 'rare'],
  ['wolf', 'Wolf', '🐺', 'rare'], ['monkey', 'Monkey', '🐵', 'rare'],
  ['octopus', 'Octopus', '🐙', 'rare'], ['crab', 'Crab', '🦀', 'rare'],
  ['butterfly', 'Butterfly', '🦋', 'rare'], ['peacock', 'Peacock', '🦚', 'rare'],
  ['deer', 'Deer', '🦌', 'rare'], ['swan', 'Swan', '🦢', 'rare'],
  // epic
  ['dino', 'Dino', '🦕', 'epic'], ['t-rex', 'T-Rex', '🦖', 'epic'],
  ['whale', 'Whale', '🐳', 'epic'], ['shark', 'Shark', '🦈', 'epic'],
  ['eagle', 'Eagle', '🦅', 'epic'], ['elephant', 'Elephant', '🐘', 'epic'],
  ['camel', 'Camel', '🐫', 'epic'], ['rhino', 'Rhino', '🦏', 'epic'],
  // legendary
  ['dragon', 'Dragon', '🐉', 'legendary'], ['phoenix', 'Phoenix', '🔥🦅', 'legendary'],
  ['unicorn', 'Unicorn', '🦄', 'legendary'], ['serpent', 'Sea Serpent', '🐍', 'legendary'],
  ['kraken', 'Kraken', '🦑', 'legendary'], ['mammoth', 'Mammoth', '🦣', 'legendary'],
  // mythic
  ['griffin', 'Griffin', '🦅🦁', 'mythic'], ['cerberus', 'Cerberus', '🐺🔥', 'mythic'],
  ['fairy', 'Fairy', '🧚', 'mythic'], ['genie', 'Genie', '🧞', 'mythic'],
  ['merfolk', 'Merfolk', '🧜', 'mythic'],
  // exotic
  ['celestial-dragon', 'Celestial Dragon', '🐲✨', 'exotic'], ['star-whale', 'Star Whale', '🐳🌌', 'exotic'],
  ['void-cat', 'Void Cat', '🐈‍⬛', 'exotic'], ['astral-fox', 'Astral Fox', '🦊✨', 'exotic'],
  ['rift-spirit', 'Rift Spirit', '👁️‍🗨️', 'exotic'], ['cosmic-owl', 'Cosmic Owl', '🦉🌌', 'exotic'],
];

// Banner palette → paired into gradients.
const BANNER_PALETTE: [name: string, hex: string][] = [
  ['Coral', '#ff7f6b'], ['Amber', '#f59e0b'], ['Lime', '#a3e635'], ['Emerald', '#10b981'],
  ['Teal', '#14b8a6'], ['Sky', '#38bdf8'], ['Cobalt', '#2563eb'], ['Indigo', '#6366f1'],
  ['Violet', '#8b5cf6'], ['Orchid', '#a855f7'], ['Magenta', '#d946ef'], ['Rose', '#fb7185'],
  ['Crimson', '#e11d48'], ['Slate', '#64748b'], ['Mint', '#34d399'], ['Gold', '#fbbf24'],
];

// Multi-stop premium banners.
const BANNER_PREMIUM: GradDef[] = [
  ['sunrise', 'Sunrise', 'linear-gradient(135deg,#fde047,#fb923c,#f43f5e)', 'epic'],
  ['deep-sea', 'Deep Sea', 'linear-gradient(135deg,#0c4a6e,#0891b2,#22d3ee)', 'epic'],
  ['forest', 'Forest Canopy', 'linear-gradient(135deg,#14532d,#16a34a,#a3e635)', 'epic'],
  ['twilight', 'Twilight', 'linear-gradient(135deg,#312e81,#7c3aed,#db2777)', 'epic'],
  ['firestorm', 'Firestorm', 'linear-gradient(135deg,#7f1d1d,#ef4444,#fbbf24)', 'legendary'],
  ['northern-lights', 'Northern Lights', 'linear-gradient(135deg,#064e3b,#22d3ee,#a78bfa)', 'legendary'],
  ['cosmos', 'Cosmos', 'linear-gradient(135deg,#1e1b4b,#7c3aed,#2563eb,#db2777)', 'mythic'],
  ['spectra', 'Spectra', 'linear-gradient(135deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)', 'exotic'],
];

// Premium themes — decorative ownership ("bragging rights"); each carries a
// preview gradient + a stable themeId label.
const THEME_DEFS: GradDef[] = [
  ['sunset-blvd', 'Sunset Boulevard', 'linear-gradient(135deg,#f97316,#db2777)', 'rare'],
  ['mint-chip', 'Mint Chip', 'linear-gradient(135deg,#10b981,#a7f3d0)', 'rare'],
  ['blueprint', 'Blueprint', 'linear-gradient(135deg,#0c4a6e,#38bdf8)', 'rare'],
  ['rose-quartz', 'Rose Quartz', 'linear-gradient(135deg,#fb7185,#fbcfe8)', 'rare'],
  ['graphite', 'Graphite', 'linear-gradient(135deg,#1f2937,#4b5563)', 'rare'],
  ['marmalade', 'Marmalade', 'linear-gradient(135deg,#f59e0b,#fde047)', 'rare'],
  ['lagoon', 'Lagoon', 'linear-gradient(135deg,#0891b2,#34d399)', 'rare'],
  ['plum', 'Plum', 'linear-gradient(135deg,#581c87,#a855f7)', 'rare'],
  ['ember', 'Ember', 'linear-gradient(135deg,#7f1d1d,#f97316)', 'epic'],
  ['arctic', 'Arctic', 'linear-gradient(135deg,#0e7490,#a5f3fc)', 'epic'],
  ['meadow', 'Meadow', 'linear-gradient(135deg,#166534,#a3e635)', 'epic'],
  ['orchid-dream', 'Orchid Dream', 'linear-gradient(135deg,#7c3aed,#f0abfc)', 'epic'],
  ['copper', 'Copper', 'linear-gradient(135deg,#7c2d12,#fb923c)', 'epic'],
  ['storm', 'Storm', 'linear-gradient(135deg,#1e293b,#64748b)', 'epic'],
  ['flamingo', 'Flamingo', 'linear-gradient(135deg,#db2777,#fda4af)', 'epic'],
  ['matcha', 'Matcha', 'linear-gradient(135deg,#3f6212,#bef264)', 'epic'],
  ['neon-city', 'Neon City', 'linear-gradient(135deg,#0f172a,#22d3ee,#db2777)', 'legendary'],
  ['golden-hour', 'Golden Hour', 'linear-gradient(135deg,#b45309,#fbbf24,#fde68a)', 'legendary'],
  ['deep-space', 'Deep Space', 'linear-gradient(135deg,#020617,#4338ca,#7c3aed)', 'legendary'],
  ['coral-reef', 'Coral Reef', 'linear-gradient(135deg,#0e7490,#f97316,#fde047)', 'legendary'],
  ['royal', 'Royal', 'linear-gradient(135deg,#1e1b4b,#6d28d9,#fbbf24)', 'legendary'],
  ['cyberpunk', 'Cyberpunk', 'linear-gradient(135deg,#831843,#22d3ee,#fde047)', 'mythic'],
  ['nebula', 'Nebula', 'linear-gradient(135deg,#3b0764,#db2777,#2563eb)', 'mythic'],
  ['inferno', 'Inferno', 'linear-gradient(135deg,#450a0a,#ef4444,#fbbf24)', 'mythic'],
  ['bioluminescence', 'Bioluminescence', 'linear-gradient(135deg,#042f2e,#22d3ee,#a3e635)', 'mythic'],
  ['prism-break', 'Prism Break', 'linear-gradient(135deg,#f43f5e,#fbbf24,#34d399,#38bdf8,#a78bfa)', 'exotic'],
  ['event-horizon', 'Event Horizon', 'linear-gradient(135deg,#000000,#7c3aed,#f59e0b)', 'exotic'],
  ['iridescence', 'Iridescence', 'linear-gradient(135deg,#fca5a5,#fde68a,#a7f3d0,#bfdbfe,#ddd6fe)', 'exotic'],
];

// Extra theme names to round the category past 50 (cycled gradients).
const THEME_EXTRA_NAMES: [name: string, rarity: Rarity][] = [
  ['Sandstone', 'rare'], ['Lilac', 'rare'], ['Pistachio', 'rare'], ['Denim', 'rare'],
  ['Terracotta', 'rare'], ['Seaglass', 'rare'], ['Mulberry', 'rare'], ['Honeycomb', 'rare'],
  ['Slate Blue', 'uncommon'], ['Moss', 'uncommon'], ['Clay', 'uncommon'], ['Frost', 'uncommon'],
  ['Cocoa', 'uncommon'], ['Peony', 'uncommon'], ['Harbor', 'uncommon'], ['Dune', 'uncommon'],
  ['Velvet', 'epic'], ['Obsidian', 'epic'], ['Aurora Veil', 'epic'], ['Solstice', 'epic'],
  ['Mirage', 'legendary'], ['Eventide', 'legendary'], ['Stargaze', 'legendary'],
  ['Quantum', 'mythic'], ['Singularity', 'exotic'],
];

const THEME_GRADIENT_POOL = THEME_DEFS.map((d) => d[2]);

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildGenerated(): ShopItem[] {
  const out: ShopItem[] = [];

  // Name colors: solids + gradients.
  for (const [slug, name, color, rarity] of COLOR_DEFS) {
    out.push({ id: `color.x.${slug}`, kind: 'NAME_COLOR', name, description: `${name} name color.`, price: PRICE[rarity], rarity, data: { color } });
  }
  for (const [slug, name, gradient, rarity] of COLOR_GRADIENT_DEFS) {
    out.push({ id: `color.x.${slug}`, kind: 'NAME_COLOR', name, description: `${name} gradient name color.`, price: PRICE[rarity], rarity, data: { gradient } });
  }

  // Avatar frames: solid rings (reuse palette) + gradient halos.
  for (const [slug, name, color, rarity] of COLOR_DEFS) {
    out.push({ id: `frame.x.${slug}`, kind: 'AVATAR_FRAME', name: `${name} Ring`, description: `A ${name.toLowerCase()} avatar ring.`, price: PRICE[rarity], rarity, data: { color } });
  }
  for (const [slug, name, gradient, rarity] of FRAME_GRADIENT_DEFS) {
    out.push({ id: `frame.x.${slug}`, kind: 'AVATAR_FRAME', name, description: `A ${name.toLowerCase()} avatar frame.`, price: PRICE[rarity], rarity, data: { gradient } });
  }

  // Post flair: solid edges (reuse palette) + gradient edges.
  for (const [slug, name, color, rarity] of COLOR_DEFS) {
    out.push({ id: `flair.x.${slug}`, kind: 'POST_FLAIR', name: `${name} Edge`, description: `A ${name.toLowerCase()} edge on your posts.`, price: PRICE[rarity], rarity, data: { className: 'flair-solid', color } });
  }
  for (const [slug, name, gradient, rarity] of COLOR_GRADIENT_DEFS) {
    out.push({ id: `flair.x.${slug}`, kind: 'POST_FLAIR', name: `${name} Edge`, description: `A ${name.toLowerCase()} edge on your posts.`, price: PRICE[rarity], rarity, data: { className: 'flair-gradient', gradient } });
  }

  // Badges + pets (emoji).
  for (const [slug, name, emoji, rarity] of BADGE_DEFS) {
    out.push({ id: `badge.x.${slug}`, kind: 'BADGE', name, description: `A ${name.toLowerCase()} badge.`, price: PRICE[rarity], rarity, data: { emoji } });
  }
  for (const [slug, name, emoji, rarity] of PET_DEFS) {
    out.push({ id: `pet.x.${slug}`, kind: 'PET', name, description: `A ${name.toLowerCase()} companion.`, price: PRICE[rarity], rarity, data: { emoji } });
  }

  // Banners: pair the palette at a few offsets, plus premium multi-stops.
  const n = BANNER_PALETTE.length;
  const offsets = [1, 5, 8];
  let bi = 0;
  for (const off of offsets) {
    for (let i = 0; i < n; i++) {
      const [aName, aHex] = BANNER_PALETTE[i];
      const [bName, bHex] = BANNER_PALETTE[(i + off) % n];
      // Rarity rises with each offset pass.
      const rarity: Rarity = off === 1 ? 'common' : off === 5 ? 'uncommon' : 'rare';
      out.push({
        id: `banner.x.b${bi}`,
        kind: 'BANNER',
        name: `${aName} → ${bName}`,
        description: `A ${aName.toLowerCase()}-to-${bName.toLowerCase()} gradient banner.`,
        price: PRICE[rarity],
        rarity,
        data: { gradient: `linear-gradient(135deg,${aHex},${bHex})` },
      });
      bi++;
    }
  }
  for (const [slug, name, gradient, rarity] of BANNER_PREMIUM) {
    out.push({ id: `banner.x.${slug}`, kind: 'BANNER', name, description: `A ${name.toLowerCase()} gradient banner.`, price: PRICE[rarity], rarity, data: { gradient } });
  }

  // Themes: curated gradients + extra names (cycled gradients).
  for (const [slug, name, gradient, rarity] of THEME_DEFS) {
    out.push({ id: `theme.x.${slug}`, kind: 'THEME', name, description: `The ${name} premium theme.`, price: PRICE[rarity], rarity, data: { themeId: slug, gradient } });
  }
  THEME_EXTRA_NAMES.forEach(([name, rarity], i) => {
    const slug = slugify(name);
    out.push({
      id: `theme.x.${slug}`,
      kind: 'THEME',
      name,
      description: `The ${name} premium theme.`,
      price: PRICE[rarity],
      rarity,
      data: { themeId: slug, gradient: THEME_GRADIENT_POOL[i % THEME_GRADIENT_POOL.length] },
    });
  });

  return out;
}

const GENERATED_ITEMS = buildGenerated();

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
