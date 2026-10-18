// House Always Wins New Game+ (R19). After a clear, a second run with the
// room entities remixed from a seed and one House rule, on its own save slot.
// Pure logic + a tiny localStorage record; the zustand store picks its slot
// from here at creation time.
import type { EntitySpec } from './types';

const META_KEY = 'haw-meta-v1';

export type Slot = 'main' | 'ngplus';
export type HouseRule = 'fastLasers' | 'highStakes';
export const HOUSE_RULES: readonly HouseRule[] = ['fastLasers', 'highStakes'];

export interface NgMeta {
  cleared: boolean;
  slot: Slot;
  seed: number;
  rule: HouseRule;
  /** NG+ cycles started. */
  cycles: number;
}

const DEFAULT: NgMeta = { cleared: false, slot: 'main', seed: 1, rule: 'fastLasers', cycles: 0 };

/** Endings that count as a clear (you got out; "walk away" and a lost gamble do not). */
export const CLEAR_ENDINGS = ['settled', 'gamble_win'];

export function readMeta(): NgMeta {
  if (typeof window === 'undefined') return DEFAULT;
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<NgMeta> | null;
    if (!raw) return DEFAULT;
    return {
      cleared: raw.cleared === true,
      slot: raw.slot === 'ngplus' && raw.cleared === true ? 'ngplus' : 'main',
      seed: Number.isInteger(raw.seed) ? (raw.seed as number) : 1,
      rule: HOUSE_RULES.includes(raw.rule as HouseRule) ? (raw.rule as HouseRule) : 'fastLasers',
      cycles: Number.isInteger(raw.cycles) ? (raw.cycles as number) : 0,
    };
  } catch {
    return DEFAULT;
  }
}

function writeMeta(meta: NgMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable: NG+ simply isn't offered */
  }
}

export const slotStorageName = (slot: Slot) =>
  slot === 'ngplus' ? 'haw-ngplus-v1' : 'haw-save-v2';
export const activeSlot = (): Slot => readMeta().slot;
/** The rule in force: only while playing the NG+ slot. */
export const activeRule = (): HouseRule | null => {
  const m = readMeta();
  return m.slot === 'ngplus' ? m.rule : null;
};

export function markCleared(): void {
  const m = readMeta();
  if (!m.cleared) writeMeta({ ...m, cleared: true });
}

/** Begin a fresh NG+ run: new seed, next rule, empty NG+ slot. Caller reloads. */
export function startNewGamePlus(): void {
  const m = readMeta();
  const seed = (Math.floor(Math.random() * 2 ** 31) + 1) | 0;
  try {
    localStorage.removeItem(slotStorageName('ngplus'));
  } catch {
    /* ignore */
  }
  writeMeta({
    ...m,
    cleared: true,
    slot: 'ngplus',
    seed,
    rule: HOUSE_RULES[Math.abs(seed) % HOUSE_RULES.length],
    cycles: m.cycles + 1,
  });
}

export function switchSlot(slot: Slot): void {
  const m = readMeta();
  if (slot === 'ngplus' && !m.cleared) return;
  writeMeta({ ...m, slot });
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Remix a room's entities from the run seed. Chips swap among the room's own
 * chip positions (every one was already reachable), and laser timing is
 * nudged. Keys, relics, levers and everything the route depends on stay put.
 */
export function remixEntities(roomId: string, specs: EntitySpec[], seed: number): EntitySpec[] {
  const rng = mulberry32((seed ^ hash(roomId)) >>> 0);
  const chips = specs.filter((s) => s.kind === 'chip');
  const spots = chips.map((c) => ({ col: c.col, row: c.row }));
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  let chipIndex = 0;
  return specs.map((s) => {
    if (s.kind === 'chip') return { ...s, ...spots[chipIndex++] };
    if (s.kind === 'laser')
      return { ...s, phase: ((((s.phase ?? 0) + (rng() - 0.5) * 0.3) % 1) + 1) % 1 };
    return s;
  });
}
