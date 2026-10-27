/**
 * Unusual effects, as the builder draws them.
 *
 * The game's effects are particle systems in its own engine format; the builder cannot run those.
 * What it does instead is read the effect's NAME and draw a particle effect of the same character
 * (flames for "Burning Flames", drifting smoke for "Haunted Ghosts", sparks for "Electrostatic", and so
 * on) in the colours the name asks for. It is an approximation, and the interface says so. This
 * module only decides what to draw; `components/tf2-hud/loadout/EffectParticles.tsx` draws it.
 */

import type { EffectPlacement, ItemSlot } from './catalog-types';

export type EffectKind =
  | 'flame'
  | 'smoke'
  | 'electric'
  | 'sparkle'
  | 'snow'
  | 'bubble'
  | 'leaf'
  | 'orbit'
  | 'glow';

export interface EffectProfile {
  kind: EffectKind;
  /** Two colours the particles blend between. */
  colors: [string, string];
  /** Particles on screen (kept small: phones draw this too). */
  count: number;
}

const KINDS: [EffectKind, RegExp][] = [
  ['flame', /burn|flame|fire|scorch|inferno|blaze|ember|magma|lava|cauldron|hot\b|molten/i],
  ['electric', /electro|lightning|plasma|static|energy|storm|zap|shock|neon|volt|spark/i],
  ['smoke', /smok|ghost|haunt|spectr|soul|spook|mist|fog|cloud|vapo|ash|shadow|dark/i],
  ['snow', /snow|frost|ice|frozen|winter|blizzard|chill|cold|flurr/i],
  ['bubble', /bubble|ocean|aqua|water|sea|rain|drip|splash/i],
  ['leaf', /leaf|leaves|nature|harvest|autumn|forest|petal|bloom|flower|clover/i],
  ['orbit', /orbit|halo|ring|atomic|vortex|swirl|spiral|circle|galax|cosmic|planet/i],
  ['sparkle', /sparkl|shimmer|glitter|star|dust|aurora|magic|twinkle|glow|shine|bright|divine|holy/i],
];

const PALETTE: [RegExp, string][] = [
  [/purple|violet|amethyst|royal/i, '#9b59d0'],
  [/pink|rose|magenta|candy/i, '#ff6fb5'],
  [/red|crimson|ruby|blood/i, '#e0382f'],
  [/orange|amber|tangerine/i, '#ff8a1f'],
  [/gold|yellow|sun|honey|lemon/i, '#ffd23c'],
  [/green|emerald|lime|toxic|slime|acid/i, '#52d65a'],
  [/teal|cyan|turquoise|aqua/i, '#35d6d0'],
  [/blue|azure|sapphire|cobalt|ice|frost/i, '#4a9bff'],
  [/white|snow|pearl|silver|ghost/i, '#f2f2f2'],
  [/black|dark|shadow|void|coal/i, '#5a5266'],
];

const DEFAULT_COLORS: Record<EffectKind, [string, string]> = {
  flame: ['#ff7a1a', '#ffd23c'],
  smoke: ['#9aa0b4', '#5d6275'],
  electric: ['#7fd0ff', '#d7f1ff'],
  sparkle: ['#ffe27a', '#fff6cf'],
  snow: ['#e8f3ff', '#a9d4ff'],
  bubble: ['#7cc7ff', '#d3efff'],
  leaf: ['#8ccf4f', '#d9a441'],
  orbit: ['#b58bff', '#7fd0ff'],
  glow: ['#ffd23c', '#ffffff'],
};

/** A small stable hash so the same effect always looks the same. */
const hash = (n: number): number => (Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0) / 4294967296;

const hsl = (h: number, s: number, l: number): string => `hsl(${Math.round(h * 360)} ${s}% ${l}%)`;

export function effectProfile(name: string, id: number): EffectProfile {
  const kind = KINDS.find(([, re]) => re.test(name))?.[0] ?? 'glow';
  const named = PALETTE.find(([re]) => re.test(name))?.[1];
  let colors = DEFAULT_COLORS[kind];
  if (named) colors = [named, kind === 'smoke' ? '#c9ccd8' : '#ffffff'];
  else if (kind === 'glow') {
    // No keyword to go on: a stable colour of its own, so unrelated effects do not all look alike.
    const h = hash(id);
    colors = [hsl(h, 80, 62), hsl((h + 0.08) % 1, 90, 78)];
  }
  const count = kind === 'smoke' || kind === 'snow' || kind === 'leaf' ? 70 : kind === 'orbit' ? 48 : 90;
  return { kind, colors, count };
}

/**
 * Where an effect sits when the player has not moved it, as fractions of the item's own size from its
 * centre. A hat's effect crowns it; a misc item's hangs about it; a taunt's surrounds the player.
 */
export function defaultPlacement(slot: ItemSlot | 'cosmetic'): Required<EffectPlacement> {
  if (slot === 'head') return { x: 0, y: 0.55, z: 0, s: 1 };
  if (slot === 'taunt') return { x: 0, y: 0, z: 0, s: 1 };
  return { x: 0, y: 0.15, z: 0, s: 1 };
}

const clamp = (v: unknown, lo: number, hi: number, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** A complete, in-range placement from whatever was saved (possibly nothing). */
export function resolvePlacement(
  saved: EffectPlacement | undefined,
  slot: ItemSlot | 'cosmetic',
): Required<EffectPlacement> {
  const d = defaultPlacement(slot);
  return {
    x: clamp(saved?.x, -2, 2, d.x),
    y: clamp(saved?.y, -2, 2, d.y),
    z: clamp(saved?.z, -2, 2, d.z),
    s: clamp(saved?.s, 0.25, 4, d.s),
  };
}

/** Only what differs from the default is worth saving. */
export function compactPlacement(
  p: Required<EffectPlacement>,
  slot: ItemSlot | 'cosmetic',
): EffectPlacement | undefined {
  const d = defaultPlacement(slot);
  const out: EffectPlacement = {};
  for (const k of ['x', 'y', 'z', 's'] as const) {
    if (Math.abs(p[k] - d[k]) > 1e-3) out[k] = Math.round(p[k] * 1000) / 1000;
  }
  return Object.keys(out).length ? out : undefined;
}

export const WEAR_NAMES = [
  'Factory New',
  'Minimal Wear',
  'Field-Tested',
  'Well-Worn',
  'Battle Scarred',
] as const;
