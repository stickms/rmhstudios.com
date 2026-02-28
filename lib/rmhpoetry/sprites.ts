// ─── Sprite Mapping ─────────────────────────────────────────────────────────
// Maps character IDs to their sprite directory and expression → filename lookup.
// Expression names used in dialogue scripts are mapped to the closest available
// sprite file from the downloaded packs.

import type { SpritePack } from './types';

const SPRITE_BASE = '/sprites/versecraft';

/** Available sprite filenames per character (without .png extension) */
const SPRITE_FILES: Record<string, string[]> = {
  luna: [
    'angry', 'angrytalk', 'blush', 'disgusted', 'evilsmirk', 'frown',
    'happy', 'huh', 'normal', 'normalblush', 'normaltalk', 'pout',
    'poutangry', 'poutangry2', 'sad1', 'sad2', 'sad3', 'sadtalk1', 'sadtalk2',
  ],
  milo: [
    'angry', 'blush', 'happy', 'normal', 'pout', 'sad', 'surprised',
  ],
  rowan: [
    'angry', 'angrytalk', 'angrytalk2', 'clueless', 'happy', 'happyblush',
    'huh', 'normal', 'normalblush', 'normaltalk', 'poker', 'pout', 'tears', 'upset',
  ],
  sable: [
    'angry', 'angrypout', 'angrytalk', 'blush', 'discontent', 'disgusted',
    'huh', 'normal', 'normalblush', 'normaltalk', 'normaltalk2', 'pout', 'sad',
  ],
  kai: [
    'angry', 'angrylaugh', 'angrytalk', 'normal', 'normaltalk', 'smirk', 'straight',
  ],
  wren: [
    'angry', 'angryblush', 'angrytalk', 'disgusted', 'huh', 'inv', 'invblush',
    'normal', 'normalblush', 'normaltalk', 'normaltalk2', 'pout', 'poutangry',
    'poutblush', 'sad',
  ],
};

/**
 * Maps game expression names (used in dialogue scripts) to the closest
 * available sprite filename for each character.
 * Falls back to 'normal' if no specific mapping exists.
 */
const EXPRESSION_MAP: Record<string, Record<string, string>> = {
  luna: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'frown',
    melancholy: 'sad1',
    tender_smile: 'happy',
    slight_smile: 'normalblush',
    genuine_smile: 'happy',
    analytical: 'huh',
    smirk: 'evilsmirk',
    disapproving: 'poutangry',
    manic_grin: 'evilsmirk',
    intense: 'angry',
    frustrated: 'poutangry2',
    happy: 'happy',
    sad: 'sad1',
    angry: 'angry',
    blush: 'blush',
    talk: 'normaltalk',
    disgust: 'disgusted',
  },
  milo: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'normal',
    melancholy: 'sad',
    tender_smile: 'happy',
    slight_smile: 'happy',
    genuine_smile: 'happy',
    analytical: 'normal',
    smirk: 'happy',
    disapproving: 'pout',
    manic_grin: 'surprised',
    intense: 'angry',
    frustrated: 'angry',
    happy: 'happy',
    sad: 'sad',
    angry: 'angry',
    blush: 'blush',
    surprised: 'surprised',
    talk: 'normal',
  },
  rowan: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'poker',
    melancholy: 'upset',
    tender_smile: 'happy',
    slight_smile: 'happyblush',
    genuine_smile: 'happy',
    analytical: 'huh',
    smirk: 'happy',
    disapproving: 'pout',
    manic_grin: 'clueless',
    intense: 'angry',
    frustrated: 'angrytalk',
    happy: 'happy',
    sad: 'tears',
    angry: 'angry',
    blush: 'normalblush',
    talk: 'normaltalk',
    clueless: 'clueless',
  },
  sable: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'discontent',
    melancholy: 'sad',
    tender_smile: 'normalblush',
    slight_smile: 'normalblush',
    genuine_smile: 'blush',
    analytical: 'huh',
    smirk: 'normaltalk',
    disapproving: 'angrypout',
    manic_grin: 'angrytalk',
    intense: 'angry',
    frustrated: 'angrypout',
    happy: 'blush',
    sad: 'sad',
    angry: 'angry',
    blush: 'blush',
    talk: 'normaltalk',
    disgust: 'disgusted',
  },
  kai: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'straight',
    contemplative: 'straight',
    melancholy: 'straight',
    tender_smile: 'smirk',
    slight_smile: 'smirk',
    genuine_smile: 'smirk',
    analytical: 'straight',
    smirk: 'smirk',
    disapproving: 'angry',
    manic_grin: 'angrylaugh',
    intense: 'angrytalk',
    frustrated: 'angry',
    happy: 'smirk',
    sad: 'straight',
    angry: 'angry',
    talk: 'normaltalk',
  },
  wren: {
    neutral: 'normal',
    normal: 'normal',
    composed: 'normal',
    contemplative: 'inv',
    melancholy: 'sad',
    tender_smile: 'normalblush',
    slight_smile: 'invblush',
    genuine_smile: 'normalblush',
    analytical: 'huh',
    smirk: 'normaltalk',
    disapproving: 'poutangry',
    manic_grin: 'normaltalk2',
    intense: 'angry',
    frustrated: 'poutangry',
    happy: 'normalblush',
    sad: 'sad',
    angry: 'angry',
    blush: 'poutblush',
    talk: 'normaltalk',
    disgust: 'disgusted',
  },
};

// ─── Hoshiko Alternate Pack ──────────────────────────────────────────────────
// Hoshiko is a single female character with 6 expressions.
// When selected, ALL characters use Hoshiko sprites (for a uniform look).

const HOSHIKO_FILES = [
  'embarrassed1', 'embarrassed2', 'sad', 'smile', 'surprised', 'upset',
];

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
export function getSpritePath(characterId: string, expression?: string, pack: SpritePack = 'default'): string | null {
  if (pack === 'hoshiko') {
    const mappedFile = expression ? (HOSHIKO_EXPRESSION_MAP[expression] || 'smile') : 'smile';
    const filename = HOSHIKO_FILES.includes(mappedFile) ? mappedFile : 'smile';
    return `${SPRITE_BASE}/hoshiko/${filename}.png`;
  }

  const files = SPRITE_FILES[characterId];
  if (!files) return null;

  const charMap = EXPRESSION_MAP[characterId];
  if (!charMap) return null;

  const mappedFile = expression ? (charMap[expression] || 'normal') : 'normal';
  const filename = files.includes(mappedFile) ? mappedFile : 'normal';

  return `${SPRITE_BASE}/${characterId}/${filename}.png`;
}

/**
 * Get all available expression names for a character.
 */
export function getAvailableExpressions(characterId: string): string[] {
  return SPRITE_FILES[characterId] || [];
}
