/**
 * Manna — the slow resource.
 *
 * One ripens roughly every twenty hours and cannot be rushed with joy. It is
 * spent levelling sources: +1% output per level, and level 1 of four particular
 * sources opens a minigame. That is the entire long game. A player who has
 * "finished" the upgrade tree still has three hundred levels to buy, at a rate
 * the world sets rather than the temple.
 *
 * These are Cookie Clicker's sugar lumps, and the twenty hours are theirs. The
 * number is not arbitrary: it is long enough that you cannot farm it, short
 * enough that a daily player always finds one waiting.
 */
import type { MannaKind, MannaState } from '../types';

/** Base ripening time. Twenty hours, in milliseconds. */
export const MANNA_RIPEN_MS = 20 * 60 * 60 * 1000;

export interface MannaKindDef {
  id: MannaKind;
  name: string;
  icon: string;
  note: string;
  /** How many this one is worth when gathered. */
  yield: number;
  /** Relative likelihood. */
  weight: number;
  /** Multiplies the ripening time. */
  duration: number;
}

export const MANNA_KINDS: MannaKindDef[] = [
  {
    id: 'plain',
    name: 'Plain Manna',
    icon: '🍞',
    note: 'Ordinary. Sufficient. Nobody has ever gone hungry on it.',
    yield: 1,
    weight: 74,
    duration: 1,
  },
  {
    id: 'twin',
    name: 'Twin Manna',
    icon: '🥖',
    note: 'Two where one was measured. Nobody can explain the discrepancy.',
    yield: 2,
    weight: 10,
    duration: 1,
  },
  {
    id: 'gilded',
    name: 'Gilded Manna',
    icon: '🥐',
    note: 'Worth several, and it ripened early on purpose.',
    yield: 3,
    weight: 5,
    duration: 0.75,
  },
  {
    id: 'rich',
    name: 'Rich Manna',
    icon: '🧈',
    note: 'Takes half again as long. Repays it at once.',
    yield: 2,
    weight: 8,
    duration: 1.5,
  },
  {
    id: 'bitter',
    name: 'Bitter Manna',
    icon: '🫓',
    note: 'Ripens fast and gives little. Someone was in a hurry.',
    yield: 1,
    weight: 3,
    duration: 0.5,
  },
];

export const MANNA_KIND_MAP: Record<MannaKind, MannaKindDef> = Object.fromEntries(
  MANNA_KINDS.map((k) => [k.id, k]),
) as Record<MannaKind, MannaKindDef>;

export function createManna(): MannaState {
  return { held: 0, gathered: 0, ripening: 0, kind: 'plain', revealed: false };
}

export function rollMannaKind(random: () => number = Math.random): MannaKind {
  const total = MANNA_KINDS.reduce((sum, k) => sum + k.weight, 0);
  let roll = random() * total;
  for (const kind of MANNA_KINDS) {
    roll -= kind.weight;
    if (roll <= 0) return kind.id;
  }
  return 'plain';
}

/** How long the currently-ripening manna needs, in ms. */
export function ripenDuration(kind: MannaKind, speed: number): number {
  return (MANNA_RIPEN_MS * MANNA_KIND_MAP[kind].duration) / Math.max(0.1, speed);
}

export interface MannaAdvance {
  manna: MannaState;
  /** How many ripened this step, for the toast and the sound. */
  ripened: number;
}

/**
 * Advance the manna. Correct across arbitrary gaps — a week away ripens the
 * right number of them, each rolled independently, rather than one.
 */
export function advanceManna(
  manna: MannaState,
  deltaMs: number,
  speed: number,
  random: () => number = Math.random,
): MannaAdvance {
  if (deltaMs <= 0) return { manna, ripened: 0 };

  let { held, gathered, ripening, kind } = manna;
  let remaining = deltaMs;
  let ripened = 0;

  // Bounded: even a year away only rolls a few hundred times.
  for (let guard = 0; guard < 500; guard++) {
    const needed = ripenDuration(kind, speed) - ripening;
    if (remaining < needed) {
      ripening += remaining;
      break;
    }
    remaining -= needed;
    const kindDef = MANNA_KIND_MAP[kind];
    held += kindDef.yield;
    gathered += kindDef.yield;
    ripened += kindDef.yield;
    ripening = 0;
    kind = rollMannaKind(random);
  }

  return {
    manna: { ...manna, held, gathered, ripening, kind, revealed: manna.revealed || gathered > 0 },
    ripened,
  };
}

/**
 * Manna needed to raise a source from `level` to `level + 1`. Linear, like
 * Cookie Clicker's, so level 10 costs ten manna — about a week of patience for
 * one percent, which is precisely the pace this layer is meant to run at.
 */
export function levelCost(level: number): number {
  return level + 1;
}

/** Output bonus from Manna levels: +1% per level. */
export function levelMultiplier(level: number): number {
  return 1 + level * 0.01;
}
