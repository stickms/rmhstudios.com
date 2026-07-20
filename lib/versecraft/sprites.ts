// ─── Sprite Mapping ─────────────────────────────────────────────────────────
// Maps character IDs to their sprite directory and expression → filename lookup.
// Expression names used in dialogue scripts are mapped to the closest available
// sprite file from the downloaded packs.

import type { SpritePack } from './types';
import { asset } from '@/lib/storage/asset';

const SPRITE_BASE = asset('/sprites/versecraft');

/** Available sprite filenames per character (without .webp extension).
 *  Generated from Sutemo PSD packs via generate_sprites.py */
const SPRITE_FILES: Record<string, string[]> = {
  // Full body (Sutemo Female) - 11 expressions each
  luna: [
    'normal',
    'smile',
    'happy',
    'sad',
    'angry',
    'smirk',
    'annoyed',
    'shocked',
    'sleepy',
    'smile2',
    'laugh',
  ],
  sable: [
    'normal',
    'smile',
    'happy',
    'sad',
    'angry',
    'smirk',
    'annoyed',
    'shocked',
    'sleepy',
    'smile2',
    'laugh',
  ],
  wren: [
    'normal',
    'smile',
    'happy',
    'sad',
    'angry',
    'smirk',
    'annoyed',
    'shocked',
    'sleepy',
    'smile2',
    'laugh',
  ],
  kai: [
    'normal',
    'smile',
    'happy',
    'sad',
    'angry',
    'smirk',
    'annoyed',
    'shocked',
    'sleepy',
    'smile2',
    'laugh',
  ],
  // Halfbody (Sutemo Female) - 16 expressions
  rowan: [
    'normal',
    'smile',
    'smile2',
    'smile3',
    'happy',
    'happy2',
    'awkward',
    'smirk',
    'sad',
    'sad2',
    'annoyed',
    'annoyed2',
    'surprised',
    'surprised2',
    'angry',
    'scared',
  ],
  // Male (Sutemo Male) - 11 expressions
  milo: [
    'normal',
    'smile',
    'smile2',
    'smile3',
    'laugh',
    'surprised',
    'smirk',
    'angry',
    'angry2',
    'sad',
    'sweat',
  ],
  // Mature (Anime Mature Woman) - 16 expressions
  teacher: [
    'normal',
    'smile',
    'smile2',
    'happy',
    'happy2',
    'sad',
    'crying',
    'angry',
    'angry2',
    'smirk',
    'smirk2',
    'annoyed',
    'shocked',
    'oh',
    'sleepy',
    'sleepy2',
  ],
};

/**
 * Maps game expression names (used in dialogue scripts) to the closest
 * available sprite filename for each character.
 * Falls back to 'normal' if no specific mapping exists.
 */
/** Maps game expression names (used in dialogue scripts) to sprite filenames.
 *  Full body chars share the same 11 expressions; halfbody/male/mature have more. */
const FULL_BODY_MAP: Record<string, string> = {
  neutral: 'normal',
  normal: 'normal',
  composed: 'normal',
  contemplative: 'sleepy',
  melancholy: 'sad',
  tender_smile: 'smile',
  slight_smile: 'smile2',
  genuine_smile: 'happy',
  analytical: 'annoyed',
  smirk: 'smirk',
  disapproving: 'annoyed',
  manic_grin: 'laugh',
  intense: 'angry',
  frustrated: 'angry',
  happy: 'happy',
  sad: 'sad',
  angry: 'angry',
  blush: 'smile2',
  talk: 'smile',
  shocked: 'shocked',
  sleepy: 'sleepy',
  laugh: 'laugh',
};

