// ─── Sprite Pack Registry ─────────────────────────────────────────────────────
// The curated pool of anime VN character sprite packs. Each pack is a distinct
// character look (Sutemo art) with a full expression set. The cast generator
// assigns non-repeating packs per playthrough; the renderer resolves a
// character's current Emotion to the right sprite file in their pack.
//
// Packs come from two sources:
//   1. packs/hf01..hf10  — composited from the Halfbody Female PSD (gen_packs.py)
//   2. the original hand-composited sets (luna, kai, …) already in this repo
//
// Faces are grouped by `face` so a single cast can be biased toward visual
// distinctness. Adding packs = append here (+ generate the images).

import type { Emotion } from '../gen/world-types';
import { asset } from '@/lib/storage/asset';

const BASE = asset('/sprites/versecraft');

export type Presentation = 'feminine' | 'masculine' | 'neutral';
export type AgeBand = 'young' | 'adult' | 'mature';

export interface SpritePack {
  id: string;
  name: string;
  /** Directory under /sprites/versecraft (e.g. "packs/hf01" or "luna"). */
  dir: string;
  /** Face-family id — packs sharing a face look alike apart from hair/outfit. */
  face: string;
  presentation: Presentation;
  age: AgeBand;
  hairColor: string;
  hairStyle: string;
  /** UI accent hex derived from hair/outfit. */
  accent: string;
  /** File extension for this pack's images (webp for composited packs). */
  ext?: 'png' | 'webp';
  /** Canonical Emotion → sprite filename (no extension). */
  emotions: Record<Emotion, string>;
}

const HAIR_HEX: Record<string, string> = {
  black: '#3a3340', brown: '#7b4b2a', silver: '#b8bcc8', blonde: '#e3c57a',
  pink: '#e08bb0', red: '#b5462e', blue: '#3f8bc4', purple: '#9b6bcb', green: '#3fa07a',
};

// ─── Emotion → file maps per expression family ───────────────────────────────

/** Halfbody Female packs (hf01..hf10, and the legacy "rowan" set is compatible). */
const HF_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile_2', joyful: 'happy_1', sad: 'sad', crying: 'sad_2',
  angry: 'angry', annoyed: 'annoyed', surprised: 'surprised', afraid: 'scared',
  nervous: 'awkward', blush: 'blush', smirk: 'smug', thoughtful: 'normal',
  confident: 'smile_1', tired: 'annoyed_2', hurt: 'sad_2',
};

/** Legacy full-body Female sets (luna, kai, sable, wren): 11 expressions. */
const FBF_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile', joyful: 'happy', sad: 'sad', crying: 'sad',
  angry: 'angry', annoyed: 'annoyed', surprised: 'shocked', afraid: 'shocked',
  nervous: 'sleepy', blush: 'smile2', smirk: 'smirk', thoughtful: 'sleepy',
  confident: 'smirk', tired: 'sleepy', hurt: 'sad',
};

/** Legacy "rowan" halfbody set: 16 expressions. */
const ROWAN_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile', joyful: 'happy2', sad: 'sad', crying: 'sad2',
  angry: 'angry', annoyed: 'annoyed', surprised: 'surprised', afraid: 'scared',
  nervous: 'awkward', blush: 'smile2', smirk: 'smirk', thoughtful: 'smile3',
  confident: 'smile2', tired: 'sad2', hurt: 'sad2',
};

/** Legacy male set (milo): 11 expressions. */
const MALE_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile', joyful: 'laugh', sad: 'sad', crying: 'sad',
  angry: 'angry', annoyed: 'angry2', surprised: 'surprised', afraid: 'surprised',
  nervous: 'sweat', blush: 'sweat', smirk: 'smirk', thoughtful: 'smile2',
  confident: 'smile3', tired: 'sad', hurt: 'sad',
};

/** Legacy mature set (teacher): 16 expressions. */
const MATURE_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile', joyful: 'happy2', sad: 'sad', crying: 'crying',
  angry: 'angry', annoyed: 'annoyed', surprised: 'shocked', afraid: 'oh',
  nervous: 'sleepy2', blush: 'smile2', smirk: 'smirk', thoughtful: 'sleepy',
  confident: 'smirk2', tired: 'sleepy', hurt: 'sad',
};

/** Mature Woman packs (mw01..mw06): 16 expressions, older face family. */
const MW_EMO: Record<Emotion, string> = {
  neutral: 'normal', happy: 'smile', joyful: 'delighted', sad: 'sad', crying: 'crying',
  angry: 'angry_1', annoyed: 'annoyed', surprised: 'shocked', afraid: 'o',
  nervous: 'sleepy_2', blush: 'delighted_2', smirk: 'smug', thoughtful: 'sleepy',
  confident: 'smug_2', tired: 'sleepy_2', hurt: 'sad',
};

/** Hoshiko uniform set: 6 expressions. */
const HOSHIKO_EMO: Record<Emotion, string> = {
  neutral: 'smile', happy: 'smile', joyful: 'smile', sad: 'sad', crying: 'sad',
  angry: 'upset', annoyed: 'upset', surprised: 'surprised', afraid: 'surprised',
  nervous: 'embarrassed2', blush: 'embarrassed1', smirk: 'smile', thoughtful: 'sad',
  confident: 'smile', tired: 'sad', hurt: 'sad',
};

// ─── Pack definitions ─────────────────────────────────────────────────────────

