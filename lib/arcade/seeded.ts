/**
 * Seeded-run catalog (E1 daily mutator, E12 shareable seeds). Client-safe.
 *
 * Only games whose SOLO run is a pure function of a seed + options belong here:
 * Laundry Sort (mulberry32 drop schedule) and Dream Rift (seeded danmaku
 * stream). Other "seed" games were checked and left out: Versecraft's seed is an
 * AI story world (no score), Synapse Storm's and Dream Rift co-op seeds are
 * issued by the server per lobby, Lights Out's seed is its own date puzzle.
 */

export const SEEDED_GAME_IDS = ['laundry-sort', 'dream-rift'] as const;
export type SeededGameId = (typeof SEEDED_GAME_IDS)[number];

export interface Modifier {
  id: string;
  label: string;
  /** Option values the game forces for this run. */
  options: Record<string, string | number>;
}

export interface SeededGame {
  id: SeededGameId;
  label: string;
  path: string;
  maxScore: number;
  /** Shortest honest run, ms. */
  minDurationMs: number;
  modifiers: readonly Modifier[];
}

const DR_CHARS: Record<string, string> = {
  bllm: 'Reika',
  mls: 'Mira',
  qln: 'Aoi',
  dyj: 'Midori',
  lmy: 'Hikari',
};
const drMod = (difficulty: string, character: string, label: string): Modifier => ({
  id: `${difficulty}-${character}`,
  label: `${label}: ${difficulty} with ${DR_CHARS[character]}`,
  options: { difficulty, character },
});
const lsMod = (difficulty: string, durationSec: number, label: string): Modifier => ({
  id: `${difficulty}-${durationSec}`,
  label: `${label}: ${difficulty}, ${durationSec}s`,
  options: { difficulty, durationSec },
});

export const SEEDED_GAMES: Record<SeededGameId, SeededGame> = {
  'laundry-sort': {
    id: 'laundry-sort',
    label: 'Laundry Sort',
    path: '/laundry-sort',
    maxScore: 1_000_000,
    minDurationMs: 40_000,
    modifiers: [
      lsMod('frantic', 60, 'Sprint'),
      lsMod('relaxed', 120, 'Marathon'),
      lsMod('standard', 90, 'Standard shift'),
      lsMod('frantic', 120, 'Rush hour'),
    ],
  },
  'dream-rift': {
    id: 'dream-rift',
    label: 'Dream Rift',
    path: '/dream-rift',
    maxScore: 10_000_000,
    minDurationMs: 10_000,
    modifiers: [
      drMod('lunatic', 'bllm', 'Nightmare'),
      drMod('hard', 'mls', 'Witch hunt'),
      drMod('normal', 'qln', 'Frostbite'),
      drMod('hard', 'lmy', 'Lantern run'),
      drMod('easy', 'dyj', 'Garden stroll'),
    ],
  },
};

export function isSeededGame(id: string): id is SeededGameId {
  return (SEEDED_GAME_IDS as readonly string[]).includes(id);
}

/** FNV-1a, folded to uint32. */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function utcDayKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export interface DailyMutator {
  day: string;
  gameId: SeededGameId;
  modifier: Modifier;
  seed: number;
}

/** Deterministic: day index picks the game, then rotates that game's modifiers. */
export function dailyMutator(day: string): DailyMutator {
  const index = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const gameId =
    SEEDED_GAME_IDS[
      ((index % SEEDED_GAME_IDS.length) + SEEDED_GAME_IDS.length) % SEEDED_GAME_IDS.length
    ];
  const mods = SEEDED_GAMES[gameId].modifiers;
  const modIdx = Math.floor(index / SEEDED_GAME_IDS.length);
  const modifier = mods[((modIdx % mods.length) + mods.length) % mods.length];
  return { day, gameId, modifier, seed: hashSeed(`${day}:${gameId}`) };
}

/** Variant id for a shared seed: the options that change the run. */
export function findModifier(gameId: SeededGameId, variant: string): Modifier | undefined {
  const g = SEEDED_GAMES[gameId];
  return g.modifiers.find((m) => m.id === variant) ?? parseVariant(gameId, variant);
}

function parseVariant(gameId: SeededGameId, variant: string): Modifier | undefined {
  const [a, b] = variant.split('-');
  if (gameId === 'laundry-sort') {
    const dur = Number(b);
    if (!['relaxed', 'standard', 'frantic'].includes(a) || ![60, 90, 120].includes(dur))
      return undefined;
    return lsMod(a, dur, 'Shared seed');
  }
  if (!['easy', 'normal', 'hard', 'lunatic'].includes(a) || !(b in DR_CHARS)) return undefined;
  return drMod(a, b, 'Shared seed');
}

export const seedKeyOf = (seed: number, variant: string) => `${seed}:${variant}`;

export function parseSeedKey(key: string): { seed: number; variant: string } | null {
  const m = /^(\d{1,10}):([a-z]+-[a-z0-9]+)$/.exec(key);
  if (!m) return null;
  const seed = Number(m[1]);
  return seed <= 0xffffffff ? { seed, variant: m[2] } : null;
}

export function seedLink(gameId: SeededGameId, seed: number, variant: string, origin = ''): string {
  return `${origin}${SEEDED_GAMES[gameId].path}?seed=${seed}&v=${variant}`;
}
