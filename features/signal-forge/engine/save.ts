/**
 * Signal Forge cloud save format (v2).
 *
 * The saved blob (SignalForgePlayer.savedRunState) is `{ v: 2, run, meta }`: the run in progress (or null) plus
 * the player's progression (highest ascension unlocked, wins, tutorial flag). A pre-rework blob has no `v`
 * (it was the old engine's flat GameState: `floor`, `playerHp`, `deckList`...). It cannot be played by the new
 * engine, so it is RETIRED cleanly: the menu says so, shows the floor and score it reached (its leaderboard
 * row is untouched), and the next save replaces it. Nothing here throws on any input.
 */
import { MAX_ASCENSION } from './balance';
import { hasCard } from './data/cards';
import { hasRelicDef } from './data/relics';
import type { RunState } from './types';

export const SAVE_VERSION = 2 as const;

export interface SaveMeta {
  /** Highest ascension the player may start (0 until the first win). */
  ascensionUnlocked: number;
  wins: number;
  runs: number;
  tutorialDone: boolean;
}

export interface SaveBlob {
  v: typeof SAVE_VERSION;
  run: RunState | null;
  meta: SaveMeta;
}

export const DEFAULT_META: SaveMeta = { ascensionUnlocked: 0, wins: 0, runs: 0, tutorialDone: false };

export type ClassifiedSave =
  | { kind: 'none'; meta: SaveMeta }
  | { kind: 'run'; run: RunState; meta: SaveMeta }
  | { kind: 'retired'; floor: number; score: number; meta: SaveMeta };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);

export function readMeta(raw: unknown): SaveMeta {
  if (!isObj(raw)) return { ...DEFAULT_META };
  return {
    ascensionUnlocked: Math.max(0, Math.min(MAX_ASCENSION, Math.floor(num(raw.ascensionUnlocked, 0)))),
    wins: Math.max(0, Math.floor(num(raw.wins, 0))),
    runs: Math.max(0, Math.floor(num(raw.runs, 0))),
    tutorialDone: raw.tutorialDone === true,
  };
}

/** Whether a v2 run is structurally sound and only names content this build knows. */
export function isPlayableRun(x: unknown): x is RunState {
  if (!isObj(x) || x.v !== SAVE_VERSION) return false;
  if (typeof x.hp !== 'number' || typeof x.maxHp !== 'number' || typeof x.seed !== 'number' || typeof x.rng !== 'number') return false;
  if (!Array.isArray(x.deck) || !Array.isArray(x.map) || !Array.isArray(x.relics) || typeof x.phase !== 'string') return false;
  if (x.act !== 1 && x.act !== 2 && x.act !== 3) return false;
  if (!x.deck.every((c) => isObj(c) && typeof c.id === 'string' && hasCard(c.id))) return false;
  if (!x.relics.every((r) => typeof r === 'string' && hasRelicDef(r))) return false;
  if (!isObj(x.stats)) return false;
  return true;
}

/** Sort whatever the server returned into: nothing, a playable run, or a retired pre-rework run. */
export function classifySave(raw: unknown): ClassifiedSave {
  if (!isObj(raw)) return { kind: 'none', meta: { ...DEFAULT_META } };
  if (raw.v === SAVE_VERSION) {
    const meta = readMeta(raw.meta);
    if (raw.run === null || raw.run === undefined) return { kind: 'none', meta };
    if (isPlayableRun(raw.run)) return { kind: 'run', run: raw.run, meta };
    // A v2 run that no longer validates (content removed later) is retired too, never crashed on.
    const run = raw.run as Record<string, unknown>;
    return { kind: 'retired', floor: Math.max(1, num(run.row, 0) + 1), score: num(run.score, 0), meta };
  }
  // The old engine's flat state.
  if (typeof raw.floor === 'number' || typeof raw.playerHp === 'number') {
    return { kind: 'retired', floor: Math.max(1, Math.floor(num(raw.floor, 1))), score: Math.max(0, Math.floor(num(raw.score, 0))), meta: { ...DEFAULT_META } };
  }
  return { kind: 'none', meta: { ...DEFAULT_META } };
}

export function makeBlob(run: RunState | null, meta: SaveMeta): SaveBlob {
  return { v: SAVE_VERSION, run: run && !run.tutorial ? run : null, meta };
}

/** Meta after a finished run: a win unlocks the next ascension. */
export function metaAfterRun(meta: SaveMeta, run: RunState): SaveMeta {
  const won = run.phase === 'victory';
  return {
    ...meta,
    runs: meta.runs + 1,
    wins: meta.wins + (won ? 1 : 0),
    ascensionUnlocked: won ? Math.min(MAX_ASCENSION, Math.max(meta.ascensionUnlocked, run.ascension + 1)) : meta.ascensionUnlocked,
  };
}