interface HfSeed { id: string; color: string; style: string; pres: Presentation; }
const HF_SEEDS: HfSeed[] = [
  { id: 'hf01', color: 'black',  style: 'hime',     pres: 'feminine' },
  { id: 'hf02', color: 'brown',  style: 'wavy',     pres: 'feminine' },
  { id: 'hf03', color: 'silver', style: 'straight', pres: 'feminine' },
  { id: 'hf04', color: 'pink',   style: 'long',     pres: 'feminine' },
  { id: 'hf05', color: 'blonde', style: 'hime',     pres: 'feminine' },
  { id: 'hf06', color: 'silver', style: 'wavy',     pres: 'neutral'  },
  { id: 'hf07', color: 'pink',   style: 'straight', pres: 'feminine' },
  { id: 'hf08', color: 'brown',  style: 'long',     pres: 'feminine' },
  { id: 'hf09', color: 'pink',   style: 'hime',     pres: 'neutral'  },
  { id: 'hf10', color: 'black',  style: 'wavy',     pres: 'feminine' },
];

function hfPack(s: HfSeed): SpritePack {
  return {
    id: s.id, name: `Halfbody ${s.color} ${s.style}`, dir: `packs/${s.id}`,
    face: 'hf_female', presentation: s.pres, age: 'young',
    hairColor: s.color, hairStyle: s.style, accent: HAIR_HEX[s.color] ?? '#c4a35a',
    ext: 'webp', emotions: HF_EMO,
  };
}

interface MwSeed { id: string; color: string; style: string; }
const MW_SEEDS: MwSeed[] = [
  { id: 'mw01', color: 'silver', style: 'hime' },
  { id: 'mw02', color: 'brown',  style: 'curl' },
  { id: 'mw03', color: 'black',  style: 'short' },
  { id: 'mw04', color: 'blonde', style: 'mid_part' },
  { id: 'mw05', color: 'pink',   style: 'side_curl' },
  { id: 'mw06', color: 'silver', style: 'long_curl' },
];

function mwPack(s: MwSeed): SpritePack {
  return {
    id: s.id, name: `Mature ${s.color} ${s.style}`, dir: `packs/${s.id}`,
    face: 'mw_mature', presentation: 'feminine', age: 'mature',
    hairColor: s.color, hairStyle: s.style, accent: HAIR_HEX[s.color] ?? '#a08458',
    ext: 'webp', emotions: MW_EMO,
  };
}

export const SPRITE_PACKS: SpritePack[] = [
  ...HF_SEEDS.map(hfPack),
  ...MW_SEEDS.map(mwPack),
  // Legacy full-body female sets — same face, distinct hair/outfit.
  { id: 'luna', name: 'Luna (gothic)', dir: 'luna', face: 'fb_female', presentation: 'feminine', age: 'young', hairColor: 'black', hairStyle: 'hime', accent: '#4A3B6B', emotions: FBF_EMO },
  { id: 'kai', name: 'Kai (bob)', dir: 'kai', face: 'fb_female', presentation: 'neutral', age: 'young', hairColor: 'pink', hairStyle: 'bob', accent: '#FF4D4D', emotions: FBF_EMO },
  { id: 'sable', name: 'Sable (short)', dir: 'sable', face: 'fb_female', presentation: 'feminine', age: 'adult', hairColor: 'brown', hairStyle: 'short', accent: '#D4A017', emotions: FBF_EMO },
  { id: 'wren', name: 'Wren (twintail)', dir: 'wren', face: 'fb_female', presentation: 'neutral', age: 'young', hairColor: 'silver', hairStyle: 'twintail', accent: '#E8A0BF', emotions: FBF_EMO },
  // Legacy halfbody / male / mature / hoshiko — distinct faces.
  { id: 'rowan', name: 'Rowan', dir: 'rowan', face: 'hf_female', presentation: 'masculine', age: 'young', hairColor: 'blonde', hairStyle: 'style4', accent: '#5B8C5A', emotions: ROWAN_EMO },
  { id: 'milo', name: 'Milo (male)', dir: 'milo', face: 'sutemo_male', presentation: 'masculine', age: 'young', hairColor: 'brown', hairStyle: 'short', accent: '#2C3E6B', emotions: MALE_EMO },
  { id: 'teacher', name: 'Mature', dir: 'teacher', face: 'mature', presentation: 'feminine', age: 'mature', hairColor: 'silver', hairStyle: 'curly', accent: '#7B5AA0', emotions: MATURE_EMO },
  { id: 'hoshiko', name: 'Hoshiko', dir: 'hoshiko', face: 'hoshiko', presentation: 'feminine', age: 'young', hairColor: 'brown', hairStyle: 'long', accent: '#C46A8A', emotions: HOSHIKO_EMO },
];

const PACK_BY_ID = new Map(SPRITE_PACKS.map((p) => [p.id, p]));

export function getPack(id: string): SpritePack | null {
  return PACK_BY_ID.get(id) ?? null;
}

/** Resolve the sprite image URL for a pack + emotion (falls back to neutral). */
export function spriteUrl(packId: string, emotion: Emotion = 'neutral'): string | null {
  const pack = PACK_BY_ID.get(packId);
  if (!pack) return null;
  const file = pack.emotions[emotion] ?? pack.emotions.neutral;
  return `${BASE}/${pack.dir}/${file}.${pack.ext ?? 'png'}`;
}