const EXPRESSION_MAP: Record<string, Record<string, string>> = {
  luna: { ...FULL_BODY_MAP, contemplative: 'sleepy', smirk: 'smirk', blush: 'smile2' },
  sable: { ...FULL_BODY_MAP, contemplative: 'annoyed', smirk: 'smirk' },
  wren: { ...FULL_BODY_MAP, contemplative: 'sad', blush: 'smile2' },
  kai: { ...FULL_BODY_MAP, contemplative: 'annoyed', smirk: 'smirk', sad: 'sleepy' },
  rowan: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'awkward',
    melancholy: 'sad',
    tender_smile: 'smile',
    slight_smile: 'smile2',
    genuine_smile: 'happy',
    analytical: 'surprised',
    smirk: 'smirk',
    disapproving: 'annoyed',
    manic_grin: 'smile3',
    intense: 'angry',
    frustrated: 'annoyed2',
    happy: 'happy',
    sad: 'sad',
    angry: 'angry',
    blush: 'smile2',
    talk: 'smile',
    surprised: 'surprised',
    shocked: 'surprised2',
    sleepy: 'sad2',
    laugh: 'happy2',
    awkward: 'awkward',
    scared: 'scared',
  },
  milo: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'normal',
    melancholy: 'sad',
    tender_smile: 'smile',
    slight_smile: 'smile2',
    genuine_smile: 'smile3',
    analytical: 'normal',
    smirk: 'smirk',
    disapproving: 'angry',
    manic_grin: 'laugh',
    intense: 'angry2',
    frustrated: 'angry',
    happy: 'smile',
    sad: 'sad',
    angry: 'angry',
    blush: 'sweat',
    talk: 'smile',
    surprised: 'surprised',
    shocked: 'surprised',
    sleepy: 'sad',
    laugh: 'laugh',
    sweat: 'sweat',
  },
  teacher: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'sleepy',
    melancholy: 'sad',
    tender_smile: 'smile',
    slight_smile: 'smile2',
    genuine_smile: 'happy',
    analytical: 'annoyed',
    smirk: 'smirk',
    disapproving: 'annoyed',
    manic_grin: 'smirk2',
    intense: 'angry',
    frustrated: 'angry2',
    happy: 'happy',
    sad: 'sad',
    angry: 'angry',
    blush: 'smile2',
    talk: 'smile',
    surprised: 'shocked',
    shocked: 'shocked',
    sleepy: 'sleepy',
    laugh: 'happy2',
    crying: 'crying',
    oh: 'oh',
  },
};

// ─── Hoshiko Alternate Pack ──────────────────────────────────────────────────
// Hoshiko is a single female character with 6 expressions.
// When selected, ALL characters use Hoshiko sprites (for a uniform look).

const HOSHIKO_FILES = ['embarrassed1', 'embarrassed2', 'sad', 'smile', 'surprised', 'upset'];

const HOSHIKO_EXPRESSION_MAP: Record<string, string> = {
  neutral: 'smile',
  normal: 'smile',
  composed: 'smile',
  contemplative: 'sad',
  melancholy: 'sad',
  tender_smile: 'smile',
  slight_smile: 'smile',
  genuine_smile: 'smile',
  analytical: 'surprised',
  smirk: 'smile',
  disapproving: 'upset',
  manic_grin: 'surprised',
  intense: 'upset',
  frustrated: 'upset',
  happy: 'smile',
  sad: 'sad',
  angry: 'upset',
  blush: 'embarrassed1',
  surprised: 'surprised',
  talk: 'smile',
  embarrassed: 'embarrassed1',
};

/** Available sprite packs and their display names */
export const SPRITE_PACKS: { id: SpritePack; name: string; description: string }[] = [
  { id: 'default', name: 'Default', description: 'Unique sprite per character' },
  { id: 'hoshiko', name: 'Hoshiko', description: 'Uniform anime style (by Lia)' },
];

/**
 * Get the sprite image path for a character + expression combo.
 * Falls back to 'normal'/'smile' if the expression isn't mapped.
 */
export function getSpritePath(
  characterId: string,
  expression?: string,
  pack: SpritePack = 'default',
): string | null {
  if (pack === 'hoshiko') {
    const mappedFile = expression ? HOSHIKO_EXPRESSION_MAP[expression] || 'smile' : 'smile';
    const filename = HOSHIKO_FILES.includes(mappedFile) ? mappedFile : 'smile';
    return `${SPRITE_BASE}/hoshiko/${filename}.webp`;
  }

  const files = SPRITE_FILES[characterId];
  if (!files) return null;

  const charMap = EXPRESSION_MAP[characterId];
  if (!charMap) return null;

  const mappedFile = expression ? charMap[expression] || 'normal' : 'normal';
  const filename = files.includes(mappedFile) ? mappedFile : 'normal';

  return `${SPRITE_BASE}/${characterId}/${filename}.webp`;
}

/**
 * Get all available expression names for a character.
 */
export function getAvailableExpressions(characterId: string): string[] {
  return SPRITE_FILES[characterId] || [];
}
